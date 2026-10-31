import path from 'node:path';
import { prepareDatabase } from './bootstrap.js';
import { makeApp } from './app.js';
process.umask(0o077);
const store=await prepareDatabase(path.resolve(process.env.BOARD_DATA_DIR || '.local'));
const app=await makeApp(store);
try {await app.listen({host:'127.0.0.1',port:3000});}
catch(error){await app.close();await store.close();throw error;}
console.log('Моя доска: http://localhost:3000 · SQLite');
let closing=false;
async function close(){if(closing)return;closing=true;await app.close();await store.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
