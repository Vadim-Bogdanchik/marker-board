import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import { z } from 'zod';
import { actionSchema, BoardError } from '../shared/model.js';
import type { Store } from './store.js';
import { sketchItemsSchema } from '../shared/sketch.js';
export async function makeApp(store: Store, serveStatic = true, port = 3000, staticRoot = path.resolve('dist')) {
  const app=Fastify({logger:false,bodyLimit:12*1024*1024,requestTimeout:30_000,connectionTimeout:30_000,maxRequestsPerSocket:100});
  const origins=new Set([`http://localhost:${port}`,`http://127.0.0.1:${port}`,...(process.env.NODE_ENV==='development'?['http://localhost:5173','http://127.0.0.1:5173']:[])]);
  app.addHook('onRequest',async(req,reply)=>{
    if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host || '')) return reply.code(403).send({error:'Недопустимый адрес приложения'});
    if(req.url.startsWith('/api')) {
      reply.header('Cache-Control','no-store');
      const origin=req.headers.origin,site=req.headers['sec-fetch-site'];
      // Same-site is not same-origin: another localhost port is not trusted.
      // Headerless local CLI clients remain supported; this is browser-origin
      // protection, not authentication for a future network deployment.
      if(origin!==undefined&&!origins.has(origin)||((site==='cross-site'||site==='same-site')&&!origins.has(origin||'')))
        return reply.code(403).send({error:'Доступ к данным разрешён только из локального приложения'});
    }
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if(!origins.has(req.headers.origin || '') || req.headers['x-board-request']!=='1' || req.headers['content-type']?.split(';',1)[0].trim().toLowerCase()!=='application/json')
        return reply.code(403).send({error:'Изменения разрешены только из локального приложения'});
    }
  });
  app.addHook('onSend',async(_req,reply)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');
    reply.header('Cross-Origin-Resource-Policy','same-origin').header('Cross-Origin-Opener-Policy','same-origin');
    reply.header('X-Frame-Options','DENY').header('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  });
  app.setErrorHandler((error,req,reply)=>{
    if(error instanceof z.ZodError) return reply.code(400).send({error:error.issues.slice(0,5).map(i=>`${i.path.join('.').slice(0,160)}: ${i.message.slice(0,240)}`).join('; '),code:'INVALID'});
    if(error instanceof BoardError) return reply.code(error.status).send({error:error.message,code:error.code});
    if(error instanceof Error && 'statusCode' in error && error.statusCode===400) return reply.code(400).send({error:'Некорректный формат запроса. Проверьте JSON.',code:'INVALID'});
    if(error instanceof Error && 'statusCode' in error && error.statusCode===413) return reply.code(413).send({error:'Файл слишком большой. Максимум — 12 МБ.',code:'INVALID'});
    if(error instanceof Error && 'statusCode' in error && error.statusCode===415) return reply.code(415).send({error:'Поддерживается только JSON без сжатия.',code:'INVALID'});
    console.error('Ошибка операции',req.method,req.url);
    reply.code(500).send({error:'Не удалось сохранить изменения. Проверьте работу базы и повторите попытку.',code:'SERVER'});
  });
  app.get('/api/board',()=>store.get());
  app.get('/api/health',async()=>{await store.health();return {ok:true,database:'sqlite'};});
  app.get('/api/sketch',async()=>(await store.get()).sketch);
  app.post('/api/sketch',async req=>{const body=z.object({revision:z.number().int().min(0),items:sketchItemsSchema}).strict().parse(req.body);return store.saveSketch(body.revision,body.items);});
  app.post('/api/actions',async req=>{const body=z.object({revision:z.number().int().min(0),action:actionSchema}).strict().parse(req.body);return store.act(body.revision,body.action);});
  app.get('/api/export',async(_req,reply)=>{reply.header('Content-Disposition',`attachment; filename="marker-board-${new Date().toISOString().slice(0,10)}.json"`);return {format:'marker-board',version:2,exportedAt:new Date().toISOString(),board:await store.get()};});
  if(serveStatic) {
    await app.register(staticPlugin,{root:staticRoot});
    app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api')?reply.code(404).send({error:'Операция не найдена'}):reply.sendFile('index.html'));
  }
  return app;
}
