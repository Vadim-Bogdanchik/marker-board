/** A stroke belongs to the pressed pointer, not to the SVG node under it.
 * Keep listening on the window if the browser releases pointer capture. */
export type SketchPointerEvent=Pick<PointerEvent,'pointerId'|'clientX'|'clientY'|'preventDefault'> & {nativeEvent?:PointerEvent;getCoalescedEvents?:()=>PointerEvent[]};
export type PointerSessionHandlers={
  active:()=>number|null;
  move:(event:SketchPointerEvent)=>void;
  finish:(event:SketchPointerEvent)=>void;
  interrupt:()=>void;
};
export function listenToSketchPointer(target:EventTarget,current:()=>PointerSessionHandlers){
  const route=(kind:'move'|'finish')=>(event:Event)=>{
    const pointer=event as PointerEvent,handlers=current();
    if(handlers.active()===pointer.pointerId)handlers[kind](pointer);
  };
  const move=route('move'),up=route('finish');
  const cancel=(event:Event)=>{const handlers=current();if(handlers.active()===(event as PointerEvent).pointerId)handlers.interrupt();};
  const blur=()=>{const handlers=current();if(handlers.active()!==null)handlers.interrupt();};
  target.addEventListener('pointermove',move,{passive:false});
  target.addEventListener('pointerup',up);
  target.addEventListener('pointercancel',cancel);
  target.addEventListener('blur',blur);
  return ()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',cancel);target.removeEventListener('blur',blur);};
}
