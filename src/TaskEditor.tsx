import { useEffect, useRef, useState, type ReactNode } from 'react';
import { taskSchema, stageOf, unfinishedDependencies, type Board, type Task } from '../shared/model';
import { categories, type Act } from './BoardView';
import { Icon, Modal } from './ui';
import { useMobileLayout, useEditorViewport } from './viewPreferences';
function EditorSection({title,icon,children,initialOpen=false,mobile}:{title:string;icon?:string;children:ReactNode;initialOpen?:boolean;mobile:boolean}) {
  const [open,setOpen]=useState(initialOpen);
  if(!mobile)return <section className="form-section"><h3>{icon&&<Icon name={icon}/>} {title}</h3>{children}</section>;
  return <details className="form-section editor-section" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{icon&&<Icon name={icon}/>}<span>{title}</span><Icon name="chevron" size={18}/></summary><div className="editor-section-body">{children}</div></details>;
}
function revealField(target:HTMLElement){let parent=target.parentElement;while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}requestAnimationFrame(()=>{target.focus();target.scrollIntoView({block:'nearest'});});}

export function TaskEditor({board,task,onClose,act,busy}:{board:Board;task:Task;onClose:()=>void;act:Act;busy:boolean}) {
  const mobile=useMobileLayout();
  useEditorViewport(mobile);
  const [draft,setDraft]=useState<Task>(structuredClone(task)),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const existing=board.tasks.some(t=>t.id===task.id), dirty=JSON.stringify(task)!==JSON.stringify(draft);
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const set=<K extends keyof Task>(key:K,value:Task[K])=>setDraft(d=>({...d,[key]:value}));
  function close(){if(!dirty||window.confirm('Закрыть карточку без сохранения изменений?'))onClose();}
  const save=async(override?:Partial<Task>)=>{
    const parsed=taskSchema.safeParse({...draft,...override});if(!parsed.success){setError(parsed.error.issues.map(i=>i.message).join('. '));const field=parsed.error.issues[0].path.join('.');requestAnimationFrame(()=>{const target=form.current?.elements.namedItem(field);if(target instanceof HTMLElement)revealField(target);else document.getElementById('task-editor-error')?.focus();});return;}
    setError('');setSaving(true);const ok=await act({type:'saveTask',task:parsed.data});setSaving(false);if(ok)onClose();
  };
  function directory(kind:'person'|'team'|'project',key:'assigneeId'|'teamId'|'projectId',label:string) {
    return <label className="field inline"><span>{label}</span><select name={key} value={draft[key]||''} onChange={e=>set(key,e.target.value||null)}><option value="">Не выбран</option>{board.directories.filter(d=>d.kind===kind).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>;
  }
  return <Modal title={existing?'Карточка задачи':'Новая задача'} onClose={close} wide className="task-editor">
    <form ref={form} className="task-form" onInvalid={e=>revealField(e.target as HTMLElement)} onSubmit={e=>{e.preventDefault();void save();}}>
      <div className="task-editor-scroll">
      <fieldset className="task-editor-sheet" disabled={busy||saving}>
        <label className="sr-only" htmlFor="task-title">Название задачи</label><textarea id="task-title" data-initial-focus={mobile?undefined:true} className="task-title" rows={2} placeholder="Что нужно сделать?" name="title" value={draft.title} onChange={e=>set('title',e.target.value)} maxLength={250} required/>
        {mobile?<>
          <label className="field"><span>Этап</span><select aria-label="Этап" name="columnId" value={draft.columnId} onChange={e=>set('columnId',e.target.value)}>{board.columns.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
          <div className="next-step"><label className="field"><span><Icon name="light"/> Следующий шаг</span><textarea rows={2} name="nextStep" value={draft.nextStep} onChange={e=>set('nextStep',e.target.value)} placeholder="Одно конкретное действие…"/></label></div>
          {directory('person','assigneeId','Ответственный')}
          <label className="field inline"><span>Срок</span><input type="date" name="dueDate" value={draft.dueDate||''} onChange={e=>set('dueDate',e.target.value||null)}/></label>
          {directory('project','projectId','Проект')}
          <EditorSection mobile={mobile} title="Дополнительные поля" icon="settings">
            <div className="two-fields"><label className="field"><span>Приоритет</span><select name="priority" value={draft.priority} onChange={e=>set('priority',e.target.value as Task['priority'])}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option></select></label><label className="field"><span>Категория</span><select name="category" value={draft.category} onChange={e=>set('category',e.target.value as Task['category'])}>{Object.entries(categories).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label></div>
            {directory('team','teamId','Команда')}
          </EditorSection>
          <label className="checkline focus-check"><input type="checkbox" checked={draft.focused} onChange={e=>set('focused',e.target.checked)}/><Icon name="target"/> В фокусе дня</label>
        </>:<>        <div className="next-step"><label className="field"><span><Icon name="light"/> Следующий шаг</span><textarea rows={2} name="nextStep" value={draft.nextStep} onChange={e=>set('nextStep',e.target.value)} placeholder="Одно конкретное действие…"/></label></div>
        <div className="two-fields"><label className="field"><span>Этап</span><select aria-label="Этап" name="columnId" value={draft.columnId} onChange={e=>set('columnId',e.target.value)}>{board.columns.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label className="field"><span>Приоритет</span><select name="priority" value={draft.priority} onChange={e=>set('priority',e.target.value as Task['priority'])}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option></select></label></div>
        <div className="two-fields"><label className="field"><span>Категория</span><select name="category" value={draft.category} onChange={e=>set('category',e.target.value as Task['category'])}>{Object.entries(categories).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label><label className="field"><span>Срок</span><input type="date" name="dueDate" value={draft.dueDate||''} onChange={e=>set('dueDate',e.target.value||null)}/></label></div>
        {directory('person','assigneeId','Ответственный')}{directory('team','teamId','Команда')}{directory('project','projectId','Проект')}
        <label className="checkline focus-check"><input type="checkbox" checked={draft.focused} onChange={e=>set('focused',e.target.checked)}/><Icon name="target"/> В фокусе дня</label>

</>}
        <EditorSection mobile={mobile} initialOpen title="Описание"><textarea aria-label="Описание" rows={3} name="description" value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="Контекст, требования, договорённости…"/></EditorSection>
        <EditorSection mobile={mobile} icon="clock" title="Ожидание"><label className="field inline"><span>От кого</span><input name="waitingFor" value={draft.waitingFor} onChange={e=>set('waitingFor',e.target.value)} placeholder="Человек или команда"/></label><label className="field"><span>Что нужно получить</span><textarea rows={2} name="waitingWhat" value={draft.waitingWhat} onChange={e=>set('waitingWhat',e.target.value)}/></label><label className="field inline"><span>Напомнить себе</span><input type="date" name="remindOn" value={draft.remindOn||''} onChange={e=>set('remindOn',e.target.value||null)}/></label></EditorSection>
        <EditorSection mobile={mobile} icon="flag" title="Блокировка"><textarea aria-label="Причина блокировки" rows={2} name="blockedReason" value={draft.blockedReason} onChange={e=>set('blockedReason',e.target.value)} placeholder="Что мешает продолжить? Очистите поле, когда препятствие снято."/></EditorSection>
        <EditorSection mobile={mobile} icon="link" title={`Зависит от${draft.dependencies.length?` · ${draft.dependencies.length}`:''}`}>{draft.dependencies.map(id=>{const dep=board.tasks.find(t=>t.id===id);return <div className="dependency-row" key={id}><span>{dep?.title||'Задача удалена'}</span><small>{dep&&stageOf(board,dep)==='done'?'Готово':'Не завершено'}</small><button type="button" aria-label={`Убрать зависимость ${dep?.title}`} onClick={()=>set('dependencies',draft.dependencies.filter(d=>d!==id))}>×</button></div>;})}<select aria-label="Добавить зависимость" value="" onChange={e=>{if(e.target.value)set('dependencies',[...draft.dependencies,e.target.value]);}}><option value="">+ Связать с задачей</option>{board.tasks.filter(t=>t.id!==draft.id&&!draft.dependencies.includes(t.id)&&!t.archived).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select>{unfinishedDependencies(board,draft).length>0&&<p className="hint">Связанные задачи ещё не завершены.</p>}</EditorSection>
        <EditorSection mobile={mobile} initialOpen icon="check" title={`Чек-лист · ${draft.checklist.filter(item=>item.done).length}/${draft.checklist.length}`}>{draft.checklist.map((item,i)=><div className="check-row" key={item.id}><input type="checkbox" aria-label={`Готово: ${item.text||`пункт ${i+1}`}`} checked={item.done} onChange={e=>set('checklist',draft.checklist.map(c=>c.id===item.id?{...c,done:e.target.checked}:c))}/><input name={`checklist.${i}.text`} aria-label={`Пункт ${i+1}`} value={item.text} placeholder="Пункт чек-листа" onChange={e=>set('checklist',draft.checklist.map(c=>c.id===item.id?{...c,text:e.target.value}:c))}/><button type="button" aria-label={`Удалить пункт ${i+1}`} onClick={()=>set('checklist',draft.checklist.filter(c=>c.id!==item.id))}>×</button></div>)}<button type="button" className="text-button" onClick={()=>set('checklist',[...draft.checklist,{id:crypto.randomUUID(),text:'',done:false}])}>+ Пункт</button></EditorSection>
        <EditorSection mobile={mobile} icon="folder" title={`Материалы${draft.links.length?` · ${draft.links.length}`:''}`}>{draft.links.map((link,i)=><div className="link-row" key={link.id}><input aria-label={`Название ссылки ${i+1}`} value={link.title} placeholder="Название документа" onChange={e=>set('links',draft.links.map(l=>l.id===link.id?{...l,title:e.target.value}:l))}/><input type="url" name={`links.${i}.url`} aria-label={`Адрес ссылки ${i+1}`} value={link.url} placeholder="https://…" onChange={e=>set('links',draft.links.map(l=>l.id===link.id?{...l,url:e.target.value}:l))}/><div>{/^https?:\/\//.test(link.url)&&<a href={link.url} target="_blank" rel="noreferrer">Открыть ↗</a>}<button type="button" className="text-button red" aria-label={`Удалить ссылку ${i+1}`} onClick={()=>set('links',draft.links.filter(l=>l.id!==link.id))}>Убрать</button></div></div>)}<button type="button" className="text-button" onClick={()=>set('links',[...draft.links,{id:crypto.randomUUID(),title:'',url:''}])}>+ Ссылка</button></EditorSection>
        {existing&&<div className="task-danger">{stageOf(board,draft)==='done'&&<button type="button" onClick={()=>save({archived:!draft.archived})}>{draft.archived?'Вернуть из архива':'В архив'}</button>}<button type="button" className="red" onClick={async()=>{if(window.confirm('Удалить задачу? Связи с ней будут убраны из других задач.'))if(await act({type:'deleteTask',id:draft.id}))onClose();}}>Удалить задачу</button></div>}
      </fieldset>
      </div>
      <fieldset className="task-editor-actions" disabled={busy||saving}>
        {error&&<p id="task-editor-error" className="error-text" role="alert" tabIndex={-1}>{error}</p>}
        <div className="save-bar"><button className="marker-button" type="submit">{saving?'Сохраняю…':'Сохранить'}</button><button type="button" onClick={close}>Отмена</button><small>{dirty?'Есть несохранённые изменения':'Все изменения сохранены'}</small></div>
      </fieldset>
    </form>
  </Modal>;
}
