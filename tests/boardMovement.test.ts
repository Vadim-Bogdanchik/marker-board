import test from 'node:test';
import assert from 'node:assert/strict';
import { initialBoard, newTask, applyAction } from '../shared/model.js';
import { placementOf, previewMove } from '../src/boardMovement.js';

test('drag preview crosses several columns without duplicates or changing the saved snapshot',()=>{
  const b=initialBoard(),a=newTask(b,'A'),c=newTask(b,'C',b.columns[1].id),d=newTask(b,'D',b.columns[1].id);
  b.tasks=[a,c,d];const saved=structuredClone(b.tasks);
  let p=previewMove(b.tasks,a.id,{columnId:c.columnId,beforeId:d.id});
  assert.deepEqual(p.filter(t=>t.columnId===c.columnId).map(t=>t.id),[c.id,a.id,d.id]);
  p=previewMove(p,a.id,{columnId:b.columns[2].id,beforeId:null});
  p=previewMove(p,a.id,{columnId:b.columns[0].id,beforeId:null});
  assert.equal(new Set(p.map(t=>t.id)).size,3);assert.deepEqual(b.tasks,saved);
  assert.deepEqual(placementOf(p,a.id),placementOf(b.tasks,a.id));
});
test('hovering the same insertion slot is stable; invalid targets leave the preview intact',()=>{
  const b=initialBoard(),a=newTask(b,'A'),c=newTask(b,'C');b.tasks=[a,c];
  assert.equal(previewMove(b.tasks,a.id,placementOf(b.tasks,a.id)!),b.tasks);
  assert.equal(previewMove(b.tasks,a.id,{columnId:a.columnId,beforeId:a.id}),b.tasks);
  assert.equal(previewMove(b.tasks,a.id,{columnId:a.columnId,beforeId:'missing'}),b.tasks);
});
test('preview insertion before/after siblings matches the persisted order',()=>{
  const b=initialBoard();b.tasks=['A','B','C'].map(n=>newTask(b,n));
  const id=b.tasks[0].id,destination={columnId:b.columns[0].id,beforeId:null};
  const p=previewMove(b.tasks,id,destination),saved=applyAction(b,{type:'moveTask',id,...destination});
  assert.deepEqual(p.map(t=>t.id),saved.tasks.map(t=>t.id));
  const back={columnId:b.columns[0].id,beforeId:b.tasks[1].id};
  assert.deepEqual(previewMove(p,id,back).map(t=>t.id),b.tasks.map(t=>t.id));
});
test('a filtered preview commits relative to visible siblings without removing hidden tasks',()=>{
  const b=initialBoard(),a=newTask(b,'A'),hidden=newTask(b,'Hidden',b.columns[1].id),c=newTask(b,'C',b.columns[1].id);
  b.tasks=[a,hidden,c];const p=previewMove([a,c],a.id,{columnId:c.columnId,beforeId:c.id});
  const destination=placementOf(p,a.id)!;
  const saved=applyAction(b,{type:'moveTask',id:a.id,...destination});
  assert.deepEqual(saved.tasks.map(t=>t.id),[hidden.id,a.id,c.id]);assert.deepEqual(b.tasks,[a,hidden,c]);
});
