import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, rm, readdir, mkdtemp } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareDatabase } from '../server/bootstrap.js';
import { backupSqlite } from '../server/sqlite.js';
import { createStore } from '../server/store.js';
import { makeApp } from '../server/app.js';
import { migrate } from '../server/migrate.js';
import { newTask, type Board } from '../shared/model.js';

test('real SQLite: API, transactions, imports, persistence, access checks and failed migration',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'marker-test-')),connection=path.join(dir,'board.sqlite');
  let store:ReturnType<typeof createStore>|undefined,app:Awaited<ReturnType<typeof makeApp>>|undefined;
  try {
    await migrate(connection,{backupDir:dir});store=createStore(connection);await store.initialize();app=await makeApp(store,false);
    const headers={host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json','x-board-request':'1'};
    const get=async()=>{const r=await app!.inject({url:'/api/board',headers:{host:'localhost:3000'}});assert.equal(r.statusCode,200);return r.json<Board>();};
    const act=async(action:unknown,revision:number)=>app!.inject({method:'POST',url:'/api/actions',headers,payload:{revision,action}});
    let b=await get();assert.equal(b.tasks.length,0);
    const a=newTask(b,'Интеграционная задача');a.description='Проверка сохранения';let r=await act({type:'saveTask',task:a},b.revision);assert.equal(r.statusCode,200,r.body);b=r.json();
    const dep=newTask(b,'Получить контракт');r=await act({type:'saveTask',task:dep},b.revision);assert.equal(r.statusCode,200,r.body);b=r.json();
    const draft={...b.tasks[0],dependencies:[dep.id],checklist:[{id:crypto.randomUUID(),text:'Проверить коды',done:true}]};
    r=await act({type:'saveTask',task:draft},b.revision);assert.equal(r.statusCode,200,r.body);b=r.json();
    const before=await get();
    r=await act({type:'saveTask',task:{...b.tasks.find(t=>t.id===dep.id),dependencies:[a.id]}},b.revision);assert.equal(r.statusCode,400);assert.deepEqual(await get(),before);
    r=await act({type:'moveTask',id:a.id,columnId:b.columns[4].id,beforeId:null},b.revision);assert.equal(r.statusCode,409);assert.equal(r.json().code,'DEPENDENCIES_OPEN');assert.deepEqual(await get(),before);
    r=await act({type:'moveTask',id:a.id,columnId:b.columns[4].id,beforeId:null,confirmBlocked:true},b.revision);assert.equal(r.statusCode,200,r.body);b=r.json();
    r=await act({type:'settings',settings:b.settings},b.revision-1);assert.equal(r.statusCode,409);assert.equal(r.json().code,'STALE');
    const exported=(await app.inject({url:'/api/export',headers:{host:'localhost:3000'}})).json();
    const broken=structuredClone(exported);broken.board.tasks[0].columnId=crypto.randomUUID();r=await act({type:'import',backup:broken},b.revision);assert.equal(r.statusCode,400);assert.deepEqual(await get(),b);
    r=await act({type:'deleteTask',id:dep.id},b.revision);assert.equal(r.statusCode,200);b=r.json();
    r=await act({type:'import',backup:exported},b.revision);assert.equal(r.statusCode,200,r.body);b=r.json();
    assert.deepEqual({...b,revision:exported.board.revision},exported.board);
    const badOrigin=await app.inject({method:'POST',url:'/api/actions',headers:{...headers,origin:'https://untrusted.invalid'},payload:{revision:b.revision,action:{type:'demo'}}});assert.equal(badOrigin.statusCode,403);
    const badHost=await app.inject({url:'/api/board',headers:{host:'untrusted.invalid'}});assert.equal(badHost.statusCode,403);
    const noToken=await app.inject({method:'POST',url:'/api/actions',headers:{host:'localhost:3000',origin:'http://localhost:3000'},payload:{revision:b.revision,action:{type:'demo'}}});assert.equal(noToken.statusCode,403);
    const archived={...b.tasks.find(t=>t.id===a.id)!,archived:true};r=await act({type:'saveTask',task:archived},b.revision);assert.equal(r.statusCode,200,r.body);b=r.json();
    await app.close();await store.close();store=createStore(connection);await store.initialize();assert.deepEqual(await store.get(),b);
    // A failing SQL migration must roll back preceding statements, leave tasks untouched,
    // and produce a consistent SQLite backup before attempting an upgrade.
    await mkdir(dir,{recursive:true});
    await writeFile(path.join(dir,'001_initial.sql'),await readFile('server/migrations/001_initial.sql'));
    await writeFile(path.join(dir,'002_broken.sql'),'CREATE TABLE rollback_probe(id integer); SELECT nonexistent_function();');
    await assert.rejects(migrate(connection,{migrationDir:dir,backupDir:dir}));
    assert.deepEqual(await store.get(),b);
    const raw=new DatabaseSync(connection);
    try {
      assert.equal(raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='rollback_probe'").get()!.n,0);
      assert.equal(raw.prepare("SELECT count(*) AS n FROM schema_migrations WHERE name='002_broken.sql'").get()!.n,0);
    }finally{raw.close();}
    const dump=(await readdir(dir)).find(name=>name.startsWith('before-migration-')&&name.endsWith('.sqlite'));assert.ok(dump,'Migration backup exists');
    const restored=createStore(path.join(dir,dump));try{assert.deepEqual(await restored.get(),b);}finally{await restored.close();}
    await writeFile(path.join(dir,'001_initial.sql'),'-- changed\n'+await readFile('server/migrations/001_initial.sql','utf8'));
    await assert.rejects(migrate(connection,{migrationDir:dir,backupDir:dir}),/изменена/);
    assert.deepEqual(await store.get(),b);
    console.log('SQLite/API: все сценарии пройдены.');
  } finally {
    await app?.close().catch(()=>{});await store?.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});

test('SQLite: ordering, concurrent revisions, SQL rollback, online backup',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'marker-transactions-'));
  const store=await prepareDatabase(dir),file=path.join(dir,'board.sqlite'),second=createStore(file);
  const raw=new DatabaseSync(file);
  try {
    let b=await store.get();
    for(const title of ['Первая','Вторая','Третья'])b=await store.act(b.revision,{type:'saveTask',task:newTask(b,title)});
    const last=b.tasks[2],first=b.tasks[0];
    b=await store.act(b.revision,{type:'moveTask',id:last.id,columnId:first.columnId,beforeId:first.id});
    assert.deepEqual((await store.get()).tasks.map(t=>t.title),['Третья','Первая','Вторая']);
    const concurrent=await Promise.allSettled([
      store.act(b.revision,{type:'settings',settings:{...b.settings,theme:'night'}}),
      second.act(b.revision,{type:'settings',settings:{...b.settings,theme:'day'}}),
      second.get(),
    ]);
    assert.equal(concurrent[0].status,'fulfilled');assert.equal(concurrent[1].status,'rejected');
    if(concurrent[1].status==='rejected')assert.equal(concurrent[1].reason.code,'STALE');
    assert.equal(concurrent[2].status,'fulfilled');b=await store.get();assert.equal(b.settings.theme,'night');
    raw.exec("CREATE TRIGGER fail_write BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'simulated disk error'); END;");
    await assert.rejects(store.act(b.revision,{type:'deleteTask',id:first.id}));
    assert.deepEqual(await store.get(),b,'Delete/reinsert failed partway: all rows and revision rolled back');
    raw.exec('DROP TRIGGER fail_write');
    const backup=path.join(dir,'snapshot.sqlite');await backupSqlite(raw,backup);
    const restored=createStore(backup);try{assert.deepEqual(await restored.get(),b);}finally{await restored.close();}
    await store.close();await second.close();
    const reopened=await prepareDatabase(dir);try{assert.deepEqual(await reopened.get(),b);}finally{await reopened.close();}
  }finally{raw.close();await store.close();await second.close();await rm(dir,{recursive:true,force:true});}
});

test('SQLite bootstrap: legacy JSON preserves data and revision; malformed seed never creates a board',async()=>{
  const sourceDir=await mkdtemp(path.join(tmpdir(),'marker-source-')),targetDir=await mkdtemp(path.join(tmpdir(),'marker-import-'));
  const source=await prepareDatabase(sourceDir);
  try {
    let b=await source.get();b=await source.act(b.revision,{type:'demo'});
    const backup={format:'marker-board',version:1,exportedAt:new Date().toISOString(),board:b};
    await mkdir(path.join(targetDir,'postgres'));await writeFile(path.join(targetDir,'postgres','PG_VERSION'),'18');
    await assert.rejects(prepareDatabase(targetDir),/старая база PostgreSQL/);
    await writeFile(path.join(targetDir,'postgres-export.json'),'broken');
    await assert.rejects(prepareDatabase(targetDir));
    const empty=createStore(path.join(targetDir,'board.sqlite'));try{assert.equal(await empty.hasBoard(),false);}finally{await empty.close();}
    await writeFile(path.join(targetDir,'postgres-export.json'),JSON.stringify(backup));
    const imported=await prepareDatabase(targetDir);
    try{assert.deepEqual(await imported.get(),b);b=await imported.act(b.revision,{type:'settings',settings:{...b.settings,theme:'night',motion:false}});}finally{await imported.close();}
    // Subsequent startup must ignore even a damaged old export, and never reset edits.
    await writeFile(path.join(targetDir,'postgres-export.json'),'broken');
    const reopened=await prepareDatabase(targetDir);try{assert.deepEqual(await reopened.get(),b);}finally{await reopened.close();}
  }finally{await source.close();await rm(sourceDir,{recursive:true,force:true});await rm(targetDir,{recursive:true,force:true});}
});

test('complete multi-team API workflow: directories, task fields, archive, export, invalid requests',async()=>{
  const {withTeamMocks}=await import('../shared/teamMocks.js');
  const dir=await mkdtemp(path.join(tmpdir(),'marker-teams-')),store=await prepareDatabase(dir),app=await makeApp(store,false);
  const headers={host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json','x-board-request':'1'};
  try {
    let b=await store.get();
    const act=async(action:unknown,status=200)=>{const r=await app.inject({method:'POST',url:'/api/actions',headers,payload:{revision:b.revision,action}});assert.equal(r.statusCode,status,r.body);if(status===200)b=r.json();return r;};
    const seed=withTeamMocks(b);await act({type:'import',backup:{format:'marker-board',version:1,exportedAt:new Date().toISOString(),board:seed}});
    const item={id:crypto.randomUUID(),kind:'team',name:'Временная команда'};
    await act({type:'saveDirectory',item});await act({type:'saveDirectory',item:{...item,name:'Переименованная команда'}});
    assert.equal((await store.get()).directories.find(d=>d.id===item.id)?.name,'Переименованная команда');
    const task={...newTask(b,'Полная карточка'),description:'Проверяем все поля',category:'colleague',priority:'high',assigneeId:b.directories.find(d=>d.name.includes('Максим'))!.id,teamId:item.id,projectId:b.directories.find(d=>d.kind==='project')!.id,dueDate:'2026-11-05',nextStep:'Обсудить API',waitingFor:'Платформа',waitingWhat:'Схема',remindOn:'2026-11-01',blockedReason:'Нет доступа',focused:true,checklist:[{id:crypto.randomUUID(),text:'Проверить контракт',done:true}],links:[{id:crypto.randomUUID(),title:'Спецификация',url:'https://example.com/qa'}]};
    await act({type:'saveTask',task});const persisted=(await store.get()).tasks.find(t=>t.id===task.id)!;
    for(const key of ['description','category','priority','assigneeId','teamId','projectId','dueDate','nextStep','waitingFor','waitingWhat','remindOn','blockedReason','focused','checklist','links'] as const)assert.deepEqual(persisted[key],task[key]);
    await act({type:'deleteDirectory',id:item.id},400);await act({type:'saveDirectory',item:{...item,kind:'person'}},400);
    await act({type:'renameColumn',id:b.columns[0].id,title:'Новые задачи'});assert.equal((await store.get()).columns[0].title,'Новые задачи');
    const archived=b.tasks.find(t=>t.archived)!;await act({type:'saveTask',task:{...archived,archived:false}});assert.equal(b.tasks.find(t=>t.id===archived.id)!.archived,false);
    await act({type:'moveTask',id:archived.id,columnId:b.columns[1].id,beforeId:null});assert.equal(b.tasks.find(t=>t.id===archived.id)!.completedAt,null);
    await act({type:'saveTask',task:{...b.tasks.find(t=>t.id===archived.id),archived:true}},400);
    await act({type:'settings',settings:{theme:'night',motion:false,wipLimit:1}});assert.deepEqual((await store.get()).settings,{theme:'night',motion:false,wipLimit:1});
    const exported=(await app.inject({url:'/api/export',headers})).json();await act({type:'deleteTask',id:task.id});await act({type:'deleteDirectory',id:item.id});
    await act({type:'import',backup:exported});assert.deepEqual({...await store.get(),revision:exported.board.revision},exported.board);
    const before=await store.get();await act({type:'import',backup:{...exported,version:999}},400);await act({type:'saveTask',task:{...task,dueDate:'2026-02-30'}},400);assert.deepEqual(await store.get(),before);
    const malformed=await app.inject({method:'POST',url:'/api/actions',headers,payload:'{broken'});assert.equal(malformed.statusCode,400);
    const raw=new DatabaseSync(path.join(dir,'board.sqlite'));raw.exec("CREATE TRIGGER fail_api_write BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'private db failure'); END;");
    try {const r=await act({type:'deleteTask',id:task.id},500);assert.equal(r.json().code,'SERVER');assert.ok(!r.body.includes('private db failure')&&!r.body.includes('insert into'));assert.deepEqual(await store.get(),before);}finally{raw.exec('DROP TRIGGER fail_api_write');raw.close();}
  }finally{await app.close();await store.close();await rm(dir,{recursive:true,force:true});}
});
