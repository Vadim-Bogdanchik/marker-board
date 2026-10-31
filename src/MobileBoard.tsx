import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, pointerWithin, MeasuringStrategy, type CollisionDetection, type DragMoveEvent } from '@dnd-kit/core';
import { ownerId, type Board, type Task } from '../shared/model';
import { CardBody, MarkerOrderArrow, type Act } from './BoardView';
import { PaperSurface } from './BoardMaterials';
import { placementOf, previewMove, type Placement } from './boardMovement';
import { mobileOrder, mobilePlacement } from './mobileMovement';
import { Icon, Modal } from './ui';
import type { CardDensity } from './viewPreferences';

type Nodes=React.RefObject<Map<string,HTMLElement>>;
function MobileGrip() {
  return <svg width="20" height="25" viewBox="0 0 20 25" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m5 4 .2 2m9-2-.2 2M5.4 11l-.3 2m9-2 .2 2M5 18l.3 2m8.7-2-.2 2"/></svg>;
}
function MobileCard({board,task,index,count,onOpen,onMenu,onOrder,busy,dragging,nodes,insertBefore,landing}:{board:Board;task:Task;index:number;count:number;onOpen:(task:Task)=>void;onMenu:(task:Task)=>void;onOrder:(id:string,direction:-1|1)=>void;busy:boolean;dragging:boolean;nodes:Nodes;insertBefore:boolean;landing:boolean}) {
  const {attributes,listeners,setNodeRef:setDragRef,setActivatorNodeRef,isDragging}=useDraggable({id:task.id,disabled:busy});
  const {setNodeRef:setDropRef}=useDroppable({id:task.id,data:{columnId:task.columnId},disabled:busy});
  const register=useCallback((node:HTMLElement|null)=>{setDragRef(node);setDropRef(node);if(node)nodes.current.set(task.id,node);else nodes.current.delete(task.id);},[setDragRef,setDropRef,nodes,task.id]);
  return <article ref={register} className={`note mobile-draggable ${task.category} ${isDragging?'mobile-drag-source':''} ${insertBefore?'mobile-insert-before':''} ${landing?'mobile-landing':''}`} data-task-id={task.id}>
    <PaperSurface/>
    <button className="note-open" {...listeners} onContextMenu={e=>e.preventDefault()} aria-label={`Открыть задачу: ${task.title}`} onClick={()=>onOpen(task)} disabled={busy}><CardBody board={board} task={task}/></button>
    <button className="card-menu" disabled={busy||dragging} aria-label={`Действия: ${task.title}`} onClick={()=>onMenu(task)}><Icon name="more"/></button>
    <div className="mobile-card-controls">
      <button ref={setActivatorNodeRef} className="mobile-drag-handle" {...attributes} {...listeners} aria-label={`Перенести: ${task.title}`} title="Потяните за ручку, чтобы перенести стикер" onContextMenu={e=>e.preventDefault()} onClick={()=>onMenu(task)} disabled={busy}><MobileGrip/><span>Перенести</span></button>
      <button className="mobile-order-button" disabled={busy||dragging||index===0} aria-label={`Выше: ${task.title}`} title="Передвинуть выше" onClick={()=>onOrder(task.id,-1)}><MarkerOrderArrow direction="up"/></button>
      <button className="mobile-order-button" disabled={busy||dragging||index===count-1} aria-label={`Ниже: ${task.title}`} title="Передвинуть ниже" onClick={()=>onOrder(task.id,1)}><MarkerOrderArrow direction="down"/></button>
    </div>
  </article>;
}
function MobileStage({id,highlight,children}:{id:string;highlight:boolean;children:ReactNode}) {
  const {setNodeRef}=useDroppable({id,data:{columnId:id}});
  return <section ref={setNodeRef} data-mobile-column={id} className={`mobile-stage ${highlight?'mobile-drop-stage':''}`}>{children}</section>;
}

export function MobileBoard({board,tasks,density,filterKey,revealTaskId,onRevealed,onOpen,onAdd,onRename,act,busy}:{board:Board;tasks:Task[];density:CardDensity;filterKey:string;revealTaskId:string|null;onRevealed:()=>void;onOpen:(task:Task)=>void;onAdd:(id:string)=>void;onRename:(id:string)=>void;act:Act;busy:boolean}) {
  const listRef=useRef<HTMLDivElement>(null),nodes=useRef(new Map<string,HTMLElement>());
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});
  const [menu,setMenu]=useState<Task|null>(null),[destination,setDestination]=useState('');
  const [moving,setMoving]=useState(false),[message,setMessage]=useState('');
  const [dragging,setDragging]=useState<Task|null>(null),[drop,setDrop]=useState<Placement|null>(null),[preview,setPreview]=useState<Task[]|null>(null),[landing,setLanding]=useState<string|null>(null);
  const dragRef=useRef<Task|null>(null),point=useRef<{x:number;y:number}|null>(null),pending=useRef(false),suppressClickUntil=useRef(0);
  const releasePoint=useRef<{x:number;y:number}|null>(null);
  const hoverTimer=useRef<ReturnType<typeof setTimeout>|null>(null),hoverColumn=useRef<string|null>(null),overlayWidth=useRef(300);
  const shown=preview||tasks;
  const sensors=useSensors(useSensor(MouseSensor,{activationConstraint:{distance:7}}),useSensor(TouchSensor,{activationConstraint:{delay:220,tolerance:8},bypassActivationConstraint:({event})=>event.target instanceof Element&&!!event.target.closest('.mobile-drag-handle')}));
  useEffect(()=>{
    // A fast touchmove + touchend can arrive before React renders dnd-kit's
    // latest delta. Keep native coordinates for the final drop as well.
    const pointerMove=(event:PointerEvent)=>{releasePoint.current={x:event.clientX,y:event.clientY};};
    const touchMove=(event:TouchEvent)=>{const touch=event.touches[0]||event.changedTouches[0];if(touch)releasePoint.current={x:touch.clientX,y:touch.clientY};};
    document.addEventListener('pointerdown',pointerMove,true);
    document.addEventListener('pointermove',pointerMove,true);
    document.addEventListener('pointerup',pointerMove,true);
    document.addEventListener('touchmove',touchMove,{capture:true,passive:true});
    document.addEventListener('touchend',touchMove,{capture:true,passive:true});
    return()=>{document.removeEventListener('pointerdown',pointerMove,true);document.removeEventListener('pointermove',pointerMove,true);document.removeEventListener('pointerup',pointerMove,true);document.removeEventListener('touchmove',touchMove,true);document.removeEventListener('touchend',touchMove,true);};
  },[]);
  const clearHover=()=>{if(hoverTimer.current)clearTimeout(hoverTimer.current);hoverTimer.current=null;hoverColumn.current=null;};
  useEffect(()=>()=>clearHover(),[]);
  useEffect(()=>{
    setCollapsed(Object.fromEntries(board.columns.map(c=>[c.id,filterKey?!tasks.some(t=>t.columnId===c.id):c.stage!=='doing'&&c.stage!=='review'&&(c.stage!=='inbox'||board.tasks.length>0)])));
    if(listRef.current)listRef.current.scrollTop=0;
    // Reset the expansion only for a new query/board, not after each save.
  },[filterKey,board.id]);
  const focusCard=(id:string,control='.mobile-drag-handle')=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const card=nodes.current.get(id);card?.querySelector<HTMLButtonElement>(control)?.focus({preventScroll:true});card?.scrollIntoView({block:'nearest'});
  }));
  useEffect(()=>{
    if(!revealTaskId)return;
    const added=board.tasks.find(t=>t.id===revealTaskId);if(!added)return;
    setCollapsed(current=>({...current,[added.columnId]:false}));
    let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
      const card=nodes.current.get(added.id);card?.querySelector<HTMLButtonElement>('.note-open')?.focus({preventScroll:true});card?.scrollIntoView({block:'nearest'});onRevealed();
    });});
    return()=>cancelAnimationFrame(frame);
  },[revealTaskId,board.tasks,onRevealed]);
  function open(task:Task){if(!pending.current&&!dragRef.current&&Date.now()>suppressClickUntil.current)onOpen(task);}
  function openMenu(task:Task){if(!pending.current&&!dragRef.current&&Date.now()>suppressClickUntil.current){setMenu(task);setDestination(task.columnId);}}
  const task=menu&&board.tasks.find(t=>t.id===menu.id);
  const siblings=task?tasks.filter(t=>t.columnId===task.columnId):[];
  const index=task?siblings.findIndex(t=>t.id===task.id):-1;
  async function commit(id:string,placement:Placement){
    if(busy||pending.current)return;
    pending.current=true;setMoving(true);setMessage('');setLanding(id);
    setCollapsed(current=>({...current,[placement.columnId]:false}));
    // Keep the card in its destination until the server responds. On rejection,
    // dropping the preview restores exactly the last saved board.
    setPreview(previewMove(tasks,id,placement));
    try {
      const [ok]=await Promise.all([act({type:'moveTask',id,...placement}),new Promise(resolve=>setTimeout(resolve,180))]);
      if(ok){setMenu(null);setMessage(`«${tasks.find(t=>t.id===id)?.title}» — ${board.columns.find(c=>c.id===placement.columnId)?.title}`);}
      else setMessage('Перемещение не сохранено. Стикер возвращён на прежнее место.');
    } finally {
      setPreview(null);setLanding(null);setMoving(false);pending.current=false;focusCard(id);
    }
  }
  function order(id:string,direction:-1|1){const placement=mobileOrder(tasks,id,direction);if(placement)void commit(id,placement);}
  const collision:CollisionDetection=args=>{
    point.current=args.pointerCoordinates;
    const bounds=listRef.current?.getBoundingClientRect(),p=args.pointerCoordinates;
    if(!bounds||!p||p.x<bounds.left||p.x>bounds.right||p.y<bounds.top||p.y>bounds.bottom)return [];
    const hits=pointerWithin(args);
    return hits.filter(hit=>board.columns.some(c=>c.id===hit.id)).slice(0,1);
  };
  function hover(event:DragMoveEvent){
    const active=dragRef.current,p=point.current,columnId=event.over?.data.current?.columnId as string|undefined;
    if(!active||!p||!columnId){setDrop(null);clearHover();return;}
    const rows=[...nodes.current].map(([id,node])=>{const rect=node.getBoundingClientRect();return {id,top:rect.top,height:rect.height};});
    const next=mobilePlacement(tasks,active.id,columnId,p.y,rows,collapsed[columnId]);
    setDrop(previous=>previous?.columnId===next.columnId&&previous.beforeId===next.beforeId?previous:next);
    if(collapsed[columnId]&&hoverColumn.current!==columnId){clearHover();hoverColumn.current=columnId;hoverTimer.current=setTimeout(()=>{setCollapsed(current=>({...current,[columnId]:false}));hoverTimer.current=null;},600);}
    else if(!collapsed[columnId]||hoverColumn.current!==columnId)clearHover();
  }
  function release(){clearHover();setDragging(null);dragRef.current=null;setDrop(null);suppressClickUntil.current=Date.now()+400;}
  function end(){
    const active=dragRef.current,p=releasePoint.current||point.current;
    const bounds=listRef.current?.getBoundingClientRect();
    let next:Placement|null=null;
    if(active&&p&&bounds&&p.x>=bounds.left&&p.x<=bounds.right&&p.y>=bounds.top&&p.y<=bounds.bottom){
      const target=[...listRef.current!.querySelectorAll<HTMLElement>('[data-mobile-column]')].find(node=>{const r=node.getBoundingClientRect();return p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;});
      const columnId=target?.dataset.mobileColumn;
      if(columnId){const rows=[...nodes.current].map(([id,node])=>{const r=node.getBoundingClientRect();return {id,top:r.top,height:r.height};});next=mobilePlacement(tasks,active.id,columnId,p.y,rows,collapsed[columnId]);}
    }
    const original=active&&placementOf(tasks,active.id);
    release();
    if(active&&next&&(original?.columnId!==next.columnId||original.beforeId!==next.beforeId))void commit(active.id,next);
    else if(active)focusCard(active.id);
  }
  return <DndContext sensors={sensors} collisionDetection={collision} measuring={{droppable:{strategy:MeasuringStrategy.Always}}} autoScroll={{threshold:{x:0,y:.18},acceleration:12}} onDragStart={event=>{
    const active=tasks.find(t=>t.id===event.active.id);if(!active||pending.current)return;
    clearHover();setMenu(null);setMessage('Стикер поднят. Перенесите к линии или заголовку этапа.');
    overlayWidth.current=nodes.current.get(active.id)?.getBoundingClientRect().width||300;
    dragRef.current=active;setDragging(active);suppressClickUntil.current=Infinity;
  }} onDragMove={hover} onDragOver={hover} onDragEnd={end} onDragCancel={()=>{const id=dragRef.current?.id;release();setMessage('Перемещение отменено.');if(id)focusCard(id);}} accessibility={{screenReaderInstructions:{draggable:'Для выбора этапа нажмите кнопку «Перенести». Кнопки «Выше» и «Ниже» меняют порядок.'},announcements:{onDragStart:()=> 'Стикер поднят.',onDragOver:()=> 'Выбрано место для стикера.',onDragEnd:()=> 'Стикер отпущен.',onDragCancel:()=> 'Перемещение отменено.'}}}>
    <div ref={listRef} className={`mobile-board density-${density} ${dragging?'mobile-is-dragging':''}`} aria-label="Задачи по этапам" aria-busy={moving}>
      <p className="mobile-drag-hint">Удерживайте стикер, чтобы перенести</p>
      {board.columns.map(column=>{
        const list=shown.filter(t=>t.columnId===column.id),closed=!!collapsed[column.id];
        const overLimit=column.stage==='doing'&&board.tasks.filter(t=>!t.archived&&t.columnId===column.id&&t.assigneeId===ownerId).length>board.settings.wipLimit;
        return <MobileStage key={column.id} id={column.id} highlight={drop?.columnId===column.id}>
          <h2><button className="stage-toggle" disabled={!!dragging||moving} aria-expanded={!closed} aria-controls={`stage-${column.id}`} onClick={()=>setCollapsed(current=>({...current,[column.id]:!closed}))}><Icon name="chevron" size={20}/><span>{column.title}</span><span className={`count ${overLimit?'red':''}`}>{list.length}</span></button></h2>
          <div id={`stage-${column.id}`} hidden={closed} className="mobile-stage-content">
            {overLimit&&<p className="wip-warning">Много задач сразу · лимит {board.settings.wipLimit}</p>}
            {list.map((t,i)=><MobileCard key={t.id} board={board} task={t} index={i} count={list.length} onOpen={open} onMenu={openMenu} onOrder={order} busy={busy||moving} dragging={!!dragging} nodes={nodes} insertBefore={drop?.columnId===column.id&&drop.beforeId===t.id} landing={landing===t.id}/>)}
            {!list.length&&<p className="hint">{filterKey?'Нет задач по этим условиям':'Пока нет задач'}</p>}
            <div className={`mobile-stage-footer ${drop?.columnId===column.id&&!drop.beforeId?'mobile-insert-before':''}`}><button disabled={!!dragging||moving} className="text-button" onClick={()=>onAdd(column.id)}>+ Добавить</button><button disabled={!!dragging||moving} className="stage-rename" aria-label={`Переименовать этап: ${column.title}`} onClick={()=>onRename(column.id)}>Переименовать</button></div>
          </div>
        </MobileStage>;
      })}
    </div>
    <span className="sr-only" role="status">{message}</span>
    {createPortal(<DragOverlay dropAnimation={null} zIndex={60}>{dragging&&<div className={`mobile-drag-preview density-${density}`} style={{width:overlayWidth.current}}><article className={`note ${dragging.category}`}><PaperSurface/><div className="note-open"><CardBody board={board} task={dragging}/></div><div className="mobile-card-controls"><span><MobileGrip/> Переношу…</span></div></article></div>}</DragOverlay>,document.body)}
    {task&&<Modal title="Действия с задачей" className="mobile-sheet" onClose={()=>{if(!moving)setMenu(null);}}>
      <p className="sheet-task-title">{task.title}</p>
      <fieldset disabled={busy||moving}>
        <label className="field"><span>Переместить в этап</span><select value={destination} onChange={e=>setDestination(e.target.value)}>{board.columns.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <button className="marker-button sheet-move" disabled={destination===task.columnId} onClick={()=>void commit(task.id,{columnId:destination,beforeId:null})}>{moving?'Перемещаю…':'Переместить'}</button>
        <div className="sheet-order"><button disabled={index<=0} onClick={()=>order(task.id,-1)}><MarkerOrderArrow direction="up"/> Выше</button><button disabled={index<0||index>=siblings.length-1} onClick={()=>order(task.id,1)}><MarkerOrderArrow direction="down"/> Ниже</button></div>
        <button className="sheet-open" onClick={()=>{setMenu(null);onOpen(task);}}>Открыть карточку <Icon name="arrow"/></button>
      </fieldset>
    </Modal>}
  </DndContext>;
}
