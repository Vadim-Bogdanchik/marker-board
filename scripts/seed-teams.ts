import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backupSchema, validateBoard } from '../shared/model.js';
import { withTeamMocks } from '../shared/teamMocks.js';
process.umask(0o077);
const origin='http://localhost:3000';
try {
  const response=await fetch(`${origin}/api/export`);if(!response.ok)throw new Error('Основная доска недоступна. Сначала выполните npm start.');
  const backup=backupSchema.parse(await response.json());validateBoard(backup.board);
  const merged=withTeamMocks(backup.board);
  if(merged.tasks.length===backup.board.tasks.length&&merged.directories.length===backup.board.directories.length){console.log('Примеры команд уже добавлены.');process.exit(0);}
  const dir=path.resolve('.local/backups');await mkdir(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,`before-team-mocks-${Date.now()}.json`);await writeFile(file,JSON.stringify(backup,null,2),{mode:0o600});
  const result=await fetch(`${origin}/api/actions`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Board-Request':'1'},body:JSON.stringify({revision:backup.board.revision,action:{type:'import',backup:{...backup,board:merged}}})});
  if(!result.ok)throw new Error((await result.json()).error);
  console.log(`Добавлено ${merged.tasks.length-backup.board.tasks.length} учебных задач. Исходная доска: ${file}`);
}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
