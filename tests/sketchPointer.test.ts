import test from 'node:test';
import assert from 'node:assert/strict';
import { listenToSketchPointer } from '../src/sketch/pointerSession.js';
import { makeSketchItem, resizeSketchItem } from '../shared/sketch.js';
import { linePath } from '../src/sketch/SketchDrawing.js';

function pointer(type:string,id=1,x=0,y=0){return Object.assign(new Event(type,{cancelable:true}),{pointerId:id,clientX:x,clientY:y});}
test('open stroke continues after lost SVG capture, ignores other pointers and ends exactly once',()=>{
  const target=new EventTarget(),stroke=makeSketchItem('pen',0,0);let active:number|null=1,commits=0;
  const dispose=listenToSketchPointer(target,()=>({active:()=>active,
    move:e=>stroke.points.push([e.clientX,e.clientY]),
    finish:e=>{stroke.points.push([e.clientX,e.clientY]);active=null;commits++;},
    interrupt:()=>{active=null;commits++;},
  }));
  target.dispatchEvent(pointer('pointermove',1,10,20));
  target.dispatchEvent(pointer('lostpointercapture'));
  assert.equal(commits,0);
  target.dispatchEvent(pointer('pointermove',2,999,999));
  target.dispatchEvent(pointer('pointermove',1,30,40));
  target.dispatchEvent(pointer('pointerup',1,50,60));
  target.dispatchEvent(pointer('pointerup',1,50,60));
  assert.equal(commits,1);assert.deepEqual(stroke.points,[[0,0],[10,20],[30,40],[50,60]]);
  assert.ok(linePath(stroke.points).endsWith('L50 60'));assert.ok(!/[zZ]/.test(linePath(stroke.points)),'A marker stroke is never implicitly closed');
  dispose();
});
test('browser interruption keeps the last valid resize rather than cancel coordinates; listeners are removed',()=>{
  for(const end of ['pointercancel','blur']){
    const target=new EventTarget(),block={...makeSketchItem('database',100,100),w:240,h:180};
    let active:number|null=1,preview=block,saved=block,commits=0;
    const dispose=listenToSketchPointer(target,()=>({active:()=>active,
      move:e=>{preview=resizeSketchItem(block,block.w+e.clientX-340,block.h+e.clientY-280);},
      finish:()=>{saved=preview;active=null;commits++;},
      interrupt:()=>{saved=preview;active=null;commits++;},
    }));
    target.dispatchEvent(pointer('pointermove',1,270,240));
    target.dispatchEvent(pointer(end,1,0,0));
    assert.equal(saved.w,170);assert.equal(saved.h,140);assert.equal(commits,1);
    dispose();active=1;target.dispatchEvent(pointer('pointermove',1,999,999));target.dispatchEvent(pointer('pointerup'));
    assert.equal(commits,1);assert.equal(preview.w,170);
  }
});
