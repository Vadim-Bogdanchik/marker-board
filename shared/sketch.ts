import { z } from 'zod';
export const ERASER_ASPECT=2.4;
export const SKETCH_WIDTH=1200,SKETCH_HEIGHT=440;
export const sketchColors=['#153c91','#202c3d','#b52e35','#18775d'] as const;
const coordinate=z.number().min(-10000).max(10000);
export const pointSchema=z.tuple([coordinate,coordinate]);
export type Point=z.infer<typeof pointSchema>;
export const erasureSchema=z.object({points:z.array(pointSchema).min(1).max(3000),size:z.number().min(1).max(512),scaleX:z.number().positive().max(10000).optional(),scaleY:z.number().positive().max(10000).optional()}).strict();
export const sketchItemSchema=z.object({
  id:z.uuid(),kind:z.enum(['pen','rect','ellipse','diamond','database','arrow','text']),
  x:coordinate,y:coordinate,w:coordinate,h:coordinate,
  color:z.enum(sketchColors),weight:z.number().min(1).max(12),
  text:z.string().max(500),points:z.array(pointSchema).max(4000),
  erasures:z.array(erasureSchema).max(150),
}).strict().superRefine((item,ctx)=>{
  if(item.kind==='pen'&&!item.points.length)ctx.addIssue({code:'custom',message:'Пустой штрих'});
  if(!['pen','arrow'].includes(item.kind)&&(item.w<20||item.h<20))ctx.addIssue({code:'custom',message:'Некорректный размер блока'});
});
export const sketchItemsSchema=z.array(sketchItemSchema).max(600).superRefine((items,ctx)=>{
  if(new Set(items.map(i=>i.id)).size!==items.length)ctx.addIssue({code:'custom',message:'Повторяющиеся элементы эскиза'});
  const points=items.reduce((n,i)=>n+i.points.length+i.erasures.reduce((k,e)=>k+e.points.length,0),0);
  if(points>120000)ctx.addIssue({code:'custom',message:'Эскиз слишком большой. Удалите лишние элементы.'});
});
export const sketchSchema=z.object({revision:z.number().int().min(0),items:sketchItemsSchema}).strict();
export const emptySketch=()=>({revision:0,items:[]} as Sketch);
export type SketchItem=z.infer<typeof sketchItemSchema>;
export type Sketch=z.infer<typeof sketchSchema>;
export type ShapeKind=Exclude<SketchItem['kind'],'pen'>;

export function makeSketchItem(kind:SketchItem['kind'],x:number,y:number,color:SketchItem['color']=sketchColors[0],weight=3):SketchItem {
  return {id:crypto.randomUUID(),kind,x,y,w:kind==='text'?250:190,h:kind==='arrow'?0:kind==='text'?65:110,color,weight,text:'',points:kind==='pen'?[[0,0]]:[],erasures:[]};
}
export function itemBounds(item:SketchItem){
  if(item.kind==='pen'){
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const [x,y] of item.points){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    return {x:item.x+left,y:item.y+top,w:right-left,h:bottom-top};
  }
  return {x:item.x+Math.min(0,item.w),y:item.y+Math.min(0,item.h),w:Math.abs(item.w),h:Math.abs(item.h)};
}
export function eraseSketch(items:SketchItem[],points:Point[],size:number):SketchItem[]{
  if(!points.length)return items;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs)-size*1.3,right=Math.max(...xs)+size*1.3,top=Math.min(...ys)-size,bottom=Math.max(...ys)+size;
  return items.map(item=>{
    const b=itemBounds(item);
    if(b.x+b.w<left||b.x>right||b.y+b.h<top||b.y>bottom)return item;
    return {...item,erasures:[...item.erasures,{points:points.map(([x,y])=>[x-item.x,y-item.y] as Point),size}]};
  });
}
export function moveSketchItem(item:SketchItem,dx:number,dy:number):SketchItem {
  return {...item,x:Math.max(0,Math.min(9000,item.x+dx)),y:Math.max(0,Math.min(9000,item.y+dy))};
}
export function resizeSketchItem(item:SketchItem,w:number,h:number):SketchItem {
  if(item.kind==='pen'){
    const b=itemBounds(item),left=b.x-item.x,top=b.y-item.y;
    if(!b.w&&!b.h)return {...item,weight:Math.max(1,Math.min(12,Math.max(w,h)))};
    const sx=b.w?Math.max(1,w)/b.w:1,sy=b.h?Math.max(1,h)/b.h:1;
    const transform=([x,y]:Point):Point=>[left+(x-left)*sx,top+(y-top)*sy];
    return {...item,w:b.w*sx,h:b.h*sy,points:item.points.map(transform),
      erasures:item.erasures.map(e=>({...e,points:e.points.map(transform),scaleX:(e.scaleX??1)*sx,scaleY:(e.scaleY??1)*sy}))};
  }
  if(item.kind==='arrow')return {...item,w,h};
  return {...item,w:Math.max(50,w),h:Math.max(40,h)};
}
