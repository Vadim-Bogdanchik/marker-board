import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, useDraggable, DragOverlay, MeasuringStrategy, pointerWithin, type DragEndEvent, type DragMoveEvent, type KeyboardCoordinateGetter, type CollisionDetection, type DropAnimationFunction } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { placementOf, previewMove, type Placement } from './boardMovement';
import { stageOf, localDate, unfinishedDependencies, ownerId, type Board, type Task, type Action } from '../shared/model';
import { Icon, formatDate } from './ui';
import { PaperSurface } from './BoardMaterials';
export const categories={mine:'Моя',colleague:'Коллега',team:'Смежная команда'};
export type Act=(action:Action)=>Promise<boolean>;
function MarkerGrip() {
  return <svg className="marker-grip" width="27" height="29" viewBox="0 0 27 29" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M8.1 5.2 7.7 8.1M18.6 4.8 18.9 7.6M7.6 13.2 8 16M18.3 12.8 18.1 15.8M8.2 21.2 7.8 24M18.8 20.8 18.4 23.7"/>
    </g>
    <path d="m7.7 5.5-.1 1.8m10.7 5.9-.1 1.6m-10.4 7 .1 1.4" stroke="var(--note-color)" strokeWidth=".65" opacity=".45" strokeLinecap="round"/>
  </svg>;
}
export function MarkerOrderArrow({direction}:{direction:'up'|'down'}) {
  // Separate pen strokes keep the two arrows slightly different, like real ink.
  const up=direction==='up';
  return <svg className="marker-order-arrow" width="22" height="26" viewBox="0 0 24 28" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={up?'M11.8 23.1C12.5 18.2 10.9 12.4 12.4 5.2':'M11.4 4.7C10.6 10.5 12.7 16.4 11.8 23.2'}/>
      <path d={up?'M5.8 11.5Q9.7 8.7 12.4 4.8Q14.9 8.4 18.6 10.6':'M5.3 17.2Q8.7 20.1 11.7 23.7Q15 20.2 18.5 16.9'}/>
    </g>
    <path d={up?'M11.8 17.8 11.9 21.5':'M11.1 6.3 11.2 9.2'} stroke="var(--note-color)" strokeWidth=".6" opacity=".4" strokeLinecap="round"/>
  </svg>;
}
export function CardBody({board,task}:{board:Board;task:Task}) {
  const person=board.directories.find(d=>d.id===task.assigneeId), team=board.directories.find(d=>d.id===task.teamId), project=board.directories.find(d=>d.id===task.projectId);
  const overdue=task.dueDate && task.dueDate<localDate() && stageOf(board,task)!=='done';
  const dependency=unfinishedDependencies(board,task);
  const warning=task.blockedReason || (dependency.length?`Жду: ${dependency[0].title}`:task.waitingFor?`Жду: ${task.waitingFor}`:task.waitingWhat?'Жду ответа':'');
  const age=task.startedAt?Math.max(0,Math.floor((Date.now()-new Date(task.startedAt).getTime())/86400000)):0;
  return <>
    <div className="note-top"><span className="category">{categories[task.category]}</span><span className="note-marks">{task.focused&&<Icon name="target" size={18}/>} {task.priority==='high'&&<span className="red"><Icon name="flag" size={18}/></span>}</span></div>
    <h3>{task.title}</h3>
    <div className="compact-meta"><span className="compact-owner" title={person?.name||team?.name||'Без ответственного'}><Icon name="user" size={16}/>{person?.name||team?.name||'Без ответственного'}</span>{task.dueDate&&<span className={overdue?'red':''}>{overdue?'! ':''}{task.dueDate===localDate()?'Сегодня':formatDate(task.dueDate)}</span>}</div>
    <div className="compact-signals"><span>{categories[task.category]}</span>{task.focused&&<span title="В фокусе дня"><Icon name="target" size={16}/><span className="sr-only">В фокусе дня</span></span>}{task.priority==='high'&&<span className="red" title="Высокий приоритет"><Icon name="flag" size={16}/><span className="sr-only">Высокий приоритет</span></span>}{warning&&<span className="compact-blocked" title={warning}>{task.blockedReason||dependency.length?'! Блокировка':'Жду ответа'}</span>}</div>
    {project&&<div className="note-meta project"><Icon name="folder" size={18}/><span>{project.name}</span></div>}
    <div className="note-meta"><Icon name="user" size={18}/><span title={person?.name||team?.name||'Без ответственного'}>{person?.name||team?.name||'Без ответственного'}</span></div>
    <div className={`note-meta ${overdue?'red':''}`}><Icon name="calendar" size={18}/><span>{task.dueDate?formatDate(task.dueDate):'Без срока'}</span>{overdue&&<span aria-label="Просрочено"> !</span>}{age>0&&stageOf(board,task)!=='done'&&<small className="age">{age} д. в работе</small>}</div>
    {warning&&<div className={`note-warning ${task.blockedReason||dependency.length?'red':''}`}>{warning}</div>}
    {task.checklist.length>0&&<div className="note-check"><Icon name="check" size={15}/>{task.checklist.filter(c=>c.done).length}/{task.checklist.length}</div>}
  </>;
}
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tiltOf = (id: string) => ((parseInt(id.slice(0, 4), 16) % 7) - 3) * .22;
const paperClass = (task: Task) => `${task.category} ${parseInt(task.id.slice(0, 4), 16) % 2 ? 'paper-mirrored' : ''}`;
type Nodes = React.RefObject<Map<string, HTMLElement>>;
function Card({board,task,onOpen,onMove,busy,nodes,landing}:{board:Board;task:Task;onOpen:(t:Task)=>void;onMove:(id:string,direction:number)=>void;busy:boolean;nodes:Nodes;landing:boolean}) {
  const {attributes,listeners,setNodeRef:setDragRef,setActivatorNodeRef,isDragging}=useDraggable({id:task.id,disabled:busy});
  const {setNodeRef:setDropRef}=useDroppable({id:task.id});
  const register=useCallback((node:HTMLElement|null)=>{
    setDragRef(node);setDropRef(node);
    if(node)nodes.current.set(task.id,node);else nodes.current.delete(task.id);
  },[setDragRef,setDropRef,nodes,task.id]);
  return <article ref={register} data-task-id={task.id} className={`note-slot ${isDragging?'note-placeholder':''} ${landing?'note-landing':''}`}>
    <div className={`note ${paperClass(task)}`} style={{'--tilt':`${tiltOf(task.id)}deg`} as CSSProperties}>
      <PaperSurface/>
      <button ref={setActivatorNodeRef} className="drag-handle" aria-label={`Перетащить: ${task.title}`} title="Потяните, чтобы перенести стикер · с клавиатуры: пробел и стрелки" {...attributes} {...listeners} disabled={busy}><MarkerGrip/></button>
      <button className="note-open" onClick={()=>onOpen(task)} aria-label={`Открыть задачу: ${task.title}`}><CardBody board={board} task={task}/></button>
      <div className="note-order"><button disabled={busy} onClick={()=>onMove(task.id,-1)} aria-label={`Выше: ${task.title}`} title="Передвинуть выше"><MarkerOrderArrow direction="up"/></button><button disabled={busy} onClick={()=>onMove(task.id,1)} aria-label={`Ниже: ${task.title}`} title="Передвинуть ниже"><MarkerOrderArrow direction="down"/></button></div>
    </div>
  </article>;
}
function Column({board,column,tasks,onOpen,onAdd,onRename,onMove,busy,nodes,landing}:{board:Board;column:Board['columns'][number];tasks:Task[];onOpen:(t:Task)=>void;onAdd:(columnId:string)=>void;onRename:(id:string)=>void;onMove:(id:string,direction:number)=>void;busy:boolean;nodes:Nodes;landing:string|null}) {
  const {setNodeRef,isOver}=useDroppable({id:column.id});
  const count=tasks.length;
  const overLimit=column.stage==='doing'&&board.tasks.filter(t=>t.columnId===column.id&&!t.archived&&t.assigneeId===ownerId).length>board.settings.wipLimit;
  return <section ref={setNodeRef} data-column-id={column.id} className={`column ${isOver?'drop-over':''}`} aria-label={column.title}>
    <header className="column-heading"><button className="column-name" onClick={()=>onRename(column.id)} title="Переименовать колонку">{column.title}</button><span className={`count ${overLimit?'red':''}`}>{count}</span></header>
    {overLimit&&<div className="wip-warning">Много задач сразу · лимит {board.settings.wipLimit}</div>}
    <div className="note-stack">{tasks.map(task=><Card key={task.id} board={board} task={task} onOpen={onOpen} onMove={onMove} busy={busy} nodes={nodes} landing={landing===task.id}/>)}</div>
    <button className="add-note" onClick={()=>onAdd(column.id)}>+ Добавить</button>
  </section>;
}
export function BoardView({board,tasks,onOpen,onAdd,onRename,act,busy,density}:{board:Board;density:'full'|'compact';tasks:Task[];onOpen:(t:Task)=>void;onAdd:(columnId:string)=>void;onRename:(id:string)=>void;act:Act;busy:boolean}) {
  const [dragging,setDragging]=useState<Task|null>(null),[preview,setPreview]=useState<Task[]|null>(null),[landing,setLanding]=useState<string|null>(null);
  const nodes=useRef(new Map<string,HTMLElement>()),columnsRef=useRef<HTMLDivElement>(null);
  const previewRef=useRef<Task[]|null>(null),dragRef=useRef<Task|null>(null),keyboard=useRef(false),keyboardColumn=useRef<string|null>(null);
  const pointer=useRef<{x:number;y:number}|null>(null),original=useRef<Placement|null>(null),pending=useRef(false);
  const beforeLayout=useRef(new Map<string,DOMRect>()),animations=useRef(new Map<string,Animation>());
  const shown=preview||tasks;
  const capture=()=>{beforeLayout.current=new Map([...nodes.current].map(([id,node])=>[id,node.getBoundingClientRect()]));};
  const updatePreview=(next:Task[]|null)=>{capture();previewRef.current=next;setPreview(next);};
  useLayoutEffect(()=>{
    const previous=beforeLayout.current;beforeLayout.current=new Map();
    for(const [id,node] of nodes.current){
      const old=previous.get(id);if(!old||id===dragRef.current?.id)continue;
      animations.current.get(id)?.cancel();
      const next=node.getBoundingClientRect(),dx=old.left-next.left,dy=old.top-next.top;
      if(reducedMotion()||Math.abs(dx)+Math.abs(dy)<1)continue;
      const animation=node.animate([
        {transform:`translate(${dx}px,${dy}px) scale(1)`},
        {transform:`translate(${dx*.45}px,${dy*.45}px) rotate(-.45deg) scale(1.012)`,offset:.45},
        {transform:'translate(0,0) rotate(0deg) scale(1)'},
      ],{duration:280,easing:'cubic-bezier(.2,.75,.25,1)'});
      animations.current.set(id,animation);
      animation.onfinish=()=>{if(animations.current.get(id)===animation)animations.current.delete(id);};
      const paper=node.querySelector<HTMLElement>('.note-paper');
      if(paper){const rest=getComputedStyle(paper).filter;paper.animate([{filter:rest},{filter:'drop-shadow(2px 8px 5px #25303340)',offset:.4},{filter:rest}],{duration:280});}
    }
    if(keyboard.current&&dragRef.current){
      const node=nodes.current.get(dragRef.current.id),stack=node?.parentElement;
      if(node&&stack){
        if(node.offsetTop<stack.scrollTop)stack.scrollTop=node.offsetTop;
        else if(node.offsetTop+node.offsetHeight>stack.scrollTop+stack.clientHeight)stack.scrollTop=node.offsetTop+node.offsetHeight-stack.clientHeight;
      }
    }
  },[shown]);
  useLayoutEffect(()=>()=>{animations.current.forEach(a=>a.cancel());},[]);
  const relocate=(id:string,destination:Placement)=>{
    const current=previewRef.current||tasks,next=previewMove(current,id,destination);
    if(next!==current)updatePreview(next);
  };
  // offsetTop is the unanimated layout location. Using an in-flight FLIP rectangle
  // for hit-testing makes neighboring cards repeatedly exchange places.
  const layoutRect=(id:string)=>{
    const node=nodes.current.get(id),stack=node?.parentElement;if(!node||!stack)return null;
    const rect=stack.getBoundingClientRect();
    return {left:rect.left+node.offsetLeft-stack.scrollLeft,top:rect.top+node.offsetTop-stack.scrollTop,width:node.offsetWidth,height:node.offsetHeight};
  };
  const keyboardCoordinates:KeyboardCoordinateGetter=(event,{context})=>{
    const active=dragRef.current;if(!active||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))return;
    event.preventDefault();
    const current=previewRef.current||tasks,position=placementOf(current,active.id)!;
    const list=current.filter(t=>t.columnId===position.columnId),index=list.findIndex(t=>t.id===active.id);
    let destination:Placement;
    if(event.code==='ArrowUp'||event.code==='ArrowDown'){
      const direction=event.code==='ArrowUp'?-1:1;if(index+direction<0||index+direction>=list.length)return;
      destination={columnId:position.columnId,beforeId:direction<0?list[index-1].id:list[index+2]?.id||null};
    }else{
      const colIndex=board.columns.findIndex(c=>c.id===position.columnId),column=board.columns[colIndex+(event.code==='ArrowLeft'?-1:1)];if(!column)return;
      const other=current.filter(t=>t.columnId===column.id);destination={columnId:column.id,beforeId:other[Math.min(index,other.length)]?.id||null};
    }
    const target=destination.beforeId?layoutRect(destination.beforeId):null;
    const column=columnsRef.current?.querySelector<HTMLElement>(`[data-column-id="${destination.columnId}"] .note-stack`);
    if(!column)return;
    const rect=column.getBoundingClientRect(),height=context.draggingNodeRect?.height||180;
    const y=target?.top??Math.min(rect.bottom-height,rect.top+column.scrollHeight-column.scrollTop);
    keyboardColumn.current=destination.columnId;relocate(active.id,destination);
    return {x:target?.left??rect.left+9,y:Math.max(rect.top,Math.min(y,rect.bottom-height))};
  };
  const collision:CollisionDetection=args=>{
    if(keyboard.current)return keyboardColumn.current?[{id:keyboardColumn.current}]:[];
    pointer.current=args.pointerCoordinates;
    const hits=pointerWithin(args),current=previewRef.current||tasks;
    const col=hits.find(h=>board.columns.some(c=>c.id===h.id));if(!col)return [];
    const card=hits.find(h=>current.some(t=>t.id===h.id&&t.columnId===col.id));
    return card?[card]:[col];
  };
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:7}}),useSensor(KeyboardSensor,{coordinateGetter:keyboardCoordinates}));
  const hover=(event:DragMoveEvent)=>{
    const active=dragRef.current,point=pointer.current;if(!active||keyboard.current||!point||!event.over||event.over.id===active.id)return;
    const current=previewRef.current||tasks,over=current.find(t=>t.id===event.over!.id);
    const columnId=over?.columnId||String(event.over.id);
    if(!board.columns.some(c=>c.id===columnId))return;
    const list=current.filter(t=>t.columnId===columnId&&t.id!==active.id);
    const before=list.find(t=>{const r=layoutRect(t.id);return r&&point.y<r.top+r.height/2;});
    relocate(active.id,{columnId,beforeId:before?.id||null});
  };
  const dropAnimation:DropAnimationFunction=async({active,dragOverlay,transform})=>{
    const duration=reducedMotion()?0:280;
    const final={...transform,x:transform.x-(dragOverlay.rect.left-active.rect.left),y:transform.y-(dragOverlay.rect.top-active.rect.top),scaleX:active.rect.width/dragOverlay.rect.width,scaleY:active.rect.height/dragOverlay.rect.height};
    const opacity=active.node.style.opacity;active.node.style.opacity='0';
    const animation=dragOverlay.node.animate([{transform:CSS.Transform.toString(transform)},{transform:CSS.Transform.toString(final)}],{duration,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    const note=dragOverlay.node.querySelector<HTMLElement>('.note');
    note?.animate([{transform:getComputedStyle(note).transform},{transform:`rotate(${tiltOf(String(active.id))}deg) scale(1)`}],{duration,easing:'ease-out',fill:'forwards'});
    try{await animation.finished;}catch{/* The view may be closed while landing. */}finally{active.node.style.opacity=opacity;}
  };
  const cancel=()=>{
    updatePreview(null);setDragging(null);dragRef.current=null;keyboardColumn.current=null;setLanding(null);
  };
  async function commit(id:string,destination:Placement,isKeyboard=false){
    pending.current=true;setLanding(id);
    try{
      // The preview stays in its destination throughout the request. Success is
      // still announced only by App after the server has acknowledged the move.
      await Promise.all([act({type:'moveTask',id,...destination}),new Promise(resolve=>setTimeout(resolve,reducedMotion()?0:470))]);
    }finally{
      updatePreview(null);setLanding(null);pending.current=false;
      if(isKeyboard)requestAnimationFrame(()=>nodes.current.get(id)?.querySelector<HTMLButtonElement>('.drag-handle')?.focus({preventScroll:true}));
    }
  }
  async function end(event:DragEndEvent){
    const task=dragRef.current;if(!task)return;
    if(!event.over){cancel();return;}
    const destination=placementOf(previewRef.current||tasks,task.id)!;
    const changed=destination.columnId!==original.current?.columnId||destination.beforeId!==original.current?.beforeId;
    setDragging(null);dragRef.current=null;keyboardColumn.current=null;
    if(changed)await commit(task.id,destination,keyboard.current);else{updatePreview(null);setLanding(null);}
  }
  async function move(id:string,direction:number){
    if(busy||pending.current)return;
    const task=tasks.find(t=>t.id===id)!;const list=tasks.filter(t=>t.columnId===task.columnId),index=list.findIndex(t=>t.id===id);
    if(index+direction<0||index+direction>=list.length)return;
    const destination={columnId:task.columnId,beforeId:direction<0?list[index-1].id:list[index+2]?.id||null};
    relocate(id,destination);await commit(id,destination);
  }
  return <DndContext sensors={sensors} collisionDetection={collision} measuring={{droppable:{strategy:MeasuringStrategy.Always}}} onDragStart={event=>{
    const task=tasks.find(t=>t.id===event.active.id);if(!task||pending.current)return;
    dragRef.current=task;original.current=placementOf(tasks,task.id);keyboard.current=event.activatorEvent.type==='keydown';keyboardColumn.current=task.columnId;
    previewRef.current=tasks;setPreview(tasks);setDragging(task);
  }} onDragMove={hover} onDragOver={hover} onDragEnd={end} onDragCancel={cancel} accessibility={{screenReaderInstructions:{draggable:'Нажмите пробел, затем стрелки для перемещения. Пробел — приклеить, Escape — отменить.'},announcements:{onDragStart:()=> 'Стикер поднят. Используйте стрелки.',onDragOver:()=> 'Выбрано место для стикера.',onDragEnd:()=> 'Стикер отпущен. Проверяю сохранение.',onDragCancel:()=> 'Перемещение отменено.'}}}>
    <div ref={columnsRef} className={`columns density-${density} ${dragging?'is-dragging':''}`} aria-busy={!!landing}>{board.columns.map(column=><Column key={column.id} column={column} board={board} tasks={shown.filter(t=>t.columnId===column.id)} onOpen={onOpen} onAdd={onAdd} onRename={onRename} onMove={move} busy={busy||!!landing} nodes={nodes} landing={landing}/>)}</div>
    {createPortal(<DragOverlay dropAnimation={dropAnimation} zIndex={50}>{dragging&&<div className={`note lifted density-${density} ${paperClass(dragging)}`}><PaperSurface/><span className="drag-handle" aria-hidden="true"><MarkerGrip/></span><div className="note-open"><CardBody board={board} task={dragging}/></div></div>}</DragOverlay>,document.body)}
  </DndContext>;
}
