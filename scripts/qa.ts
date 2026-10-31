import path from 'node:path';
import { prepareDatabase } from '../server/bootstrap.js';
import { makeApp } from '../server/app.js';
import { withTeamMocks } from '../shared/teamMocks.js';
process.umask(0o077);
const dir=path.resolve('.local/qa'),store=await prepareDatabase(dir);
let board=await store.get();
if(!board.tasks.length)await store.act(board.revision,{type:'import',backup:{format:'marker-board',version:1,exportedAt:new Date().toISOString(),board:withTeamMocks(board)}});
const app=await makeApp(store,true,3100);
try{await app.listen({host:'127.0.0.1',port:3100});}catch(error){await app.close();await store.close();throw error;}
console.log(`Тестовая доска: http://localhost:3100 · данные: ${dir}`);
let closing=false;
async function close(){if(closing)return;closing=true;await app.close();await store.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
