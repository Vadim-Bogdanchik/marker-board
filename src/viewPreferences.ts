import { useEffect, useState } from 'react';

export type CardDensity = 'full' | 'compact';
export function useMobileLayout() {
  const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 760px)').matches);
  useEffect(()=>{const query=window.matchMedia('(max-width: 760px)');const change=()=>setMobile(query.matches);query.addEventListener('change',change);change();return()=>query.removeEventListener('change',change);},[]);
  return mobile;
}

// Safari keeps the layout viewport behind its keyboard. Size the editor to the
// visible viewport instead, without reacting to pinch-to-zoom as a layout change.
export function useEditorViewport(mobile:boolean) {
  useEffect(()=>{
    const viewport=window.visualViewport;
    if(!mobile||!viewport)return;
    const root=document.documentElement;
    const update=()=>{if(viewport.scale!==1)return;root.style.setProperty('--editor-height',`${viewport.height}px`);root.style.setProperty('--editor-top',`${viewport.offsetTop}px`);};
    update();viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);
    return()=>{viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);root.style.removeProperty('--editor-height');root.style.removeProperty('--editor-top');};
  },[mobile]);
}
// Appearance belongs to this browser. Phone and desktop can keep different views.
export function useCardDensity(mobile:boolean) {
  const read=(key:string,fallback:CardDensity):CardDensity=>{try{const value=localStorage.getItem(key);return value==='compact'||value==='full'?value:fallback;}catch{return fallback;}};
  const [views,setViews]=useState(()=>({mobile:read('marker-board:cards:mobile','compact'),desktop:read('marker-board:cards:desktop','full')}));
  const device=mobile?'mobile':'desktop';
  const setDensity=(value:CardDensity)=>{setViews(current=>({...current,[device]:value}));try{localStorage.setItem(`marker-board:cards:${device}`,value);}catch{/* The view still works when storage is unavailable. */}};
  return [views[device],setDensity] as const;
}
