import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sketchSchema, sketchItemsSchema, type Sketch, type SketchItem } from '../../shared/sketch';
import { ApiError, request } from '../api';
const draftKey='marker-board:sketch-draft:v1';
export function useSketch(initial:Sketch,onSaved:(sketch:Sketch)=>void) {
  const seed=useRef<{sketch:Sketch;error:string}|null>(null);
  if(!seed.current){
    let sketch=initial,error='';
    try {const raw=sessionStorage.getItem(draftKey);if(raw){const draft=sketchSchema.parse(JSON.parse(raw));if(JSON.stringify(draft.items)!==JSON.stringify(initial.items)){sketch=draft;if(draft.revision!==initial.revision)error='Есть несохранённый черновик, а доска уже изменилась. Выберите, какой эскиз оставить.';}}}catch{/* An invalid browser draft never replaces server data. */}
    seed.current={sketch,error};
  }
  const [items,setItems]=useState(seed.current.sketch.items),[error,setError]=useState(seed.current.error),[saving,setSaving]=useState(false),[historyTick,tick]=useState(0);
  const itemsRef=useRef(items),revision=useRef(seed.current.sketch.revision),saved=useRef<string|null>(null),past=useRef<SketchItem[][]>([]),future=useRef<SketchItem[][]>([]),inFlight=useRef(false),callback=useRef(onSaved),mounted=useRef(true);
  if(saved.current===null)saved.current=JSON.stringify(initial.items);
  callback.current=onSaved;
  const serializedItems=useMemo(()=>JSON.stringify(items),[items]);
  const dirty=serializedItems!==saved.current;
  const remember=useCallback((next:SketchItem[])=>{
    itemsRef.current=next;setItems(next);
    try{sessionStorage.setItem(draftKey,JSON.stringify({revision:revision.current,items:next}));}catch{/* beforeunload still protects unsaved changes if browser storage is full. */}
  },[]);
  const change=useCallback((next:SketchItem[])=>{
    if(next===itemsRef.current||next.length===itemsRef.current.length&&next.every((item,i)=>item===itemsRef.current[i]))return;
    if(JSON.stringify(next)===JSON.stringify(itemsRef.current))return;
    const result=sketchItemsSchema.safeParse(next);if(!result.success){setError(result.error.issues[0]?.message||'Эскиз слишком большой');return;}
    past.current=[...past.current.slice(-29),itemsRef.current];future.current=[];remember(next);tick(n=>n+1);
  },[remember]);
  const undo=useCallback(()=>{const next=past.current.pop();if(next){future.current.push(itemsRef.current);remember(next);tick(n=>n+1);}},[remember]);
  const redo=useCallback(()=>{const next=future.current.pop();if(next){past.current.push(itemsRef.current);remember(next);tick(n=>n+1);}},[remember]);
  const save=useCallback(async(force=false)=>{
    if(inFlight.current)return;
    const snapshot=itemsRef.current,serialized=JSON.stringify(snapshot);if(serialized===saved.current&&!force)return;
    inFlight.current=true;setSaving(true);
    try {
      if(force){const current=await request<Sketch>('sketch');revision.current=current.revision;}
      const next=await request<Sketch>('sketch',{revision:revision.current,items:snapshot});
      revision.current=next.revision;saved.current=serialized;callback.current(next);
      if(mounted.current){setError('');tick(n=>n+1);}
      try{if(JSON.stringify(itemsRef.current)===serialized)sessionStorage.removeItem(draftKey);else sessionStorage.setItem(draftKey,JSON.stringify({revision:next.revision,items:itemsRef.current}));}catch{}
    }catch(e){if(mounted.current)setError(e instanceof ApiError?e.message:'Не удалось сохранить эскиз. Рисунок остаётся в этой вкладке.');}
    finally{inFlight.current=false;if(mounted.current)setSaving(false);}
  },[]);
  const loadServer=useCallback(async()=>{
    try {const next=await request<Sketch>('sketch');revision.current=next.revision;saved.current=JSON.stringify(next.items);past.current=[];future.current=[];remember(next.items);setError('');callback.current(next);try{sessionStorage.removeItem(draftKey);}catch{};tick(n=>n+1);}catch(e){setError((e as Error).message);}
  },[remember]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(initial.revision===revision.current)return;
    if(JSON.stringify(itemsRef.current)!==saved.current){if(!inFlight.current)setError('Эскиз изменён в другой вкладке. Ваш рисунок остаётся в черновике.');return;}
    revision.current=initial.revision;saved.current=JSON.stringify(initial.items);itemsRef.current=initial.items;setItems(initial.items);past.current=[];future.current=[];tick(n=>n+1);
  },[initial]);
  useEffect(()=>{if(!dirty||error||saving)return;const timer=setTimeout(()=>void save(),500);return()=>clearTimeout(timer);},[items,dirty,error,saving,save,historyTick]);
  useEffect(()=>{
    const unload=(e:BeforeUnloadEvent)=>{if(JSON.stringify(itemsRef.current)!==saved.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);
  },[]);
  return {items,change,undo,redo,canUndo:past.current.length>0,canRedo:future.current.length>0,saving,dirty,error,save,loadServer};
}
