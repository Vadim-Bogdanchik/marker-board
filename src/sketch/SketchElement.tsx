import { memo, useMemo } from 'react';
import { itemBounds, type SketchItem } from '../../shared/sketch';
import { SketchDrawing } from './SketchDrawing';

/** Unchanged elements retain their SVG paths while another stroke is drawn. */
export const SketchElement=memo(function SketchElement({item,selected,interactive,editingText,onSelect}:{
  item:SketchItem;selected:boolean;interactive:boolean;editingText?:string;onSelect:(id:string)=>void;
}){
  const bounds=useMemo(()=>itemBounds(item),[item]);
  const visual=useMemo(()=>editingText===undefined?item:{...item,text:editingText},[item,editingText]);
  const label=item.text||({pen:'Маркер',rect:'Блок',ellipse:'Овал',diamond:'Решение',database:'База',arrow:'Стрелка',text:'Текст'}[item.kind]);
  return <g data-sketch-id={item.id} aria-label={label} role="img" tabIndex={interactive?0:undefined} onFocus={()=>onSelect(item.id)}>
    <SketchDrawing item={visual} selected={selected}/>
    {interactive&&<rect x={bounds.x-8} y={bounds.y-18} width={Math.max(25,bounds.w+16)} height={Math.max(36,bounds.h+36)} fill="transparent" stroke="none" className="sketch-hit"/>}
  </g>;
});
