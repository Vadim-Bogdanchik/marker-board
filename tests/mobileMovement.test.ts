import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, initialBoard, newTask } from '../shared/model.js';
import { mobileOrder, mobilePlacement } from '../src/mobileMovement.js';
import { previewMove } from '../src/boardMovement.js';

test('mobile touch drop uses stationary midpoints and excludes the lifted card',()=>{
  const b=initialBoard(),a=newTask(b,'A'),c=newTask(b,'C'),d=newTask(b,'D');b.tasks=[a,c,d];
  const rows=[{id:a.id,top:100,height:100},{id:c.id,top:220,height:100},{id:d.id,top:340,height:100}];
  assert.equal(mobilePlacement(b.tasks,a.id,a.columnId,269,rows).beforeId,c.id);
  assert.equal(mobilePlacement(b.tasks,a.id,a.columnId,271,rows).beforeId,d.id);
  assert.equal(mobilePlacement(b.tasks,a.id,a.columnId,420,rows).beforeId,null);
  assert.equal(mobilePlacement(b.tasks,c.id,a.columnId,180,rows).beforeId,d.id);
});
test('mobile drop supports folded and empty stages; filtered moves retain hidden tasks',()=>{
  const b=initialBoard(),a=newTask(b,'A'),hidden=newTask(b,'Hidden',b.columns[1].id),c=newTask(b,'C',b.columns[1].id);b.tasks=[a,hidden,c];
  const rows=[{id:c.id,top:300,height:100}];
  const target=mobilePlacement([a,c],a.id,c.columnId,310,rows);
  assert.deepEqual(applyAction(b,{type:'moveTask',id:a.id,...target}).tasks.map(t=>t.id),[hidden.id,a.id,c.id]);
  assert.equal(mobilePlacement([a,c],a.id,c.columnId,310,rows,true).beforeId,null);
  const empty=mobilePlacement([a,c],a.id,b.columns[2].id,200,[]);
  assert.equal(empty.beforeId,null);assert.equal(empty.columnId,b.columns[2].id);
});
test('mobile arrow controls respect boundaries and persist the preview order',()=>{
  const b=initialBoard();b.tasks=['A','B','C'].map(n=>newTask(b,n));
  assert.equal(mobileOrder(b.tasks,b.tasks[0].id,-1),null);
  assert.equal(mobileOrder(b.tasks,b.tasks[2].id,1),null);
  for(const [id,direction] of [[b.tasks[0].id,1],[b.tasks[2].id,-1]] as const){
    const to=mobileOrder(b.tasks,id,direction)!;
    const order=(tasks:typeof b.tasks)=>tasks.map(({id,columnId})=>({id,columnId}));
    assert.deepEqual(order(previewMove(b.tasks,id,to)),order(applyAction(b,{type:'moveTask',id,...to}).tasks));
  }
  assert.equal(mobileOrder(b.tasks,'missing',1),null);
});
