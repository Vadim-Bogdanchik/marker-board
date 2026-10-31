import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameScheduler } from '../src/sketch/frameScheduler.js';

function clock(){
  let id=0;const queue=new Map<number,()=>void>();
  return {queue,request:(cb:()=>void)=>{queue.set(++id,cb);return id;},cancel:(key:number)=>{queue.delete(key);},step:()=>{const batch=[...queue.values()];queue.clear();batch.forEach(cb=>cb());}};
}
test('many pointer samples publish one latest preview per frame without losing accumulated points',()=>{
  const c=clock(),rendered:number[][]=[];
  const frames=createFrameScheduler<number[]>(points=>rendered.push(points),c.request,c.cancel);
  let points:number[]=[];
  for(let i=0;i<100;i++){points=[...points,i];frames.schedule(points);}
  assert.equal(c.queue.size,1);assert.equal(rendered.length,0);c.step();
  assert.deepEqual(rendered,[points]);
  frames.schedule([...points,100]);c.step();assert.equal(rendered[1].length,101);
});
test('ending or cancelling a gesture prevents an old preview from reappearing after commit or undo',()=>{
  const c=clock(),rendered:string[]=[];
  const frames=createFrameScheduler<string>(value=>rendered.push(value),c.request,c.cancel);
  frames.schedule('old preview');frames.cancel();c.step();assert.deepEqual(rendered,[]);
  frames.schedule('next gesture');c.step();assert.deepEqual(rendered,['next gesture']);
  frames.schedule('unmounted');frames.cancel();frames.cancel();c.step();assert.equal(rendered.length,1);
});
