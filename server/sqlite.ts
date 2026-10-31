import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { mkdir, chmod, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function openSqlite(filename: string) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const sqlite = new DatabaseSync(filename, { timeout: 5000, enableForeignKeyConstraints: true });
  try {
    if (filename !== ':memory:' && process.platform !== 'win32') chmodSync(filename, 0o600);
    sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    return sqlite;
  } catch (error) { sqlite.close(); throw error; }
}

/** SQLite's online backup includes committed WAL pages; copying the open file does not. */
export async function backupSqlite(sqlite: DatabaseSync, target: string) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.partial`;
  try {
    await backup(sqlite, temporary);
    if (process.platform !== 'win32') await chmod(temporary, 0o600);
    const check = new DatabaseSync(temporary, { readOnly: true });
    try {
      if (check.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new Error('Проверка резервной копии не пройдена.');
    } finally { check.close(); }
    await rename(temporary, target);
    return target;
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}

// Drizzle's async callback yields between SQL statements. Serialize complete
// transactions, including reads, so requests cannot share an unfinished transaction.
// Sharing the queue also makes multiple Store instances for one file safe in-process.
const queues = new Map<string, Promise<unknown>>();
export function serialFor(filename: string) {
  const key = filename === ':memory:' ? randomUUID() : path.resolve(filename);
  return <T>(operation: () => Promise<T> | T): Promise<T> => {
    const result = (queues.get(key) || Promise.resolve()).then(operation);
    const settled = result.then(() => {}, () => {});
    queues.set(key, settled);
    void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
    return result;
  };
}
