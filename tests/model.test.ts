import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, initialBoard, newTask, validateBoard, dailyOverview, localDate, demoBoard, dateSchema } from '../shared/model.js';
test('dependencies reject self-reference, missing references and indirect cycles',()=>{
  const b=initialBoard(),a=newTask(b,'A'),c=newTask(b,'B'),d=newTask(b,'C');b.tasks=[a,c,d];
  a.dependencies=[c.id];c.dependencies=[d.id];assert.doesNotThrow(()=>validateBoard(b));
  d.dependencies=[a.id];assert.throws(()=>validateBoard(b),/замкнутый/);
  d.dependencies=[d.id];assert.throws(()=>validateBoard(b),/себя/);
  d.dependencies=[crypto.randomUUID()];assert.throws(()=>validateBoard(b),/Не найдена/);
});
test('completion warns about open dependencies, explicit confirmation succeeds, start time survives reopen',()=>{
  let b=initialBoard();const a=newTask(b,'A'),dep=newTask(b,'Dependency');a.dependencies=[dep.id];b.tasks=[a,dep];
  assert.throws(()=>applyAction(b,{type:'moveTask',id:a.id,columnId:b.columns[4].id,beforeId:null}),/незавершённые/);
  b=applyAction(b,{type:'moveTask',id:a.id,columnId:b.columns[4].id,beforeId:null,confirmBlocked:true});
  const finished=b.tasks.find(t=>t.id===a.id)!;assert.ok(finished.startedAt);assert.ok(finished.completedAt);
  b=applyAction(b,{type:'moveTask',id:a.id,columnId:b.columns[1].id,beforeId:null});
  const reopened=b.tasks.find(t=>t.id===a.id)!;assert.equal(reopened.completedAt,null);assert.equal(reopened.startedAt,finished.startedAt);
});
test('daily overview uses local calendar days including month boundary and excludes done tasks',()=>{
  const now=new Date(2026,9,31,23,55),b=initialBoard();
  const add=(name:string,dueDate:string)=>{const t=newTask(b,name);t.dueDate=dueDate;b.tasks.push(t);return t;};
  const overdue=add('late','2026-10-30'),today=add('today','2026-10-31'),week=add('week','2026-11-07'),later=add('later','2026-11-08');
  today.focused=true;week.waitingFor='Анна';week.remindOn='2026-10-31';later.waitingWhat='Требования';overdue.blockedReason='Нет доступа';
  const view=dailyOverview(b,now);
  assert.deepEqual(view.overdue.map(t=>t.id),[overdue.id]);assert.deepEqual(view.today.map(t=>t.id),[today.id]);assert.deepEqual(view.upcoming.map(t=>t.id),[week.id]);
  assert.deepEqual(view.reminders.map(t=>t.id),[week.id]);assert.deepEqual(view.unscheduled.map(t=>t.id),[later.id]);assert.equal(view.blocked.length,1);
  const done=applyAction(b,{type:'moveTask',id:today.id,columnId:b.columns[4].id,beforeId:null});assert.equal(dailyOverview(done,now).focus.length,0);
  assert.equal(localDate(now),'2026-10-31');
});
test('reordering preserves task IDs; invalid target never mutates original',()=>{
  let b=initialBoard();const a=newTask(b,'A'),c=newTask(b,'B');b.tasks=[a,c];
  const original=structuredClone(b);assert.throws(()=>applyAction(b,{type:'moveTask',id:a.id,columnId:b.columns[0].id,beforeId:crypto.randomUUID()}));assert.deepEqual(b,original);
  b=applyAction(b,{type:'moveTask',id:c.id,columnId:b.columns[0].id,beforeId:a.id});assert.deepEqual(b.tasks.map(t=>t.id),[c.id,a.id]);
});
test('bad imports reject duplicate IDs, invalid ownership, dates and unsafe links',()=>{
  const b=demoBoard(initialBoard());assert.doesNotThrow(()=>validateBoard(b));
  const duplicate=structuredClone(b);duplicate.tasks.push(duplicate.tasks[0]);assert.throws(()=>validateBoard(duplicate),/Повторяющиеся/);
  const orphan=structuredClone(b);orphan.tasks[0].projectId=crypto.randomUUID();assert.throws(()=>validateBoard(orphan),/справочника/);
  assert.equal(dateSchema.safeParse('2026-02-29').success,false);assert.equal(dateSchema.safeParse('2028-02-29').success,true);
  const unsafe=structuredClone(b);unsafe.tasks[0].links=[{id:crypto.randomUUID(),title:'XSS',url:'javascript:alert(1)'}];assert.throws(()=>validateBoard(unsafe));
});
test('deletion removes dependencies and directory deletion protects referenced entries',()=>{
  const b=demoBoard(initialBoard());const dependent=b.tasks.find(t=>t.dependencies.length)!;const id=dependent.dependencies[0];
  const next=applyAction(b,{type:'deleteTask',id});assert.equal(next.tasks.find(t=>t.id===dependent.id)!.dependencies.length,0);
  assert.throws(()=>applyAction(b,{type:'deleteDirectory',id:b.tasks[0].projectId!}),/используется/);
});

test('custom columns support shared stages, safe removal and legacy widths', () => {
  let board = initialBoard();
  const [inbox, todo, , , done] = board.columns;
  const legacy = {...board, columns:board.columns.map(({width, ...c}) => c)};
  assert.deepEqual(validateBoard(legacy), board);
  board = applyAction(board, {type:'addColumn', stage:'todo', title:'Backlog'});
  const backlog = board.columns.find(c => c.title === 'Backlog')!;
  const waiting = newTask(board,'Жду ответа',todo.id);
  const pending = newTask(board,'Нужен ответ',inbox.id);
  waiting.dependencies = [pending.id];
  board = applyAction(board, {type:'saveTask',task:pending});
  board = applyAction(board, {type:'saveTask',task:waiting});
  const remove = {type:'deleteColumn', id:todo.id} as const;
  assert.throws(() => applyAction(board,remove), /Выберите другую/);
  assert.throws(() => applyAction(board,{...remove,destination:done.id}), /незавершённые/);
  board = applyAction(board, {...remove,destination:backlog.id});
  assert.deepEqual(board.tasks[1].dependencies, [pending.id]);
  assert.equal(board.tasks[1].columnId, backlog.id);
  board = applyAction(board,{type:'deleteColumn',id:backlog.id,destination:done.id,confirmBlocked:true});
  assert.ok(board.tasks[1].completedAt);
  board = applyAction(board,{type:'saveTask',task:{...board.tasks[1],archived:true}});
  assert.throws(() => applyAction(board,{type:'deleteColumn',id:done.id,destination:inbox.id}), /архивных/);
  board = applyAction(board,{type:'addColumn',stage:'done',title:'Опубликовано'});
  const published=board.columns.at(-1)!;
  board = applyAction(board,{type:'deleteColumn',id:done.id,destination:published.id});
  assert.equal(board.tasks[1].archived,true);
  assert.equal(board.tasks[1].columnId,published.id);
  const single = {...initialBoard(),columns:[inbox]};
  assert.throws(() => applyAction(single,{type:'deleteColumn',id:inbox.id}), /хотя бы одну/);
  assert.equal(validateBoard(demoBoard(single)).columns.length,1);
});
