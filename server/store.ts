import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { openSqlite, serialFor } from './sqlite.js';
import type { SQLInputValue } from 'node:sqlite';
import { asc, eq, sql } from 'drizzle-orm';
import * as s from './schema.js';
import { boardId, initialBoard, validateBoard, applyAction, BoardError, type Board, type Action } from '../shared/model.js';
import { emptySketch, sketchItemsSchema, type SketchItem } from '../shared/sketch.js';
type DB = Pick<SqliteRemoteDatabase<typeof s>, 'select' | 'insert' | 'delete'>;
export function createStore(filename: string) {
  const sqlite = openSqlite(filename), serial = serialFor(filename);
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query), values = params as SQLInputValue[];
    if (method === 'run') { statement.run(...values); return {rows: []}; }
    statement.setReturnArrays(true);
    if (method === 'get') return {rows: (statement.get(...values) || []) as unknown as unknown[]};
    return {rows: statement.all(...values)};
  }, {schema:s});
  async function read(tx: DB): Promise<Board|null> {
    const [board]=await tx.select().from(s.boards).where(eq(s.boards.id,boardId));
    if(!board)return null;
    const columns=await tx.select().from(s.columns).orderBy(asc(s.columns.position));
    const directories=await tx.select().from(s.directories).orderBy(sql`rowid`);
    const tasks=await tx.select().from(s.tasks).orderBy(asc(s.tasks.position));
    const dependencies=await tx.select().from(s.dependencies).orderBy(sql`rowid`);
    const checklist=await tx.select().from(s.checklist).orderBy(asc(s.checklist.position));
    const [sketch]=await tx.select().from(s.sketches).where(eq(s.sketches.boardId,boardId));
    return validateBoard({...board,
      sketch:sketch?{revision:sketch.revision,items:sketch.items}:emptySketch(),
      columns:columns.map(({id,stage,title})=>({id,stage,title})),
      directories:directories.map(({id,kind,name})=>({id,kind,name})),
      tasks:tasks.map(t=>({...t.data,id:t.id,columnId:t.columnId,
        dependencies:dependencies.filter(d=>d.taskId===t.id).map(d=>d.dependsOn),
        checklist:checklist.filter(c=>c.taskId===t.id).map(({id,text,done})=>({id,text,done}))})),
    });
  }
  async function write(tx: DB, board: Board) {
    // The enclosing IMMEDIATE transaction makes replacement atomic for every reader.
    await tx.delete(s.checklist);await tx.delete(s.dependencies);await tx.delete(s.tasks);
    await tx.delete(s.directories);await tx.delete(s.columns);
    await tx.insert(s.boards).values({id:board.id,revision:board.revision,settings:board.settings})
      .onConflictDoUpdate({target:s.boards.id,set:{revision:board.revision,settings:board.settings}});
    await tx.insert(s.sketches).values({boardId:board.id,...board.sketch}).onConflictDoUpdate({target:s.sketches.boardId,set:board.sketch});
    await tx.insert(s.columns).values(board.columns.map((c,position)=>({...c,boardId:board.id,position})));
    for(let i=0;i<board.directories.length;i+=500)await tx.insert(s.directories).values(board.directories.slice(i,i+500).map(d=>({...d,boardId:board.id})));
    const rows=board.tasks.map(({id,columnId,dependencies,checklist,...data},position)=>({id,columnId,boardId:board.id,position,data}));
    for(let i=0;i<rows.length;i+=500)await tx.insert(s.tasks).values(rows.slice(i,i+500));
    const deps=board.tasks.flatMap(t=>t.dependencies.map(dependsOn=>({taskId:t.id,dependsOn})));
    for(let i=0;i<deps.length;i+=1000)await tx.insert(s.dependencies).values(deps.slice(i,i+1000));
    const checks=board.tasks.flatMap(t=>t.checklist.map((c,position)=>({...c,taskId:t.id,position})));
    for(let i=0;i<checks.length;i+=1000)await tx.insert(s.checklist).values(checks.slice(i,i+1000));
  }
  let closed=false;
  return {
    async hasBoard(){return serial(async()=>!!(await db.select({id:s.boards.id}).from(s.boards).where(eq(s.boards.id,boardId)))[0]);},
    async initialize(seed?: Board) {
      return serial(()=>db.transaction(async tx=>{if(!await read(tx))await write(tx,seed?validateBoard(seed):initialBoard());},{behavior:'immediate'}));
    },
    async get() { return serial(()=>db.transaction(async tx=>{const board=await read(tx);if(!board)throw new Error('База не инициализирована');return board;})); },
    async health() { return serial(()=>{sqlite.prepare('SELECT 1').get();}); },
    async saveSketch(revision:number,items:SketchItem[]) {
      const checked=sketchItemsSchema.parse(items);
      return serial(()=>db.transaction(async tx=>{
        const [current]=await tx.select().from(s.sketches).where(eq(s.sketches.boardId,boardId));
        if((current?.revision??0)!==revision)throw new BoardError('Эскиз изменён в другой вкладке. Ваш рисунок сохранён как черновик.','SKETCH_STALE',409);
        const next={revision:revision+1,items:checked};
        await tx.insert(s.sketches).values({boardId,...next}).onConflictDoUpdate({target:s.sketches.boardId,set:next});
        return next;
      },{behavior:'immediate'}));
    },
    async act(revision: number, action: Action) {
      return serial(()=>db.transaction(async tx=>{
        const board=(await read(tx))!;
        if(board.revision!==revision)throw new BoardError('Доска изменилась в другой вкладке. Обновите её и повторите действие.','STALE',409);
        const next=applyAction(board,action);await write(tx,next);return next;
      },{behavior:'immediate'}));
    },
    close:()=>serial(()=>{if(!closed){sqlite.close();closed=true;}}),
  };
}
export type Store = ReturnType<typeof createStore>;
