import { memo, useId } from 'react';
import { ERASER_ASPECT, itemBounds, type Point, type SketchItem } from '../../shared/sketch';
import { sketchPerformance } from './performance';
export function linePath(points:Point[]):string {
  if(!points.length)return '';
  if(points.length===1)return `M${points[0][0]} ${points[0][1]} l.01 .01`;
  let d=`M${points[0][0]} ${points[0][1]}`;
  for(let i=1;i<points.length-1;i++)d+=` Q${points[i][0]} ${points[i][1]} ${(points[i][0]+points[i+1][0])/2} ${(points[i][1]+points[i+1][1])/2}`;
  return d+` L${points.at(-1)![0]} ${points.at(-1)![1]}`;
}
export function shapePath(kind:SketchItem['kind'],w:number,h:number):string {
  const r=Math.min(13,Math.abs(w)/5,Math.abs(h)/5);
  if(kind==='rect')return `M${r} 1 Q${w/2} -1 ${w-r} 0 Q${w+1} 0 ${w} ${r} L${w-1} ${h-r} Q${w+1} ${h} ${w-r} ${h} L${r} ${h+1} Q-1 ${h} 0 ${h-r} L1 ${r} Q0 0 ${r} 1Z`;
  if(kind==='ellipse')return `M0 ${h/2} C0 ${-h/6} ${w+2} ${-h/6} ${w} ${h/2} C${w} ${h*7/6} -1 ${h*7/6} 0 ${h/2}Z`;
  if(kind==='diamond')return `M${w/2} 0 Q${w*.77} ${h*.23} ${w} ${h/2} L${w/2} ${h} L0 ${h/2}Z`;
  if(kind==='database')return `M0 17 C0 -6 ${w} -6 ${w} 17 C${w} 40 0 40 0 17 L1 ${h-17} C1 ${h+6} ${w-1} ${h+6} ${w-1} ${h-17} L${w} 17 M1 ${h-17} C1 ${h-40} ${w-1} ${h-40} ${w-1} ${h-17}`;
  if(kind==='arrow'){
    const angle=Math.atan2(h,w),len=15,ax=w-len*Math.cos(angle-.5),ay=h-len*Math.sin(angle-.5),bx=w-len*Math.cos(angle+.5),by=h-len*Math.sin(angle+.5);
    return `M0 0 Q${w*.48} ${h*.48-1.2} ${w} ${h} M${ax} ${ay} L${w} ${h} L${bx} ${by}`;
  }
  return '';
}
function wrapLabel(text:string,width:number){
  const max=Math.max(4,Math.floor(width/14));
  return text.split('\n').flatMap(line=>{
    const result:string[]=[];let current='';
    for(const word of line.split(' ')){
      if(current&&current.length+word.length+1>max){result.push(current);current='';}
      let rest=word;while(rest.length>max){if(current){result.push(current);current='';}result.push(rest.slice(0,max));rest=rest.slice(max);}
      current+=(current?' ':'')+rest;
    }
    result.push(current);return result;
  });
}
export const SketchDrawing=memo(function SketchDrawing({item,selected=false}:{item:SketchItem;selected?:boolean}) {
  sketchPerformance.drawing();
  const id=useId().replace(/:/g,''),mask=`wipe-${id}`,bounds=itemBounds(item);
  const lines=wrapLabel(item.text,item.kind==='arrow'?260:item.w-(item.kind==='diamond'?item.w*.45:24));
  const textX=item.kind==='text'?4:item.w/2,textY=item.kind==='arrow'?item.h/2-19:item.h/2-(lines.length-1)*16;
  return <g transform={`translate(${item.x} ${item.y})`} className="sketch-ink" data-sketch-id={item.id}>
    {item.erasures.length>0&&<defs><mask id={mask} maskUnits="userSpaceOnUse" x={bounds.x-item.x-180} y={bounds.y-item.y-300} width={bounds.w+360} height={bounds.h+600} style={{maskType:'luminance'}}><rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/>{item.erasures.map((e,i)=><path key={i} d={linePath(e.points.map(([x,y])=>[x/(ERASER_ASPECT*(e.scaleX??1)),y/(e.scaleY??1)]))} transform={`scale(${ERASER_ASPECT*(e.scaleX??1)} ${e.scaleY??1})`} fill="none" stroke="black" strokeWidth={e.size} strokeLinecap="round" strokeLinejoin="round"/>)}</mask></defs>}
    <g mask={item.erasures.length?`url(#${mask})`:undefined}>
      {item.kind!=='text'&&<path d={item.kind==='pen'?linePath(item.points):shapePath(item.kind,item.w,item.h)} stroke={item.color} strokeWidth={item.weight} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".94"/>}
      {item.text&&<text x={textX} y={textY} fill={item.color} textAnchor={item.kind==='text'?'start':'middle'} dominantBaseline="middle" fontFamily="Caveat, cursive" fontWeight="600" fontSize="32" pointerEvents="none">{lines.map((line,i)=><tspan x={textX} dy={i?32:0} key={i}>{line||' '}</tspan>)}</text>}
    </g>
    {selected&&<title>{item.text||'Выбранный элемент'}</title>}
  </g>;
});
export function SketchToolIcon({kind}:{kind:string}) {
  const p=kind==='pen'?'m5 20 3-7L18 3l3 3L11 17zM8 13l3 4M4 21l4-1':kind==='select'?'M5 2l14 12-8 1-4 7z':kind==='pan'?'M7 11V6q2-3 3 0v5-7q2-3 3 0v7-5q2-3 3 0v6-3q3-2 3 2v6q-1 6-7 5l-4-2-4-7q0-4 3-1l2 3':kind==='database'?'M2 5C2 0 21 0 21 5C21 10 2 10 2 5v14C2 24 21 24 21 19V5M2 19C2 14 21 14 21 19':kind==='text'?'M3 4h18M12 4v17M8 21h8':kind==='undo'?'M10 4 3 10l7 5M4 10h10q10 1 6 10':kind==='redo'?'m14 4 7 6-7 5M20 10H10q-10 1-6 10':kind==='erase'?'M3 15 13 3l9 8-9 11H9zM8 10l9 8':shapePath(kind as SketchItem['kind'],20,kind==='arrow'?8:17);
  return <svg aria-hidden="true" viewBox="-2 -2 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={p}/></svg>;
}
