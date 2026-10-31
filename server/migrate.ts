import { readdir, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { openSqlite, backupSqlite, serialFor } from './sqlite.js';

export async function migrate(filename: string, options: { migrationDir?: string; backupDir: string }) {
  return serialFor(filename)(async () => {
    const sqlite = openSqlite(filename);
    try {
      sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
      const applied = sqlite.prepare('SELECT name, hash FROM schema_migrations').all() as {name:string;hash:string}[];
      const dir = options.migrationDir || path.resolve('server/migrations');
      const names = (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
      if (applied.some(m=>!names.includes(m.name))) throw new Error('База использует неизвестные миграции. Нужна соответствующая версия приложения.');
      const pending: {name:string;content:string;hash:string}[]=[];
      for(const name of names) {
        const content=await readFile(path.join(dir,name),'utf8'), hash=createHash('sha256').update(content).digest('hex');
        const prev=applied.find(r=>r.name===name);
        if(prev&&prev.hash!==hash) throw new Error(`Миграция ${name} изменена после применения. Восстановите исходный файл.`);
        if(!prev)pending.push({name,content,hash});
      }
      if(pending.length&&applied.length) {
        await backupSqlite(sqlite,path.join(options.backupDir,`before-migration-${Date.now()}-${randomUUID().slice(0,8)}.sqlite`));
        console.log('Резервная копия SQLite перед обновлением создана.');
      }
      if(pending.length) {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const record=sqlite.prepare('INSERT INTO schema_migrations(name,hash) VALUES(?,?)');
          for(const m of pending){sqlite.exec(m.content);record.run(m.name,m.hash);}
          if(sqlite.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Нарушены связи данных после миграции.');
          sqlite.exec('COMMIT');
        }catch(error){sqlite.exec('ROLLBACK');throw error;}
      }
    }finally{sqlite.close();}
  });
}
