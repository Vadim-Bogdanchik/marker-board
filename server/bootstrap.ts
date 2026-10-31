import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { backupSchema, validateBoard, type Board } from '../shared/model.js';
import { migrate } from './migrate.js';
import { createStore } from './store.js';
const exists=(file:string)=>access(file).then(()=>true,()=>false);
export async function prepareDatabase(dataDir: string) {
  const filename=path.join(dataDir,'board.sqlite');
  await migrate(filename,{backupDir:path.join(dataDir,'backups')});
  const store=createStore(filename);
  try {
    if(!await store.hasBoard()) {
      let seed:Board|undefined;
      const exported=path.join(dataDir,'postgres-export.json');
      if(await exists(exported))seed=validateBoard(backupSchema.parse(JSON.parse(await readFile(exported,'utf8'))).board);
      else if(await exists(path.join(dataDir,'postgres','PG_VERSION')))
        throw new Error('Найдена старая база PostgreSQL. Сначала экспортируйте доску из прежней версии в JSON и сохраните как .local/postgres-export.json. Пустая доска не создана.');
      await store.initialize(seed);
      if(seed) {
        if(!isDeepStrictEqual(await store.get(),seed))throw new Error('Проверка переноса не пройдена. Исходный JSON сохранён.');
        console.log(`Данные из PostgreSQL перенесены в SQLite: ${seed.tasks.length} задач. Исходные данные сохранены.`);
      }
    }
    return store;
  } catch(error){await store.close();throw error;}
}
