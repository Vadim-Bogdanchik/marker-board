import { mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { prepareDatabase } from '../server/bootstrap.js';
import { makeApp } from '../server/app.js';
import { makeSketchItem, type Point } from '../shared/sketch.js';

process.umask(0o077);
await mkdir('.local/performance',{recursive:true});
const dir=await mkdtemp(path.resolve('.local/performance/sketch-'));
const store=await prepareDatabase(dir);
// 48,000 points: dense but comfortably below the supported 120,000 limit.
const items=Array.from({length:120},(_,i)=>({...makeSketchItem('pen',20+(i%12)*78,20+Math.floor(i/12)*22),
  points:Array.from({length:400},(_,j)=>[j*.16,Math.sin(j/14+i)*7] as Point)}));
await store.saveSketch(0,items);
const app=await makeApp(store,true,3101);
await app.listen({host:'127.0.0.1',port:3101});
console.log(`Изолированный замер: http://localhost:3101/?sketchPerf=1 · 120 штрихов / 48000 точек · ${dir}`);
let closing=false;
async function close(){if(closing)return;closing=true;await app.close();await store.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
