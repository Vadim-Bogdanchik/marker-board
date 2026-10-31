import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSketchItem, eraseSketch, moveSketchItem, resizeSketchItem, itemBounds, sketchItemsSchema } from '../shared/sketch.js';
import { initialBoard, applyAction, backupSchema } from '../shared/model.js';

test('sketch validation rejects duplicate IDs, malformed strokes, unbounded data and unsafe markup properties',()=>{
  const item=makeSketchItem('pen',10,20);
  assert.ok(sketchItemsSchema.safeParse([item]).success);
  assert.ok(sketchItemsSchema.safeParse([{...item,erasures:[{points:[[0,0]],size:357}]}]).success,'Full-size eraser remains valid when zoomed out');
  assert.ok(!sketchItemsSchema.safeParse([{...item,erasures:[{points:[[0,0]],size:513}]}]).success);
  assert.ok(!sketchItemsSchema.safeParse([item,item]).success);
  assert.ok(!sketchItemsSchema.safeParse([{...item,points:[]}]).success);
  assert.ok(!sketchItemsSchema.safeParse([{...item,x:Infinity}]).success);
  assert.ok(!sketchItemsSchema.safeParse([{...item,onclick:'alert(1)'}]).success);
  assert.ok(!sketchItemsSchema.safeParse([{...item,points:Array.from({length:4001},()=>[0,0])}]).success);
});
test('partial erasure stays attached to moved items and never changes untouched items or original history',()=>{
  const a=makeSketchItem('rect',100,100),b=makeSketchItem('ellipse',600,500),original=structuredClone([a,b]);
  const erased=eraseSketch([a,b],[[120,130],[150,140]],30);
  assert.deepEqual([a,b],original);assert.equal(erased[1],b);
  assert.deepEqual(erased[0].erasures[0].points,[[20,30],[50,40]]);
  const moved=moveSketchItem(erased[0],40,50);assert.equal(moved.x,140);assert.equal(moved.y,150);assert.deepEqual(moved.erasures,erased[0].erasures);
  assert.equal(eraseSketch([a,b],[],30)[0],a);
  const arrow={...makeSketchItem('arrow',300,200),w:-100,h:-50};assert.deepEqual(itemBounds(arrow),{x:200,y:150,w:100,h:50});
  assert.equal(resizeSketchItem(a,-100,0).w,50);assert.equal(resizeSketchItem(arrow,-100,-40).h,-40);
});
test('legacy JSON gains an empty sketch; restore advances sketch revision to reject stale editors',()=>{
  const b=initialBoard();b.sketch={revision:7,items:[makeSketchItem('text',50,50)]};
  const {sketch:_,...legacy}=b;
  const backup={format:'marker-board',version:1,exportedAt:new Date().toISOString(),board:legacy};
  assert.deepEqual(backupSchema.parse(backup).board.sketch,{revision:0,items:[]});
  const restored=applyAction(b,{type:'import',backup:backupSchema.parse(backup)});assert.deepEqual(restored.sketch,{revision:8,items:[]});
  assert.equal(b.sketch.items.length,1);
});

test('resizing a marker scales real points and erased areas about its upper-left bound',()=>{
  const pen={...makeSketchItem('pen',100,150),points:[[0,0],[-40,30],[60,60]] as [number,number][],erasures:[{points:[[-20,15],[20,45]] as [number,number][],size:30}]};
  const before=structuredClone(pen),resized=resizeSketchItem(pen,200,30);
  assert.deepEqual(itemBounds(resized),{x:60,y:150,w:200,h:30});
  assert.deepEqual(resized.points,[[40,0],[-40,15],[160,30]]);
  assert.deepEqual(resized.erasures[0],{points:[[0,7.5],[80,22.5]],size:30,scaleX:2,scaleY:.5});
  const restored=resizeSketchItem(resized,100,60);
  assert.deepEqual(restored.points,pen.points);assert.equal(restored.erasures[0].scaleX,1);assert.equal(restored.erasures[0].scaleY,1);
  assert.deepEqual(pen,before);assert.ok(sketchItemsSchema.safeParse([resized]).success);
});
test('horizontal and vertical marker strokes resize without NaN or unwanted closure',()=>{
  for(const points of [[[0,0],[100,0]],[[0,0],[0,-100]]] as [number,number][][]){
    const pen={...makeSketchItem('pen',200,200),points};
    const resized=resizeSketchItem(pen,50,50),b=itemBounds(resized);
    assert.ok(sketchItemsSchema.safeParse([resized]).success);
    assert.equal(resized.points.length,2);assert.equal(points[1][0]?b.w:b.h,50);assert.equal(points[1][0]?b.h:b.w,0);
  }
});
