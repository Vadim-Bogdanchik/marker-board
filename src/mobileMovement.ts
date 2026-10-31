import type { Task } from '../shared/model';
import type { Placement } from './boardMovement';

export type MobileRow = { id:string; top:number; height:number };
// Geometry is taken from stationary cards. A drop indicator never changes their
// layout, so crossing a midpoint cannot make adjacent cards oscillate.
export function mobilePlacement(tasks:Task[],id:string,columnId:string,y:number,rows:MobileRow[],closed=false):Placement {
  const siblings=tasks.filter(t=>t.columnId===columnId&&t.id!==id);
  const before=closed?undefined:siblings.find(task=>{
    const row=rows.find(row=>row.id===task.id);
    return row&&y<row.top+row.height/2;
  });
  return {columnId,beforeId:before?.id||null};
}
export function mobileOrder(tasks:Task[],id:string,direction:-1|1):Placement|null {
  const task=tasks.find(t=>t.id===id);if(!task)return null;
  const siblings=tasks.filter(t=>t.columnId===task.columnId),index=siblings.findIndex(t=>t.id===id);
  if(index+direction<0||index+direction>=siblings.length)return null;
  return {columnId:task.columnId,beforeId:direction<0?siblings[index-1].id:siblings[index+2]?.id||null};
}
