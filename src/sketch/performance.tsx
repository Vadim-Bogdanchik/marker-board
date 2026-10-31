import { useEffect, useState } from 'react';

// Local, opt-in diagnostics. No telemetry and no work on the animation loop
// unless the developer explicitly opens ?sketchPerf=1.
const enabled=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('sketchPerf')==='1';
type Sample={items:number;drawings:number;commits:number;renderMs:number[];moveMs:number[];frames:number[]};
let sample:Sample|null=null,frame=0,lastFrame=0;
const subscribers=new Set<(report:string)=>void>();
const percentile=(values:number[],p:number)=>{const sorted=[...values].sort((a,b)=>a-b);return Number((sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??0).toFixed(2));};
export const sketchPerformance={
  begin(items:number){
    if(!enabled)return;
    cancelAnimationFrame(frame);sample={items,drawings:0,commits:0,renderMs:[],moveMs:[],frames:[]};lastFrame=performance.now();
    const next=(now:number)=>{if(!sample)return;sample.frames.push(now-lastFrame);lastFrame=now;frame=requestAnimationFrame(next);};
    frame=requestAnimationFrame(next);
  },
  drawing(){if(sample)sample.drawings++;},
  renderStart(){return enabled?performance.now():0;},
  commit(start:number){if(sample){sample.commits++;sample.renderMs.push(performance.now()-start);}},
  move(run:()=>void){if(!sample){run();return;}const start=performance.now();run();sample?.moveMs.push(performance.now()-start);},
  end(){
    if(!sample)return;
    const ending=sample;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(sample!==ending)return;
      cancelAnimationFrame(frame);sample=null;
      const report=JSON.stringify({items:ending.items,drawings:ending.drawings,commits:ending.commits,
        renderMedianMs:percentile(ending.renderMs,.5),renderP95Ms:percentile(ending.renderMs,.95),
        moves:ending.moveMs.length,moveP95Ms:percentile(ending.moveMs,.95),
        frameMedianMs:percentile(ending.frames,.5),frameP95Ms:percentile(ending.frames,.95)});
      subscribers.forEach(fn=>fn(report));
    }));
  },
};
export function SketchPerformanceReport(){
  const [report,setReport]=useState('Нарисуйте штрих для замера');
  useEffect(()=>{if(!enabled)return;subscribers.add(setReport);return()=>{subscribers.delete(setReport);};},[]);
  return enabled?<output data-sketch-performance style={{position:'fixed',bottom:0,left:0,zIndex:300,background:'#fff',color:'#222',font:'11px monospace',padding:4,pointerEvents:'none'}}>{report}</output>:null;
}
