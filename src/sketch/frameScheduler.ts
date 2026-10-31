/** Coalesce visual previews, not pointer samples. The gesture keeps every point;
 * only its latest immutable preview needs to be presented on the next frame. */
export function createFrameScheduler<T>(publish:(value:T)=>void,request:(callback:()=>void)=>number,cancel:(id:number)=>void){
  let frame:number|null=null,latest:T;
  return {
    schedule(value:T){
      latest=value;
      if(frame===null)frame=request(()=>{frame=null;publish(latest);});
    },
    cancel(){if(frame!==null)cancel(frame);frame=null;},
  };
}
