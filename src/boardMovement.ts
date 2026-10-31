import type { Task } from '../shared/model';

export type Placement = { columnId: string; beforeId: string | null };
export function placementOf(tasks: Task[], id: string): Placement | null {
  const task = tasks.find(t => t.id === id);
  if (!task) return null;
  const column = tasks.filter(t => t.columnId === task.columnId);
  return { columnId: task.columnId, beforeId: column[column.findIndex(t => t.id === id) + 1]?.id || null };
}
/** Visual preview only; the server remains responsible for validation and persistence. */
export function previewMove(tasks: Task[], id: string, destination: Placement): Task[] {
  const task = tasks.find(t => t.id === id), current = placementOf(tasks, id);
  if (!task || destination.beforeId === id ||
    (current?.columnId === destination.columnId && current.beforeId === destination.beforeId)) return tasks;
  const rest = tasks.filter(t => t.id !== id);
  const index = destination.beforeId ? rest.findIndex(t => t.id === destination.beforeId && t.columnId === destination.columnId) : rest.length;
  if (index < 0) return tasks;
  const next = [...rest]; next.splice(index, 0, { ...task, columnId: destination.columnId });
  return next;
}
