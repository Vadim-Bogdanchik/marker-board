import { access, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); process.chdir(root);
process.umask(0o077);
const local=path.resolve(process.env.BOARD_DATA_DIR || path.join(root,'.local')), lock=path.join(local,'start.lock');
let locked=false, server, ending=false;
const children=new Set();
const exists=async p=>access(p).then(()=>true,()=>false);
function run(command,args,options={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit',...options});
    children.add(child);child.once('exit',()=>children.delete(child));
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Не удалось выполнить ${path.basename(command)} (код ${code}).`)));
  });
}
function npm(args) {
  // npm_execpath points at npm-cli.js on Windows too: no shell or .cmd quoting needed.
  if(process.env.npm_execpath)return run(process.execPath,[process.env.npm_execpath,...args]);
  return run(process.platform==='win32'?'npm.cmd':'npm',args,{shell:process.platform==='win32'});
}
async function freePort(port) {
  return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error(`Порт ${port} занят. Остановите другой экземпляр приложения и повторите npm start.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
}
async function cleanup(code=0) {
  if(ending)return;ending=true;
  await Promise.all([...children].map(async child=>{
    if(child.exitCode!==null || child.signalCode!==null)return;
    await new Promise(resolve=>{
      child.once('exit',resolve);
      const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},7000);
      timer.unref();child.once('exit',()=>clearTimeout(timer));child.kill('SIGTERM');
    });
  }));
  if(locked) await rm(lock,{recursive:true,force:true});process.exit(code);
}
process.on('SIGINT',()=>cleanup());process.on('SIGTERM',()=>cleanup());
try {
  if(Number(process.versions.node.split('.')[0])<24) throw new Error('Нужен Node.js 24 или новее.');
  await mkdir(local,{recursive:true,mode:0o700});
  try {await mkdir(lock);locked=true;} catch {
    let pid;try{pid=Number(await readFile(path.join(lock,'pid'),'utf8'));}catch{}
    let alive=true;if(pid){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}}
    if(alive)throw new Error('Приложение уже запускается. Проверьте другой терминал.');
    await rm(lock,{recursive:true});await mkdir(lock);locked=true;
  }
  await writeFile(path.join(lock,'pid'),String(process.pid));
  await freePort(3000);
  const lockContent=await readFile('package-lock.json');const depHash=createHash('sha256').update(lockContent).digest('hex');
  let installed='';try{installed=await readFile('node_modules/.marker-lock','utf8');}catch{}
  if(installed!==depHash || !await exists('node_modules/tsx/dist/cli.mjs')) {
    console.log('Подготавливаю зависимости…');await npm(['ci','--no-audit','--no-fund']);await writeFile('node_modules/.marker-lock',depHash);
  }
  console.log('Собираю доску…');await npm(['run','build']);
  server=spawn(process.execPath,['--import','tsx','server/main.ts'],{stdio:'inherit',env:{...process.env,NODE_ENV:process.env.NODE_ENV||'production'}});
  children.add(server);server.once('exit',()=>children.delete(server));
  server.once('error',error=>{console.error(error.message);void cleanup(1);});
  server.once('exit',code=>{if(!ending)void cleanup(code||0);});
  for(let i=0;i<100;i++) {
    if(server.exitCode!==null)throw new Error('Сервер остановился. Проверьте сообщение выше.');
    const ready=await fetch('http://127.0.0.1:3000/api/health').then(r=>r.ok,()=>false);
    if(ready) {
      if(process.env.BOARD_NO_OPEN!=='1') {const opener=process.platform==='darwin'?'open':process.platform==='win32'?'explorer':'xdg-open';spawn(opener,['http://localhost:3000'],{stdio:'ignore'}).on('error',()=>{});}
      console.log(`Для остановки нажмите Ctrl+C. Данные: ${path.join(local,'board.sqlite')}`);break;
    }
    if(i===99)throw new Error('Сервер не ответил вовремя. Проверьте журналы запуска.');
    await new Promise(resolve=>setTimeout(resolve,200));
  }
} catch(error) {console.error(`\n${error.message}`);await cleanup(1);}
