import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prepareDatabase } from '../server/bootstrap.js';
import { makeApp } from '../server/app.js';
import { initialBoard, newTask, validateBoard, BoardError } from '../shared/model.js';
import { makeSketchItem } from '../shared/sketch.js';
import { CardBody } from '../src/BoardView.js';
import { SketchDrawing } from '../src/sketch/SketchDrawing.js';

const headers={host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json','x-board-request':'1'};
async function fixture(staticFiles=false){
  const dir=await mkdtemp(path.join(tmpdir(),'marker-security-')),store=await prepareDatabase(dir),publicDir=path.join(dir,'public');
  if(staticFiles){await mkdir(publicDir);await writeFile(path.join(publicDir,'index.html'),'<!doctype html><title>Security fixture</title>');}
  const app=await makeApp(store,staticFiles,3000,publicDir);
  return {dir,store,app,close:async()=>{await app.close();await store.close();await rm(dir,{recursive:true,force:true});}};
}

test('security: Host, Origin, Fetch Metadata and custom-header checks protect local APIs',async()=>{
  const f=await fixture();
  try{
    const before=await f.store.get();
    for(const origin of ['https://attacker.invalid','null','http://localhost:3000.attacker.invalid','http://localhost:3333']){
      for(const url of ['/api/board','/api/sketch','/api/export']){
        const r=await f.app.inject({url,headers:{host:headers.host,origin}});assert.equal(r.statusCode,403);
        assert.equal(r.headers['access-control-allow-origin'],undefined);
      }
      assert.equal((await f.app.inject({method:'POST',url:'/api/actions',headers:{...headers,origin},payload:{revision:0,action:{type:'demo'}}})).statusCode,403);
    }
    for(const site of ['same-site','cross-site'])assert.equal((await f.app.inject({url:'/api/export',headers:{host:headers.host,'sec-fetch-site':site}})).statusCode,403);
    for(const site of ['same-origin','none'])assert.equal((await f.app.inject({url:'/api/board',headers:{host:headers.host,'sec-fetch-site':site}})).statusCode,200);
    for(const host of ['attacker.invalid','localhost:3000.attacker.invalid','127.0.0.1:9999'])assert.equal((await f.app.inject({url:'/api/board',headers:{host,'x-forwarded-host':headers.host}})).statusCode,403);
    for(const missing of ['origin','x-board-request'] as const){const h={...headers};delete (h as Partial<typeof headers>)[missing];assert.equal((await f.app.inject({method:'POST',url:'/api/actions',headers:h,payload:{revision:0,action:{type:'demo'}}})).statusCode,403);}
    for(const type of ['text/plain','application/x-www-form-urlencoded','application/json-evil'])assert.equal((await f.app.inject({method:'POST',url:'/api/actions',headers:{...headers,'content-type':type},payload:'{}'})).statusCode,403);
    const r=await f.app.inject({url:'/api/board',headers:{host:headers.host}});
    assert.equal(r.statusCode,200);assert.equal(r.headers['cache-control'],'no-store');
    assert.equal(r.headers['cross-origin-resource-policy'],'same-origin');assert.equal(r.headers['x-frame-options'],'DENY');
    assert.match(String(r.headers['content-security-policy']),/frame-ancestors 'none'/);
    assert.match(String(r.headers['content-security-policy']),/script-src 'self';/);
    assert.equal(f.app.initialConfig.connectionTimeout,30_000);
    assert.ok('requestTimeout' in f.app.server);
    assert.equal(f.app.server.requestTimeout,30_000);
    assert.deepEqual(await f.store.get(),before);
  }finally{await f.close();}
});

test('security: malformed JSON, prototype keys, large bodies and unsafe links cannot change saved data',async()=>{
  const f=await fixture();
  try{
    const before=await f.store.get();
    const post=(payload:unknown)=>f.app.inject({method:'POST',url:'/api/actions',headers,payload:payload as string});
    for(const raw of ['{','{"__proto__":{"polluted":true}}','{"constructor":{"prototype":{"polluted":true}}}'])assert.equal((await post(raw)).statusCode,400);
    assert.equal(({} as Record<string,unknown>).polluted,undefined);
    assert.equal((await post(' '.repeat(12*1024*1024+1))).statusCode,413);
    const oversizedError=await post({revision:0,action:{type:'saveTask',task:Object.fromEntries(Array.from({length:1000},(_,i)=>['unknown'+i,'value']))}});
    assert.equal(oversizedError.statusCode,400);assert.ok(oversizedError.body.length<3000);
    for(const url of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///etc/passwd']){
      const task=newTask(before,'Link test');task.links=[{id:crypto.randomUUID(),title:'Link',url}];
      assert.equal((await post({revision:0,action:{type:'saveTask',task}})).statusCode,400);
    }
    assert.deepEqual(await f.store.get(),before);
    const title="'; DROP TABLE tasks; -- <script>alert(1)</script>",task=newTask(before,title);
    const saved=await post({revision:0,action:{type:'saveTask',task}});assert.equal(saved.statusCode,200);
    assert.equal((await f.store.get()).tasks[0].title,title);await f.store.health();
    if(process.platform!=='win32')assert.equal((await stat(path.join(f.dir,'board.sqlite'))).mode&0o777,0o600);
  }finally{await f.close();}
});

test('security: static server does not expose private paths or allow framed HTML',async()=>{
  const f=await fixture(true),name=`security-probe-${crypto.randomUUID()}.txt`,probe=path.join(f.dir,name),secret=crypto.randomUUID();
  await writeFile(probe,secret,{mode:0o600});
  try{
    for(const url of [`/${name}`,`/../${name}`,`/%2e%2e/${name}`,`/..%2f${name}`,'/.local/board.sqlite','/.git/config','/package.json']){
      const r=await f.app.inject({url,headers:{host:headers.host}});assert.ok(!r.body.includes(secret));
      assert.ok(!r.body.includes('repositoryformatversion'));assert.ok(!r.body.includes('"dependencies":'));
    }
    const page=await f.app.inject({url:'/',headers:{host:headers.host}});assert.equal(page.statusCode,200);assert.equal(page.headers['x-frame-options'],'DENY');
  }finally{await rm(probe,{force:true});await f.close();}
});

test('security: task text and SVG labels render markup as text, never executable elements',()=>{
  const b=initialBoard(),payload='<script>alert(1)</script><img src=x onerror=alert(1)>',task=newTask(b,payload);
  b.tasks=[task];
  const html=renderToStaticMarkup(createElement(CardBody,{board:b,task}));
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;script&gt;'));
  const svg=renderToStaticMarkup(createElement(SketchDrawing,{item:{...makeSketchItem('text',10,10),text:payload,w:2000}}));
  assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<img src=x'));assert.ok(svg.includes('&lt;script&gt;'));
});

test('security: a maximum-size dependency chain validates without stack overflow and cycles still fail',()=>{
  const b=initialBoard();b.tasks=Array.from({length:10000},(_,i)=>newTask(b,`Task ${i}`));
  b.tasks.forEach((t,i)=>{if(i+1<b.tasks.length)t.dependencies=[b.tasks[i+1].id];});
  assert.doesNotThrow(()=>validateBoard(b));
  b.tasks.at(-1)!.dependencies=[b.tasks[0].id];
  assert.throws(()=>validateBoard(b),e=>e instanceof BoardError&&e.message.includes('замкнутый'));
});
