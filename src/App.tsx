import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dailyOverview, maxColumns, newTask, stageOf, type Action, type Board, type Task } from '../shared/model';
import { ApiError, fetchBoard, sendAction } from './api';
import { BoardView, categories } from './BoardView';
import { TaskEditor } from './TaskEditor';
import { ColumnManager, type ColumnPanel } from './ColumnManager';
import { Settings } from './Settings';
import { Icon, Modal, formatDate } from './ui';
import { BoardMaterial, BoardLighting, MarkerTray } from './BoardMaterials';
import { SketchBoard } from './sketch/SketchBoard';
import { emptySketch, type Sketch } from '../shared/sketch';
import { MobileBoard } from './MobileBoard';
import { useMobileLayout, useCardDensity } from './viewPreferences';
type Tab='board'|'today'|'archive'|'sketch';
const blankFilters={query:'',project:'',assignee:'',team:'',category:'',priority:''};
export function App() {
  const mobile=useMobileLayout(),[density,setDensity]=useCardDensity(mobile);
  const [filterPanel,setFilterPanel]=useState(false),[more,setMore]=useState(false),[revealTaskId,setRevealTaskId]=useState<string|null>(null);
  const clearReveal=useCallback(()=>setRevealTaskId(null),[]);
  const [board,setBoard]=useState<Board|null>(null),boardRef=useRef<Board|null>(null);
  const [tab,setTab]=useState<Tab>('board'),[filters,setFilters]=useState(blankFilters),[editor,setEditor]=useState<Task|null>(null),[settings,setSettings]=useState(false);
  const [sketchOpened,setSketchOpened]=useState(false);
  const openSketch=()=>{setSketchOpened(true);setTab('sketch');};
  const [columnPanel,setColumnPanel]=useState<ColumnPanel|null>(null);
  const [quick,setQuick]=useState<string|null>(null),[title,setTitle]=useState('');
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false), busyRef=useRef(false),[now,setNow]=useState(new Date());
  const update=useCallback((next:Board)=>{
    const current=boardRef.current;
    // Sketch and tasks have independent revisions. A slower task response must
    // never replace a newer sketch that has already been acknowledged.
    const sketch=next.sketch??emptySketch();
    const merged={...(current&&current.revision>next.revision?current:next),sketch:current&&current.sketch.revision>sketch.revision?current.sketch:sketch};
    boardRef.current=merged;setBoard(merged);
  },[]);
  const sketchSaved=useCallback((sketch:Sketch)=>{if(boardRef.current)update({...boardRef.current,sketch});},[update]);
  const reload=useCallback(async()=>{try{update(await fetchBoard());setError('');}catch(e){setError((e as Error).message);}},[update]);
  useEffect(()=>{void reload();const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[reload]);
  useEffect(()=>{
    const refresh=()=>{if(!editor&&!settings&&!quick&&!busyRef.current)void reload();};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);
  },[editor,settings,quick,reload]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),2500);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{document.documentElement.dataset.theme=board?.settings.theme||'day';},[board?.settings.theme]);
  async function act(action:Action):Promise<boolean> {
    if(!boardRef.current||busyRef.current)return false;busyRef.current=true;setBusy(true);setError('');
    try {
      let result:Board;
      try {result=await sendAction(boardRef.current.revision,action);}catch(e){
        if(e instanceof ApiError&&e.code==='DEPENDENCIES_OPEN'&&(action.type==='moveTask'||action.type==='saveTask'||action.type==='deleteColumn')){
          if(!window.confirm(e.message))return false;result=await sendAction(boardRef.current.revision,{...action,confirmBlocked:true});
        } else throw e;
      }
      update(result);setNotice('Сохранено');return true;
    } catch(e) {setError((e as Error).message);if(e instanceof ApiError&&e.code==='STALE')update(await fetchBoard().catch(()=>boardRef.current!));return false;}
    finally {busyRef.current=false;setBusy(false);}
  }
  if(!board)return <main className="loading"><Icon name="board" size={60}/><h1>Моя доска</h1><p>{error||'Готовлю маркеры и стикеры…'}</p>{error&&<button className="marker-button" onClick={reload}>Попробовать снова</button>}</main>;
  const overview=dailyOverview(board,now);
  const matches=(t:Task)=>`${t.title} ${t.description}`.toLocaleLowerCase('ru').includes(filters.query.toLocaleLowerCase('ru'))&&(!filters.project||t.projectId===filters.project)&&(!filters.assignee||t.assigneeId===filters.assignee)&&(!filters.team||t.teamId===filters.team)&&(!filters.category||t.category===filters.category)&&(!filters.priority||t.priority===filters.priority);
  const visible=board.tasks.filter(t=>!t.archived&&matches(t)),activeFilter=Object.values(filters).some(Boolean);
  const changeFilter=(key:keyof typeof filters,value:string)=>setFilters(f=>({...f,[key]:value}));
  const add=(columnId=board.columns[0].id)=>{setTitle('');setQuick(columnId);};
  const directoryFilter=(key:'project'|'assignee'|'team',kind:'project'|'person'|'team',label:string)=><select aria-label={label} value={filters[key]} onChange={e=>changeFilter(key,e.target.value)}><option value="">{label}</option>{board.directories.filter(d=>d.kind===kind).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>;
  const filterControls=<>{directoryFilter('project','project','Все проекты')}{directoryFilter('assignee','person','Все ответственные')}{directoryFilter('team','team','Все команды')}
    <select aria-label="Категория" value={filters.category} onChange={e=>changeFilter('category',e.target.value)}><option value="">Все задачи</option>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
    <select aria-label="Приоритет" value={filters.priority} onChange={e=>changeFilter('priority',e.target.value)}><option value="">Приоритет</option><option value="high">Высокий</option><option value="normal">Обычный</option><option value="low">Низкий</option></select>
    {activeFilter&&<button className="text-button clear-filter" onClick={()=>setFilters(blankFilters)}>Сбросить</button>}</>;
  const filterCount=Object.entries(filters).filter(([key,value])=>key!=='query'&&value).length;
  const editColumn=(id:string)=>setColumnPanel({kind:'edit',id});
  const addColumnButton=<button className="add-column-button" type="button" aria-label="Добавить колонку"
    disabled={board.columns.length>=maxColumns} onClick={()=>setColumnPanel({kind:'add'})}><Icon name="plus" size={18}/> Колонка</button>;
  const viewControls=tab==='board'&&<div className="board-view-tools">{mobile&&addColumnButton}<span className="view-caption">Вид карточек</span><div className="density-switch" role="group" aria-label="Вид карточек"><button aria-pressed={density==='full'} onClick={()=>setDensity('full')} title="Подробные карточки: все основные поля"><Icon name="full" size={20}/>Подробно</button><button aria-pressed={density==='compact'} onClick={()=>setDensity('compact')} title="Компактные карточки: название, ответственный и важные сигналы"><Icon name="compact" size={20}/>Компактно</button></div></div>;
  const groups=[['focus','Фокус дня','target'],['overdue','Просрочено','flag'],['today','Срок сегодня','calendar'],['upcoming','Ближайшие 7 дней','calendar'],['reminders','Пора напомнить','clock'],['blocked','Нужна помощь','link'],['unscheduled','Ожидания без даты','chat']] as const;
  return <main className={`frame ${tab==='sketch'?'sketch-mode':''}`}>
    <BoardMaterial theme={board.settings.theme}/>
    <div className="enamel">{board.settings.motion&&<BoardLighting/>}
      <div className="board-content">
        <div className="board-controls"><header className="toolbar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setTab('board');}}><Icon name="board" size={35}/><h1>{tab==='today'?'Мой день':'Моя доска'}</h1></a>
          <nav aria-label="Разделы"><button className={tab==='board'?'active':''} onClick={()=>setTab('board')}>Доска</button><button className={tab==='today'?'active':''} onClick={()=>setTab('today')}>Сегодня</button><button className={tab==='sketch'?'active':''} onClick={openSketch}>Эскиз</button></nav>
          <div className="theme-switch" role="group" aria-label="Освещение"><button title="Дневная тема" aria-label="Дневная тема" aria-pressed={board.settings.theme==='day'} disabled={busy} onClick={()=>act({type:'settings',settings:{...board.settings,theme:'day'}})}><Icon name="sun" size={29}/></button><span>/</span><button title="Вечерняя тема" aria-label="Вечерняя тема" aria-pressed={board.settings.theme==='night'} disabled={busy} onClick={()=>act({type:'settings',settings:{...board.settings,theme:'night'}})}><Icon name="moon" size={27}/></button></div>
          {tab!=='sketch'&&<label className="search"><Icon name="search"/><input aria-label="Найти задачу" placeholder="Найти задачу…" value={filters.query} onChange={e=>changeFilter('query',e.target.value)}/>{filters.query&&<button aria-label="Очистить поиск" onClick={()=>changeFilter('query','')}>×</button>}</label>}
          {mobile&&tab!=='sketch'&&<button className="filter-toggle" aria-label={`Фильтры${filterCount?`: ${filterCount}`:''}`} onClick={()=>setFilterPanel(true)}><Icon name="settings"/>{filterCount>0&&<span>{filterCount}</span>}</button>}
          {tab!=='sketch'&&<button className="marker-button new-task" onClick={()=>add()}>+ Задача</button>}<button className="icon-button" title="Настройки" aria-label="Настройки" onClick={()=>setSettings(true)}><Icon name="settings" size={27}/></button>
        </header>
        {!mobile&&tab!=='sketch'&&<div className="filters">{filterControls}<div className="legend"><span><i className="mine"/>Мои</span><span><i className="colleague"/>Коллеги</span><span><i className="team"/>Команды</span></div>{viewControls}</div>}
        {mobile&&viewControls}
        {tab!=='sketch'&&<div className="daily-strip"><button onClick={()=>setTab('today')}><Icon name="target"/> Фокус: <b>{overview.focus.filter(matches).length}</b></button><span className="divider"/><button onClick={()=>setTab('today')}><Icon name="chat"/> Жду ответа: <b>{board.tasks.filter(t=>!t.archived&&matches(t)&&stageOf(board,t)!=='done'&&(t.waitingFor||t.waitingWhat)).length}</b></button><span className="divider"/><button className={overview.overdue.filter(matches).length?'red':''} onClick={()=>setTab('today')}><Icon name="clock"/> Просрочено: <b>{overview.overdue.filter(matches).length}</b></button><span className="strip-spacer"/>{!mobile&&tab==='board'&&addColumnButton}{!mobile&&tab==='board'&&<button onClick={()=>setColumnPanel({kind:'list'})}><Icon name="board" size={21}/> Колонки</button>}<button className={tab==='archive'?'active':''} onClick={()=>setTab(tab==='archive'?'board':'archive')}><Icon name="archive" size={21}/> Архив</button><span className="saved-state" aria-live="polite">{busy?'Сохраняю…':notice||'На этом компьютере'}</span></div>}
        </div>
        {sketchOpened&&<SketchBoard initial={board.sketch} active={tab==='sketch'} onSaved={sketchSaved}/>}
        {tab==='board'&&<>
          {!board.tasks.length&&<div className="empty-intro"><span className="little-arrow">↙</span><div><h2>Начнём с одной задачи</h2><p>Всё, что важно сегодня, — перед глазами.</p></div><button className="text-button" disabled={busy} onClick={()=>act({type:'demo'})}>Посмотреть на примерах</button></div>}
          {activeFilter&&!visible.length&&board.tasks.length>0&&<p className="no-results">Ничего не нашлось. Попробуйте изменить поиск или фильтры.</p>}
          <>{mobile?<MobileBoard revealTaskId={revealTaskId} onRevealed={clearReveal} filterKey={activeFilter?JSON.stringify(filters):''} density={density} board={board} tasks={visible} onOpen={setEditor} onAdd={add} onEditColumn={editColumn} act={act} busy={busy}/>:<BoardView density={density} board={board} tasks={visible} onOpen={setEditor} onAdd={add} onEditColumn={editColumn} act={act} busy={busy}/>}</>
        </>}
        {tab==='today'&&<div className="today-view"><div className="today-title"><h2>Сегодня, {now.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</h2><p>Что сделать, кого спросить, что сдвинуть с места.</p></div><div className="today-groups">{groups.map(([key,label,icon])=><section className={`today-group ${key==='overdue'?'overdue':''}`} key={key}><h3><Icon name={icon}/>{label}<span className="count">{overview[key].filter(matches).length}</span></h3>{overview[key].filter(matches).map(t=><button className="today-item" key={t.id} onClick={()=>setEditor(t)}><i className={`tiny-note ${t.category}`}/><span><strong>{t.title}</strong><small>{key==='reminders'?t.waitingFor||t.waitingWhat:t.nextStep||board.columns.find(c=>c.id===t.columnId)?.title}</small></span>{t.dueDate&&<span className="item-date">{formatDate(t.dueDate)}</span>}<Icon name="arrow" size={18}/></button>)}{!overview[key].filter(matches).length&&<p className="hint">{key==='focus'?'Отметьте «В фокусе дня» в карточке задачи.':'Здесь пока спокойно.'}</p>}</section>)}</div></div>}
        {tab==='archive'&&<div className="archive-view"><h2>Завершено и отложено на полку</h2><p>Откройте карточку, чтобы вернуть задачу на доску.</p>{board.tasks.filter(t=>t.archived&&matches(t)).map(t=><button className="today-item" key={t.id} onClick={()=>setEditor(t)}><Icon name="check"/><span>{t.title}</span><small>{t.completedAt&&new Date(t.completedAt).toLocaleDateString('ru-RU')}</small><Icon name="arrow"/></button>)}{!board.tasks.some(t=>t.archived&&matches(t))&&<p className="hint">В архиве пока нет задач.</p>}</div>}
      </div>
    </div>
    {!mobile&&<MarkerTray sketch={tab==='sketch'}/>}
    {mobile&&(busy||notice)&&<div className="mobile-save-status" role="status">{busy?'Сохраняю…':notice}</div>}
    {mobile&&<nav className="mobile-nav" aria-label="Разделы приложения"><button aria-current={tab==='board'?'page':undefined} onClick={()=>setTab('board')}><Icon name="board"/><span>Доска</span></button><button aria-current={tab==='today'?'page':undefined} onClick={()=>setTab('today')}><Icon name="calendar"/><span>Сегодня</span></button><button aria-current={tab==='sketch'?'page':undefined} onClick={openSketch}><Icon name="sketch"/><span>Эскиз</span></button><button className="mobile-add" aria-label="Добавить задачу" onClick={()=>add()}><Icon name="plus" size={28}/></button><button aria-current={tab==='archive'?'page':undefined} onClick={()=>setMore(true)}><Icon name="more"/><span>Ещё</span></button></nav>}
    {mobile&&filterPanel&&<Modal title="Поиск и фильтры" className="mobile-sheet" onClose={()=>setFilterPanel(false)}><div className="mobile-filter-fields">{filterControls}</div><p className="hint">Найдено: {tab==='archive'?board.tasks.filter(t=>t.archived&&matches(t)).length:visible.length}</p><button className="marker-button" onClick={()=>setFilterPanel(false)}>Показать задачи</button></Modal>}
    {mobile&&more&&<Modal title="Ещё" className="mobile-sheet" onClose={()=>setMore(false)}><div className="more-actions"><button onClick={()=>{setMore(false);setColumnPanel({kind:'list'});}}><Icon name="board"/> Колонки доски</button><button onClick={()=>{setMore(false);setTab('archive');}}><Icon name="archive"/> Архив</button><button onClick={()=>{setMore(false);setSettings(true);}}><Icon name="settings"/> Настройки и справочники</button><button disabled={busy} onClick={()=>act({type:'settings',settings:{...board.settings,theme:board.settings.theme==='day'?'night':'day'}})}><Icon name={board.settings.theme==='day'?'moon':'sun'}/> {board.settings.theme==='day'?'Вечернее освещение':'Дневное освещение'}</button></div></Modal>}
    {quick&&<Modal title="Новый стикер" onClose={()=>setQuick(null)}><form onSubmit={async e=>{e.preventDefault();const task=newTask(board,title,quick);if(await act({type:'saveTask',task})){setQuick(null);if(mobile){setFilters(blankFilters);setTab('board');setRevealTaskId(task.id);}}}}><label className="field"><span>Что нужно сделать?</span><input data-initial-focus autoFocus required maxLength={250} placeholder="Например, согласовать контракт API" value={title} onChange={e=>setTitle(e.target.value)}/></label><p className="hint">Ответственный — вы. Детали можно добавить, открыв стикер.</p><button className="marker-button" disabled={busy||!title.trim()}>Добавить задачу</button></form></Modal>}
    {editor&&<TaskEditor key={editor.id} board={board} task={editor} act={act} busy={busy} onClose={()=>setEditor(null)}/>}
    {columnPanel&&<ColumnManager key={columnPanel.kind+('id' in columnPanel?columnPanel.id:'')} board={board} act={act} busy={busy} panel={columnPanel} open={setColumnPanel} onClose={()=>setColumnPanel(null)}/>}
    {settings&&<Settings board={board} act={act} busy={busy} onClose={()=>setSettings(false)}/>}
    {error&&createPortal(<div className="error-toast" role="alert"><span>{error}</span><button aria-label="Закрыть сообщение" onClick={()=>setError('')}>×</button></div>,document.querySelector('dialog[open]')||document.body)}
  </main>;
}
