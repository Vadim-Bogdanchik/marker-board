import { access } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupSqlite } from '../server/sqlite.js';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
process.umask(0o077);
const data=path.resolve(process.env.BOARD_DATA_DIR || '.local');
try {
  const filename=path.join(data,'board.sqlite');await access(filename);
  const sqlite=new DatabaseSync(filename,{readOnly:true,timeout:5000});
  try {
    const target=path.join(data,'backups',`board-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
    await backupSqlite(sqlite,target);console.log(`Резервная копия: ${target}`);
  } finally{sqlite.close();}
} catch(error) {
  console.error('Не удалось сделать копию SQLite:',error instanceof Error?error.message:error);process.exitCode=1;
}
