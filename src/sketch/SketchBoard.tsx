import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { SKETCH_WIDTH as W, SKETCH_HEIGHT as H, sketchColors, makeSketchItem, eraseSketch, itemBounds, moveSketchItem, resizeSketchItem, type Point, type Sketch, type SketchItem, type ShapeKind } from '../../shared/sketch';
import { useSketch } from './useSketch';
import { SketchToolIcon } from './SketchDrawing';
import { SketchElement } from './SketchElement';
import { createFrameScheduler } from './frameScheduler';
import { listenToSketchPointer, type PointerSessionHandlers, type SketchPointerEvent } from './pointerSession';
import { sketchPerformance, SketchPerformanceReport } from './performance';

type Tool='select'|'pen'|'pan'|ShapeKind;
type Gesture={mode:'pen'|'create'|'move'|'resize'|'pan'|'dock';id:number;start:Point;client:Point;base:SketchItem[];item?:SketchItem;points:Point[];moved:boolean;scroll?:Point;eraserSize?:{width:number;height:number};size:number};
const shapes:[ShapeKind,string][]=[['rect','Блок'],['ellipse','Овал'],['diamond','Решение'],['database','База'],['arrow','Стрелка'],['text','Текст']];
const names:Record<Tool,string>={select:'Выбрать',pen:'Маркер',pan:'Рука',rect:'Блок',ellipse:'Овал',diamond:'Решение',database:'База',arrow:'Стрелка',text:'Текст'};
export const SketchBoard=memo(function SketchBoard({initial,active,onSaved}:{initial:Sketch;active:boolean;onSaved:(value:Sketch)=>void}) {
  const renderStart=sketchPerformance.renderStart();
  useLayoutEffect(()=>{sketchPerformance.commit(renderStart);});
  const doc=useSketch(initial,onSaved),[tool,setTool]=useState<Tool>('pen'),[color,setColor]=useState<SketchItem['color']>(sketchColors[0]),[weight,setWeight]=useState(3);
  const [preview,setPreview]=useState<SketchItem[]|null>(null),[selected,setSelected]=useState<string|null>(null),[editing,setEditing]=useState<{id:string;text:string}|null>(null);
  const [zoom,setZoom]=useState(1),[message,setMessage]=useState(''),[help,setHelp]=useState(false);
  const [eraser,setEraser]=useState<{x:number;y:number;width:number;height:number;returning:boolean}|null>(null),[wiping,setWiping]=useState(false);
  const viewport=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),dock=useRef<HTMLButtonElement>(null),root=useRef<HTMLElement>(null),gesture=useRef<Gesture|null>(null),previewRef=useRef<SketchItem[]|null>(null),returnTimer=useRef<ReturnType<typeof setTimeout>|null>(null),textarea=useRef<HTMLTextAreaElement>(null);
  const captureTarget=useRef<SVGSVGElement|HTMLButtonElement|null>(null);
  const labelEditor=useRef<HTMLFormElement>(null);
  const [editorSize,setEditorSize]=useState<[number,number]>([300,260]),[viewScroll,setViewScroll]=useState<Point>([0,0]);
  const pointerHandlers=useRef<PointerSessionHandlers>(null!);
  pointerHandlers.current={active:()=>gesture.current?.id??null,move:e=>sketchPerformance.move(()=>move(e)),finish:up,interrupt:finishInterrupted};
  useEffect(()=>listenToSketchPointer(window,()=>pointerHandlers.current),[]);
  const lastTap=useRef<{id:string;time:number}|null>(null);
  const [viewportSize,setViewportSize]=useState<[number,number]>([W,H]);
  const scale=zoom,shown=preview||doc.items,chosen=shown.find(i=>i.id===selected);
  const extent=useMemo(()=>doc.items.reduce((size,item)=>{const b=itemBounds(item);return [Math.max(size[0],b.x+b.w+30),Math.max(size[1],b.y+b.h+30)];},[W,H]),[doc.items]);
  const canvasWidth=Math.max(viewportSize[0],extent[0]*scale),canvasHeight=Math.max(viewportSize[1],extent[1]*scale);
  const previewFrames=useMemo(()=>createFrameScheduler<SketchItem[]>(setPreview,requestAnimationFrame,cancelAnimationFrame),[]);
  const show=(items:SketchItem[]|null)=>{
    previewRef.current=items;
    if(items)previewFrames.schedule(items);else{previewFrames.cancel();setPreview(null);}
  };
  useEffect(()=>()=>previewFrames.cancel(),[previewFrames]);
  useEffect(()=>{const node=viewport.current;if(!node)return;const resize=()=>{if(node.clientWidth&&node.clientHeight){setViewportSize([node.clientWidth,node.clientHeight]);}};const observer=new ResizeObserver(resize);observer.observe(node);resize();return()=>observer.disconnect();},[]);
  useLayoutEffect(()=>{const node=labelEditor.current;if(!node)return;const measure=()=>setEditorSize([node.offsetWidth,node.offsetHeight]);measure();const observer=new ResizeObserver(measure);observer.observe(node);textarea.current?.focus({preventScroll:true});return()=>observer.disconnect();},[editing?.id]);
  useEffect(()=>{if(!editing||editing.text===(doc.items.find(i=>i.id===editing.id)?.text??''))return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[editing,doc.items]);
  useEffect(()=>()=>{if(returnTimer.current)clearTimeout(returnTimer.current);},[]);
  useEffect(()=>{if(!active){if(editing)finishLabel();gesture.current=null;show(null);setWiping(false);setEraser(null);}},[active]);
  useEffect(()=>{if(!message)return;const id=setTimeout(()=>setMessage(''),5000);return()=>clearTimeout(id);},[message]);
  const point=(e:{clientX:number;clientY:number}):Point=>{const rect=svg.current!.getBoundingClientRect();return [(e.clientX-rect.left)/scale,(e.clientY-rect.top)/scale];};
  const inside=(e:{clientX:number;clientY:number})=>{const r=viewport.current!.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;};
  function startEdit(item:SketchItem){if(item.kind==='pen')return;setSelected(item.id);setEditing({id:item.id,text:item.text});}
  function finishLabel(){
    if(!editing)return;
    const text=editing.text.trim();doc.change(doc.items.map(i=>{
      if(i.id!==editing.id)return i;
      const lines=text.split('\n').reduce((n,s)=>n+Math.max(1,Math.ceil(s.length/Math.max(4,Math.floor((i.w-24)/14)))),0);
      return {...i,text,h:i.kind==='arrow'?i.h:Math.max(i.h,Math.min(H,lines*34+(i.kind==='diamond'?70:25)))};
    }));setEditing(null);root.current?.focus();
  }
  function pick(next:Tool){if(editing)finishLabel();setTool(next);if(next!=='select')setSelected(null);setMessage(next==='pen'?'Рисуйте мышью, пальцем или пером':next==='select'?'Выберите элемент. Потяните за угол, чтобы изменить размер.':next==='pan'?'Потяните элемент, чтобы переместить. На пустом месте — двигайте холст.':`Нажмите на доску, чтобы добавить: ${names[next].toLowerCase()}`);}
  function down(e:ReactPointerEvent<SVGSVGElement>){
    if(e.button!==0||editing)return;
    sketchPerformance.begin(doc.items.length);
    if(gesture.current){if(gesture.current.id!==e.pointerId)return;finishInterrupted();}
    e.preventDefault();root.current?.focus({preventScroll:true});captureTarget.current=e.currentTarget;e.currentTarget.setPointerCapture(e.pointerId);
    const p=point(e),target=e.target as Element,hitId=target.closest('[data-sketch-id]')?.getAttribute('data-sketch-id'),hit=doc.items.find(i=>i.id===hitId);
    const base:Gesture={mode:'pen',id:e.pointerId,start:p,client:[e.clientX,e.clientY],base:doc.items,points:[],moved:false,size:0};
    if(target.closest('[data-resize]')&&chosen){gesture.current={...base,mode:'resize',item:chosen};return;}
    if(tool==='pan'){
      setSelected(hit?.id||null);
      gesture.current=hit?{...base,mode:'move',item:hit}:{...base,mode:'pan',scroll:[viewport.current!.scrollLeft,viewport.current!.scrollTop]};return;
    }
    if(tool==='select'){
      setSelected(hit?.id||null);if(hit)gesture.current={...base,mode:'move',item:hit};return;
    }
    const item=makeSketchItem(tool,p[0],p[1],color,weight);
    if(tool!=='pen'){item.x=Math.min(canvasWidth/scale-item.w,Math.max(0,item.x));item.y=Math.min(canvasHeight/scale-item.h,Math.max(0,item.y));}
    gesture.current={...base,mode:tool==='pen'?'pen':'create',item};show([...doc.items,item]);
  }
  function move(e:SketchPointerEvent){
    const g=gesture.current;if(!g||g.id!==e.pointerId)return;
    e.preventDefault();const p=point(e),distance=Math.hypot(e.clientX-g.client[0],e.clientY-g.client[1]);if(distance>4)g.moved=true;
    if(g.mode==='pan'){viewport.current!.scrollLeft=g.scroll![0]-(e.clientX-g.client[0]);viewport.current!.scrollTop=g.scroll![1]-(e.clientY-g.client[1]);return;}
    if(g.mode==='dock'){
      if(g.mode==='dock'&&!g.moved)return;
      setWiping(true);setEraser({x:e.clientX,y:e.clientY,...g.eraserSize!,returning:false});
      if(inside(e)&&g.points.length<3000){const last=g.points.at(-1);if(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>1){g.points.push(p);show(eraseSketch(g.base,g.points,g.size));}}
      return;
    }
    const item=g.item!;let next=item;
    if(g.mode==='pen'){
      const native=e.nativeEvent??e;
      const events=native.getCoalescedEvents?.()||[native];
      // All coalesced samples share this event's canvas transform; avoid a DOM
      // geometry read for every sample from a high-frequency mouse or pen.
      const points=[...item.points];for(const event of events.length?events:[native]){const q:Point=[p[0]+(event.clientX-e.clientX)/scale,p[1]+(event.clientY-e.clientY)/scale],last=points.at(-1)!;const local:Point=[Math.max(-10000,Math.min(10000,q[0]-item.x)),Math.max(-10000,Math.min(10000,q[1]-item.y))];if(points.length<4000&&Math.hypot(local[0]-last[0],local[1]-last[1])>.7)points.push(local);}
      next={...item,points};g.item=next;
    } else if(g.mode==='move')next=moveSketchItem(item,p[0]-g.start[0],p[1]-g.start[1]);
    else if(g.mode==='resize'){if(!g.moved)return;const b=item.kind==='pen'?itemBounds(item):item;next=resizeSketchItem(item,b.w+p[0]-g.start[0],b.h+p[1]-g.start[1]);}
    else if(g.moved&&item.kind!=='text'){
      next=item.kind==='arrow'?{...item,x:g.start[0],y:g.start[1],w:p[0]-g.start[0],h:p[1]-g.start[1]}:{...item,x:Math.min(p[0],g.start[0]),y:Math.min(p[1],g.start[1]),w:Math.max(50,Math.abs(p[0]-g.start[0])),h:Math.max(40,Math.abs(p[1]-g.start[1]))};
    }
    show(g.mode==='pen'||g.mode==='create'?[...g.base,next]:g.base.map(i=>i.id===item.id?next:i));
  }
  function returnEraser(){
    setWiping(false);const r=dock.current?.getBoundingClientRect();
    if(r)setEraser({x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,returning:true});
    if(returnTimer.current)clearTimeout(returnTimer.current);returnTimer.current=setTimeout(()=>setEraser(null),260);
  }
  function clear(){if(!doc.items.length)return;doc.change([]);setSelected(null);setMessage('Эскиз очищен. Можно отменить.');}
  function up(e:SketchPointerEvent){
    const g=gesture.current;if(!g||g.id!==e.pointerId)return;
    sketchPerformance.end();
    // Include the release position even when a quick gesture has no final move.
    move(e);gesture.current=null;
    if(g.mode==='dock'&&!g.moved){clear();setEraser(null);setWiping(false);}else{
      const next=previewRef.current;if(next)doc.change(next);
      if(g.mode==='move'&&g.item&&!g.moved){const now=performance.now();if(lastTap.current?.id===g.item.id&&now-lastTap.current.time<450){startEdit(g.item);lastTap.current=null;}else lastTap.current={id:g.item.id,time:now};}
      if(g.mode==='create'&&g.item){const item=next?.find(i=>i.id===g.item!.id)||g.item;setTool('select');startEdit(item);}
      if(g.mode==='dock')returnEraser();
    }
    show(null);releasePointer(g.id);
  }
  function releasePointer(id:number){const target=captureTarget.current;captureTarget.current=null;if(target?.hasPointerCapture(id))target.releasePointerCapture(id);}
  function finishInterrupted(){
    sketchPerformance.end();
    const g=gesture.current;if(!g)return;gesture.current=null;
    // Browser cancellation has no trustworthy final coordinates. Preserve the
    // last visible result; only an explicit Escape discards an unfinished edit.
    if(previewRef.current)doc.change(previewRef.current);
    show(null);releasePointer(g.id);
    if(g.mode==='dock')returnEraser();
  }
  function cancel(){const g=gesture.current;gesture.current=null;show(null);if(g)releasePointer(g.id);if(g?.mode==='dock')returnEraser();setMessage('Действие отменено');}
  function dockDown(e:ReactPointerEvent<HTMLButtonElement>){
    if(e.button!==0||editing||gesture.current)return;e.preventDefault();captureTarget.current=e.currentTarget;e.currentTarget.setPointerCapture(e.pointerId);if(returnTimer.current)clearTimeout(returnTimer.current);setEraser(null);
    const size=e.currentTarget.getBoundingClientRect();
    gesture.current={mode:'dock',id:e.pointerId,start:point(e),client:[e.clientX,e.clientY],base:doc.items,points:[],moved:false,eraserSize:{width:size.width,height:size.height},size:Math.min(512,size.width*.85/scale)};
  }
  const changeColor=(value:SketchItem['color'])=>{setColor(value);if(chosen&&tool==='select')doc.change(doc.items.map(i=>i.id===chosen.id?{...i,color:value}:i));};
  const changeWeight=(value:number)=>{setWeight(value);if(chosen&&tool==='select')doc.change(doc.items.map(i=>i.id===chosen.id?{...i,weight:value}:i));};
  const bounds=chosen?itemBounds(chosen):null;
  const handle=chosen&&bounds?{x:chosen.kind==='arrow'?chosen.x+chosen.w:bounds.x+bounds.w,y:chosen.kind==='arrow'?chosen.y+chosen.h:bounds.y+bounds.h}:null;
  const selection=bounds?{x:bounds.x-9/scale,y:bounds.y-12/scale,w:Math.max(25/scale,bounds.w+18/scale),h:Math.max(24/scale,bounds.h+24/scale)}:null;
  const editedItem=editing?shown.find(item=>item.id===editing.id):null;
  let editorPosition={left:0,top:0};
  if(editedItem&&viewport.current){
    const view=viewport.current,b=itemBounds(editedItem),[width,height]=editorSize;
    const left=view.offsetLeft+b.x*scale-viewScroll[0],top=view.offsetTop+b.y*scale-viewScroll[1];
    const minLeft=viewportSize[0]>=width+16?view.offsetLeft+8:8;
    const maxLeft=Math.max(minLeft,view.offsetLeft+viewportSize[0]-width-8);
    const right=left+b.w*scale+16;
    editorPosition={left:Math.max(minLeft,Math.min(maxLeft,right<=maxLeft?right:left-width-16)),top:Math.max(view.offsetTop+8,Math.min(view.offsetTop+viewportSize[1]-height-8,top))};
  }
  const actionWidth=chosen?.kind==='pen'?28:60;
  const deleteChosen=()=>{if(!chosen)return;doc.change(doc.items.filter(i=>i.id!==chosen.id));setSelected(null);setMessage('Элемент удалён. Ctrl/⌘ Z — отменить.');root.current?.focus({preventScroll:true});};
  const penCursor=`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M4 28 8 17 23 2 30 9 15 24Z' fill='white' stroke='#26344a' stroke-width='1.5'/><path d='m8 17 7 7-11 4Z' fill='${color}'/><path d='m21 4 7 7' stroke='${color}' stroke-width='5'/></svg>`)}") 4 28, crosshair`;
  return <section ref={root} hidden={!active} className={`sketch-view ${wiping?'is-wiping':''}`} aria-label="Эскиз" tabIndex={-1} onKeyDown={e=>{
    if((e.target as HTMLElement).matches('input,textarea,select'))return;
    if(e.key==='Escape'){cancel();setSelected(null);setEditing(null);return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)doc.redo();else doc.undo();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();doc.redo();return;}
    if(chosen&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();deleteChosen();}
    if(chosen&&e.key==='Enter'){e.preventDefault();startEdit(chosen);}
    if(chosen&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const d=e.shiftKey?10:1;doc.change(doc.items.map(i=>i.id===chosen.id?moveSketchItem(i,e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0):i));}
    if(!e.ctrlKey&&!e.metaKey){const hot:Record<string,Tool>={v:'select',b:'pen',h:'pan',t:'text'};if(hot[e.key.toLowerCase()])pick(hot[e.key.toLowerCase()]);}
  }}>
    <div className="sketch-tools" role="toolbar" aria-label="Инструменты эскиза">
      <div className="sketch-tool-group">{(['select','pen','pan'] as const).map(t=><button key={t} className="sketch-tool" title={names[t]} aria-label={names[t]} aria-pressed={tool===t} onClick={()=>pick(t)}><SketchToolIcon kind={t}/>{t==='pen'&&<span>Маркер</span>}</button>)}</div>
      <div className="sketch-tool-group" role="group" aria-label="Цвет маркера">{sketchColors.map((c,i)=><button key={c} className="sketch-color" aria-label={['Синий','Чёрный','Красный','Зелёный'][i]} aria-pressed={(chosen&&tool==='select'?chosen.color:color)===c} onClick={()=>changeColor(c)}><span style={{backgroundColor:c}}/></button>)}</div>
      <div className="sketch-tool-group" role="group" aria-label="Толщина маркера">{[2,3,6].map((n,i)=><button key={n} className="sketch-width" aria-label={['Тонкая линия','Средняя линия','Толстая линия'][i]} aria-pressed={(chosen&&tool==='select'?chosen.weight:weight)===n} onClick={()=>changeWeight(n)}><svg width="32" height="20" aria-hidden="true"><path d="M4 11Q14 9 28 10" stroke="currentColor" strokeWidth={n} fill="none" strokeLinecap="round"/></svg></button>)}</div>
      <div className="sketch-tool-group"><button aria-label="Отменить действие" title="Отменить · Ctrl/⌘ Z" disabled={!doc.canUndo||!!editing||wiping} onClick={doc.undo}><SketchToolIcon kind="undo"/></button><button aria-label="Повторить действие" title="Повторить · Ctrl/⌘ Shift Z" disabled={!doc.canRedo||!!editing||wiping} onClick={doc.redo}><SketchToolIcon kind="redo"/></button></div>
      <button className="sketch-help-toggle" aria-expanded={help} aria-label="Как рисовать?" onClick={()=>setHelp(!help)}><span>Как рисовать?</span><b aria-hidden="true">?</b></button>
    </div>
    <div className="sketch-shapes" role="toolbar" aria-label="Готовые блоки"><span>Добавить:</span>{shapes.map(([kind,label])=><button key={kind} aria-label={`Добавить: ${label}`} aria-pressed={tool===kind} onClick={()=>pick(kind)}><SketchToolIcon kind={kind}/><span>{label}</span></button>)}</div>
    {help&&<div className="sketch-help"><p><b>Маркер</b> — рисуйте свободно. <b>Блоки</b> — выберите и нажмите на холст или растяните до нужного размера. <b>Подпись</b> — двойное нажатие на блок или стрелку. <b>Выбрать</b> — переместите элемент или потяните его угол. <b>Рука</b> — перетаскивайте элементы; на пустом месте — двигайте холст.</p><p>Стиратель: нажать — очистить всё, потянуть — стереть часть. Отпустите, и губка вернётся на место. Ctrl/⌘ Z отменяет действие. На телефоне используйте масштаб и «Руку».</p></div>}
    {doc.error&&<div className="sketch-error" role="alert"><span>{doc.error}</span><button disabled={doc.saving} onClick={()=>void doc.save()}>Повторить сохранение</button><button disabled={doc.saving} onClick={()=>{if(window.confirm('Заменить сохранённый эскиз вашим черновиком?'))void doc.save(true);}}>Сохранить мой эскиз</button><button disabled={doc.saving} onClick={()=>{if(window.confirm('Отбросить черновик и загрузить эскиз из базы?'))void doc.loadServer();}}>Загрузить из базы</button></div>}
    <div className="sketch-workspace">
      <div className={`sketch-dock ${eraser?'empty':''}`}>
        <button ref={dock} className="sketch-eraser" aria-describedby="sketch-eraser-tip" aria-label="Стиратель: нажать — очистить всё, потянуть — стереть часть" onPointerDown={dockDown} onClick={e=>{if(e.detail===0)clear();}} disabled={!!editing} onContextMenu={e=>e.preventDefault()}><img src="/materials/sketch-eraser.png" alt="" draggable={false}/></button>
        <div id="sketch-eraser-tip" className="sketch-eraser-tip">Нажать —<br/>очистить всё<br/><span>Потянуть —<br/>стереть часть</span></div>
      </div>
      <div className="sketch-viewport" ref={viewport} onScroll={e=>setViewScroll([e.currentTarget.scrollLeft,e.currentTarget.scrollTop])}>
        <svg ref={svg} className={`sketch-canvas tool-${tool}`} width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth/scale} ${canvasHeight/scale}`} role="group" aria-label="Холст эскиза" style={{cursor:tool==='pen'?penCursor:undefined}} onPointerDown={down} onContextMenu={e=>e.preventDefault()} onDoubleClick={e=>{const id=(e.target as Element).closest('[data-sketch-id]')?.getAttribute('data-sketch-id');const item=doc.items.find(i=>i.id===id);if(item)startEdit(item);}}>
          {shown.map(item=><SketchElement key={item.id} item={item} selected={item.id===selected} interactive={tool==='select'||tool==='pan'} editingText={editing?.id===item.id?editing.text:undefined} onSelect={setSelected}/>)}
          {selection&&tool==='select'&&!wiping&&<g className="sketch-selection"><rect x={selection.x} y={selection.y} width={selection.w} height={selection.h} fill="none" stroke="#436bb0" strokeWidth={1.1/scale} strokeDasharray={`${5/scale} ${4/scale}`} pointerEvents="none"/>{handle&&<g data-resize="true" role="button" aria-label="Изменить размер элемента" style={{cursor:'nwse-resize'}}>
            <rect x={handle.x-16/scale} y={handle.y-16/scale} width={32/scale} height={32/scale} fill="transparent" pointerEvents="all"/>
            <rect x={handle.x-8/scale} y={handle.y-8/scale} width={16/scale} height={16/scale} fill="#f7f5ec" stroke="#436bb0" strokeWidth={1.5/scale} pointerEvents="none"/>
          </g>}</g>}
          {chosen&&selection&&!editing&&!wiping&&tool==='select'&&<foreignObject
            x={Math.max(0,Math.min(canvasWidth/scale-actionWidth/scale,selection.x+selection.w-actionWidth/scale))}
            y={selection.y>=34/scale?selection.y-34/scale:Math.max(0,selection.y+4/scale)} width={actionWidth/scale} height={28/scale}>
            <div className="sketch-element-actions" style={{width:actionWidth,transform:`scale(${1/scale})`}}
              onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}
              onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();}}>
              {chosen.kind!=='pen'&&<button title="Изменить подпись" aria-label="Изменить подпись" onClick={()=>startEdit(chosen)}><SketchToolIcon kind="pen"/></button>}
              <button className="sketch-delete" title="Удалить элемент" aria-label="Удалить элемент" onClick={deleteChosen}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6.5q8-1 16 0M9 5V3.5h6V5M6 8l.7 12q5.3 1 10.6 0L18 8M10 10l.2 7M14 10l-.2 7"/></svg>
              </button>
            </div>
          </foreignObject>}
        </svg>
        {!doc.items.length&&!preview&&<div className="sketch-empty" aria-hidden="true"><h2>Место для новой идеи</h2><p>Рисуйте маркером или добавьте готовый блок.<br/>Подписи можно печатать с клавиатуры.</p><span>↖ выберите инструмент</span></div>}
      </div>
      {editing&&<form ref={labelEditor} className="sketch-label-editor" style={{...editorPosition,maxHeight:Math.max(100,viewportSize[1]-16)}} onSubmit={e=>{e.preventDefault();finishLabel();}}><label htmlFor="sketch-label">Подпись</label><textarea id="sketch-label" ref={textarea} maxLength={500} rows={3} value={editing.text} placeholder="Название блока или стрелки…" onChange={e=>setEditing({...editing,text:e.target.value})} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setEditing(null);}else if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();finishLabel();}}}/><small>Enter — готово · Shift + Enter — новая строка</small><div><button className="marker-button" type="submit">Готово</button><button type="button" onClick={()=>setEditing(null)}>Отмена</button></div></form>}
    </div>
    <div className="sketch-bottom"><div className="sketch-context"><span role="status">{chosen&&tool==='select'?'':message||`${names[tool]} · ${tool==='pen'?'свободный рисунок':tool==='select'?'выберите элемент и потяните за угол':'нажмите или потяните на холсте'}`}</span>{message.startsWith('Эскиз очищен')&&doc.canUndo&&<button onClick={()=>{doc.undo();setMessage('Очистка отменена');}}>Отменить</button>}</div><div className="sketch-zoom"><button aria-label="Уменьшить масштаб" onClick={()=>setZoom(Math.max(.2,scale-.15))}>−</button><button aria-label="Вписать холст" title="Вписать холст" onClick={()=>setZoom(Math.min(viewportSize[0]/extent[0],viewportSize[1]/extent[1]))}>{Math.round(scale*100)}%</button><button aria-label="Увеличить масштаб" onClick={()=>setZoom(Math.min(2,scale+.15))}>+</button></div><span className="sketch-save" role="status">{doc.error?'Не сохранено':editing?'Редактирование подписи':doc.saving?'Сохраняю…':doc.dirty?'Есть изменения':'Сохранено ✓'}</span></div>
    {eraser&&createPortal(<img className={`sketch-floating-eraser ${eraser.returning?'returning':''}`} src="/materials/sketch-eraser.png" alt="" draggable={false} style={{left:eraser.x,top:eraser.y,width:eraser.width,height:eraser.height}}/>,document.body)}
    <SketchPerformanceReport/>
  </section>;
});
