import { z } from 'zod';
import ru from 'zod/v4/locales/ru.js';
import { sketchSchema, emptySketch } from './sketch.js';
z.config(ru());

export const stages = ['inbox', 'todo', 'doing', 'review', 'done'] as const;
export const ownerId = '00000000-0000-4000-8000-000000000001';
export const boardId = '00000000-0000-4000-8000-000000000002';
export const columnIds = stages.map((_, i) => `00000000-0000-4000-8000-00000000001${i}`);
const id = z.uuid();
const text = z.string().max(12000);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T12:00:00Z`); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Некорректная дата');
const optionalDate = dateSchema.nullable();
const timestamp = z.iso.datetime();
export const directorySchema = z.object({ id, kind: z.enum(['person', 'team', 'project']), name: z.string().trim().min(1).max(100) }).strict();
export const maxColumns = 32;
export const minColumnWidth = 40, maxColumnWidth = 240;
const columnWidth = z.number().int().min(minColumnWidth).max(maxColumnWidth);
const columnTitle = z.string().trim().min(1).max(60);
const defaultWidth = (stage: Stage) => stage === 'done' ? 55 : 100;
const directoryLinkSchema = z.object({memberId:id, groupId:id}).strict();
export const columnSchema = z.object({ id, stage: z.enum(stages), title: columnTitle, width: columnWidth.optional() })
  .strict().transform(column => ({ ...column, width: column.width ?? defaultWidth(column.stage) }));
export const taskSchema = z.object({
  id, columnId: id, title: z.string().trim().min(1, 'Напишите название задачи').max(250),
  description: text, category: z.enum(['mine', 'colleague', 'team']), priority: z.enum(['low', 'normal', 'high']),
  assigneeId: id.nullable(), teamId: id.nullable(), projectId: id.nullable(), dueDate: optionalDate,
  nextStep: z.string().max(2000), waitingFor: z.string().max(200), waitingWhat: z.string().max(2000), remindOn: optionalDate,
  blockedReason: z.string().max(2000), dependencies: z.array(id).max(100),
  checklist: z.array(z.object({ id, text: z.string().trim().min(1, 'Заполните пункт чек-листа или удалите его').max(500), done: z.boolean() }).strict()).max(100),
  links: z.array(z.object({ id, title: z.string().max(200), url: z.url().max(2000).refine(s => /^https?:\/\//i.test(s), 'Ссылка должна начинаться с http:// или https://') }).strict()).max(50),
  focused: z.boolean(), archived: z.boolean(), startedAt: timestamp.nullable(), completedAt: timestamp.nullable(), createdAt: timestamp, updatedAt: timestamp,
}).strict();
// Legacy JSON/DB key motion now enables the entire window reflection; retain it for backup compatibility.
export const settingsSchema = z.object({ theme: z.enum(['day', 'night']), motion: z.boolean(), wipLimit: z.number().int().min(1).max(50) }).strict();
export const stateSchema = z.object({
  id: z.literal(boardId), revision: z.number().int().min(0), columns: z.array(columnSchema).min(1).max(maxColumns),
  directoryLinks: z.array(directoryLinkSchema).max(20000).default([]),
  directories: z.array(directorySchema).max(2000), tasks: z.array(taskSchema).max(10000), settings: settingsSchema,
  sketch: sketchSchema.default(emptySketch),
}).strict();
export const backupSchema = z.object({ format: z.literal('marker-board'), version: z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]), exportedAt: timestamp, board: stateSchema }).strict();
export type Task = z.infer<typeof taskSchema>;
export type Board = z.infer<typeof stateSchema>;
export type Directory = z.infer<typeof directorySchema>;
export type Stage = typeof stages[number];

export function linkedDirectoryIds(links: Board['directoryLinks'], id: string) {
  const result = new Set<string>();
  for (const link of links) {
    if (link.memberId === id) result.add(link.groupId);
    if (link.groupId === id) result.add(link.memberId);
  }
  return result;
}

function acceptsMember(group: Directory['kind'], member: Directory['kind']) {
  return (group === 'team' && member === 'person') || (group === 'project' && member === 'team');
}

export function initialBoard(): Board {
  return { id: boardId, revision: 0, columns: stages.map((stage, i) => ({ id: columnIds[i], stage, width: defaultWidth(stage), title: ['Входящие', 'К выполнению', 'В работе', 'На согласовании', 'Готово'][i] })),
    directoryLinks: [], directories: [{ id: ownerId, kind: 'person', name: 'Вы' }], tasks: [], settings: { theme: 'day', motion: true, wipLimit: 3 }, sketch: emptySketch() };
}
export function newTask(board: Board, title: string, columnId = board.columns[0].id): Task {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), columnId, title, description: '', category: 'mine', priority: 'normal', assigneeId: ownerId,
    teamId: null, projectId: null, dueDate: null, nextStep: '', waitingFor: '', waitingWhat: '', remindOn: null, blockedReason: '',
    dependencies: [], checklist: [], links: [], focused: false, archived: false, startedAt: null, completedAt: null, createdAt: now, updatedAt: now };
}
export function stageOf(board: Board, task: Task): Stage { return board.columns.find(c => c.id === task.columnId)!.stage; }
export function unfinishedDependencies(board: Board, task: Task): Task[] {
  return task.dependencies.map(id => board.tasks.find(t => t.id === id)!).filter(t => t && stageOf(board, t) !== 'done');
}
export function validateBoard(input: unknown): Board {
  const board = stateSchema.parse(input);
  const unique = (ids: string[], name: string) => { if (new Set(ids).size !== ids.length) throw new BoardError(`Повторяющиеся идентификаторы: ${name}`); };
  unique(board.columns.map(c => c.id), 'колонки');
  unique(board.directories.map(d => d.id), 'справочники'); unique(board.tasks.map(t => t.id), 'задачи');
  unique(board.tasks.flatMap(t => t.checklist.map(c => c.id)), 'чек-листы'); unique(board.tasks.flatMap(t => t.links.map(l => l.id)), 'ссылки');
  const directory = new Map(board.directories.map(d => [d.id,d]));
  unique(board.directoryLinks.map(l => l.memberId + '/' + l.groupId), 'связи справочника');
  for (const link of board.directoryLinks) {
    const member = directory.get(link.memberId), group = directory.get(link.groupId);
    if (!member || !group || !acceptsMember(group.kind, member.kind))
      throw new BoardError('Допустимы связи сотрудника с командой и команды с проектом');
  }
  if (!board.directories.some(d => d.id === ownerId && d.kind === 'person')) throw new BoardError('Не найден локальный владелец доски');
  const tasks = new Map(board.tasks.map(t => [t.id, t]));
  for (const t of board.tasks) {
    if (!board.columns.some(c => c.id === t.columnId)) throw new BoardError('Не найдена колонка задачи');
    for (const [ref, kind] of [[t.assigneeId, 'person'], [t.teamId, 'team'], [t.projectId, 'project']]) {
      if (ref && !board.directories.some(d => d.id === ref && d.kind === kind)) throw new BoardError('Задача ссылается на отсутствующую запись справочника');
    }
    unique(t.dependencies, 'зависимости');
    for (const dep of t.dependencies) { if (!tasks.has(dep)) throw new BoardError('Не найдена связанная задача'); if (dep === t.id) throw new BoardError('Задача не может зависеть от себя'); }
    if (t.archived && stageOf(board, t) !== 'done') throw new BoardError('В архив можно убрать только завершённую задачу');
    if (t.startedAt && t.startedAt < t.createdAt || t.completedAt && (!t.startedAt || t.completedAt < t.startedAt)) throw new BoardError('Некорректная история дат задачи');
    if ((stageOf(board, t) === 'done') !== !!t.completedAt) throw new BoardError('Дата завершения не соответствует этапу задачи');
  }
  // Iterative topological traversal also handles imported chains up to the
  // 10,000-task limit without exhausting the JavaScript call stack.
  const remaining=new Map<string,number>(),dependents=new Map<string,string[]>(),ready:string[]=[];
  for(const t of board.tasks){
    remaining.set(t.id,t.dependencies.length);
    if(!t.dependencies.length)ready.push(t.id);
    for(const dep of t.dependencies){const list=dependents.get(dep);if(list)list.push(t.id);else dependents.set(dep,[t.id]);}
  }
  for(let i=0;i<ready.length;i++){
    for(const dependent of dependents.get(ready[i])??[]){
      const count=remaining.get(dependent)!-1;remaining.set(dependent,count);if(!count)ready.push(dependent);
    }
  }
  if(ready.length!==board.tasks.length)throw new BoardError('Зависимость создаёт замкнутый круг');
  return board;
}
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function overWorkLimit(board: Board) {
  const activeColumns = new Set(board.columns.filter(c => c.stage === 'doing').map(c => c.id));
  return board.tasks.filter(t => !t.archived && t.assigneeId === ownerId && activeColumns.has(t.columnId)).length > board.settings.wipLimit;
}
export function dailyOverview(board: Board, now = new Date()) {
  const today = localDate(now); const end = new Date(now); end.setDate(end.getDate()+7); const week = localDate(end);
  const active = board.tasks.filter(t => !t.archived && stageOf(board, t) !== 'done');
  return {
    focus: active.filter(t => t.focused), overdue: active.filter(t => t.dueDate && t.dueDate < today),
    today: active.filter(t => t.dueDate === today), upcoming: active.filter(t => t.dueDate && t.dueDate > today && t.dueDate <= week),
    reminders: active.filter(t => t.remindOn && t.remindOn <= today),
    blocked: active.filter(t => t.blockedReason || unfinishedDependencies(board,t).length),
    unscheduled: active.filter(t => (t.waitingFor || t.waitingWhat) && !t.remindOn),
  };
}
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saveTask'), task: taskSchema, confirmBlocked: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('moveTask'), id, columnId: id, beforeId: id.nullable(), confirmBlocked: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('deleteTask'), id }).strict(),
  z.object({ type: z.literal('saveDirectory'), item: directorySchema, linkedIds: z.array(id).max(2000).optional() }).strict(),
  z.object({ type: z.literal('deleteDirectory'), id }).strict(),
  z.object({ type: z.literal('addColumn'), title: columnTitle, stage: z.enum(stages) }).strict(),
  z.object({ type: z.literal('resizeColumns'), changes: z.array(z.object({ id, width: columnWidth }).strict()).min(1).max(2) }).strict(),
  z.object({ type: z.literal('deleteColumn'), id, destination: id.optional(), confirmBlocked: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('renameColumn'), id, title: z.string().trim().min(1).max(60) }).strict(),
  z.object({ type: z.literal('settings'), settings: settingsSchema }).strict(),
  z.object({ type: z.literal('import'), backup: backupSchema }).strict(),
  z.object({ type: z.literal('demo') }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export class BoardError extends Error { constructor(message: string, public code = 'INVALID', public status = 400) { super(message); } }
function transition(board: Board, task: Task, old: Task | undefined, confirmBlocked?: boolean) {
  const now = new Date().toISOString(), stage = stageOf(board, task);
  if (stage === 'done' && (!old || stageOf(board, old) !== 'done') && unfinishedDependencies(board, task).length && !confirmBlocked)
    throw new BoardError('Есть незавершённые зависимости. Всё равно завершить задачу?', 'DEPENDENCIES_OPEN', 409);
  task.createdAt = old?.createdAt || now; task.startedAt = old?.startedAt || null;
  if (['doing','review','done'].includes(stage) && !task.startedAt) task.startedAt = now;
  task.completedAt = stage === 'done' ? old?.completedAt || now : null; task.updatedAt = now;
}
export function applyAction(original: Board, action: Action): Board {
  let board = structuredClone(original);
  switch(action.type) {
    case 'saveTask': {
      const task = structuredClone(action.task), old = board.tasks.find(t => t.id === task.id);
      if (!board.columns.some(c => c.id === task.columnId)) throw new BoardError('Колонка не найдена');
      transition(board, task, old, action.confirmBlocked);
      if (old) board.tasks[board.tasks.indexOf(old)] = task; else board.tasks.push(task);
      break;
    }
    case 'moveTask': {
      const task = board.tasks.find(t => t.id === action.id);
      if (!task || task.archived || !board.columns.some(c => c.id === action.columnId)) throw new BoardError('Задача или колонка недоступна');
      if (action.beforeId === task.id) break;
      const old = structuredClone(task); task.columnId = action.columnId; transition(board, task, old, action.confirmBlocked);
      board.tasks = board.tasks.filter(t => t.id !== task.id);
      const at = action.beforeId ? board.tasks.findIndex(t => t.id === action.beforeId && t.columnId === action.columnId && !t.archived) : -1;
      if (action.beforeId && at < 0) throw new BoardError('Позиция задачи изменилась. Обновите доску');
      if (at < 0) board.tasks.push(task); else board.tasks.splice(at,0,task);
      break;
    }
    case 'deleteTask':
      board.tasks = board.tasks.filter(t => t.id !== action.id);
      board.tasks.forEach(t => { t.dependencies = t.dependencies.filter(id => id !== action.id); }); break;
    case 'saveDirectory': {
      const item = board.directories.find(d => d.id === action.item.id);
      if (item && item.kind !== action.item.kind) throw new BoardError('Тип записи нельзя изменить');
      if (item) Object.assign(item,action.item); else board.directories.push(action.item);
      if (action.linkedIds) {
        const edited = action.item;
        const directory = new Map(board.directories.map(d => [d.id,d]));
        board.directoryLinks = board.directoryLinks.filter(l => l.memberId !== edited.id && l.groupId !== edited.id);
        for (const id of action.linkedIds) {
          const other = directory.get(id);
          if (!other) throw new BoardError('Связанная запись справочника не найдена');
          board.directoryLinks.push(acceptsMember(edited.kind,other.kind)
            ? {memberId:other.id, groupId:edited.id} : {memberId:edited.id, groupId:other.id});
        }
      }
      break;
    }
    case 'deleteDirectory':
      if (action.id === ownerId) throw new BoardError('Локального владельца нельзя удалить');
      if (board.tasks.some(t => [t.assigneeId,t.teamId,t.projectId].includes(action.id))) throw new BoardError('Запись используется в задачах. Сначала измените их');
      board.directoryLinks = board.directoryLinks.filter(l => l.memberId !== action.id && l.groupId !== action.id);
      board.directories = board.directories.filter(d => d.id !== action.id); break;
    case 'addColumn': {
      if (board.columns.length >= maxColumns) throw new BoardError('Достигнут предел числа колонок');
      const next = board.columns.findIndex(c => stages.indexOf(c.stage) > stages.indexOf(action.stage));
      board.columns.splice(next < 0 ? board.columns.length : next, 0, {
        id: crypto.randomUUID(), title: action.title, stage: action.stage, width: defaultWidth(action.stage),
      });
      break;
    }
    case 'resizeColumns':
      for (const change of action.changes) {
        const column = board.columns.find(c => c.id === change.id);
        if (!column) throw new BoardError('Колонка не найдена');
        column.width = change.width;
      }
      break;
    case 'deleteColumn': {
      if (!board.columns.some(c => c.id === action.id)) throw new BoardError('Колонка не найдена');
      if (board.columns.length === 1) throw new BoardError('Оставьте хотя бы одну колонку');
      const moving = board.tasks.filter(t => t.columnId === action.id);
      if (moving.length) {
        const target = board.columns.find(c => c.id === action.destination && c.id !== action.id);
        if (!target) throw new BoardError('Выберите другую колонку для задач');
        if (target.stage !== 'done' && moving.some(t => t.archived))
          throw new BoardError('Для архивных задач нужен этап завершения');
        const transferred = moving.map(old => {
          const task = { ...old, columnId: target.id };
          transition(board, task, old, action.confirmBlocked);
          return task;
        });
        board.tasks = [...board.tasks.filter(t => t.columnId !== action.id), ...transferred];
      }
      board.columns = board.columns.filter(c => c.id !== action.id);
      break;
    }
    case 'renameColumn': { const column = board.columns.find(c => c.id === action.id); if (!column) throw new BoardError('Колонка не найдена'); column.title = action.title; break; }
    case 'settings': board.settings = action.settings; break;
    case 'import': board = validateBoard(action.backup.board); board.sketch.revision=original.sketch.revision+1; break;
    case 'demo':
      if (board.tasks.length) throw new BoardError('Примеры можно загрузить только на пустую доску');
      board = demoBoard(board); break;
  }
  board.revision = original.revision+1; return validateBoard(board);
}
export function demoBoard(base: Board): Board {
  const b = structuredClone(base), addDir = (kind: Directory['kind'], name: string) => {
    const found = b.directories.find(d => d.kind === kind && d.name === name); if(found) return found.id;
    const id = crypto.randomUUID(); b.directories.push({id,kind,name}); return id;
  };
  const anna = addDir('person','Анна'), payments = addDir('team','Команда платежей'), project = addDir('project','Платежи');
  const titles = [['Уточнить требования к возвратам','Разобрать вопросы поддержки'], ['Описать сценарии авторизации','Проверить схему событий'], ['Согласовать контракт API','Обновить диаграмму процесса','Подготовить тестовый стенд'], ['Требования к личному кабинету','Проверить модель данных'], ['Описать коды ошибок','Согласовать формат отчёта']];
  titles.forEach((list,i) => list.forEach((title,j) => {
    const t = newTask(b,title,(b.columns.find(c=>c.stage===stages[i]) ?? b.columns[0]).id); t.projectId = project;
    const date = new Date(); date.setDate(date.getDate() + (i === 2 && j === 0 ? -1 : i+1)); t.dueDate = localDate(date);
    if (j === 1 && i !== 2 && i !== 0) {t.category='colleague';t.assigneeId=anna;}
    if (j === 2) {t.category='team';t.teamId=payments;t.assigneeId=null;}
    t.focused = i === 2; t.nextStep = i === 2 && j === 0 ? 'Получить пример ответа от команды платежей' : '';
    transition(b,t,undefined,true); b.tasks.push(t);
  }));
  const api = b.tasks.find(t => t.title === 'Согласовать контракт API')!;
  api.waitingFor='Команда платежей'; api.waitingWhat='Схема ответа API'; api.remindOn=localDate();
  api.dependencies=[b.tasks.find(t => t.title === 'Проверить схему событий')!.id];
  api.checklist = ['Описать запрос','Уточнить коды ошибок','Согласовать формат ответа'].map((text,i)=>({id:crypto.randomUUID(),text,done:i<2}));
  return b;
}
