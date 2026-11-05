import { memo, useEffect, useState } from 'react';
import type { Board } from '../shared/model';
import { WindowReflection } from './WindowReflection';
/** Photographic materials stay separate from searchable, accessible board content. */
export function BoardMaterial({theme}: {theme: Board['settings']['theme']}) {
  const [initialTheme] = useState(theme);
  const [bothReady, setBothReady] = useState(false);
  useEffect(() => {
    if (bothReady || theme === initialTheme) return;
    // Keep the original enamel visible until the other photograph can crossfade in.
    let active = true;
    const next = new Image();
    next.src = `/materials/board-${theme}.webp`;
    next.decode().then(() => { if (active) setBothReady(true); }).catch(() => {});
    return () => { active = false; };
  }, [theme, initialTheme, bothReady]);

  return <div className="board-materials" aria-hidden="true" data-surface={bothReady ? theme : initialTheme}>
    <div className="board-plate" data-plate="day" style={bothReady || initialTheme === 'day' ? {borderImageSource:"url('/materials/board-day.webp')"} : undefined}/>
    <div className="board-plate" data-plate="night" style={bothReady || initialTheme === 'night' ? {borderImageSource:"url('/materials/board-night.webp')"} : undefined}/>
  </div>;
}

export const BoardLighting = memo(function BoardLighting() {
  return <div className="board-lighting" aria-hidden="true"><WindowReflection/></div>;
});

export function PaperSurface() {
  return <span className="note-paper" aria-hidden="true"><span className="paper-pigment"/></span>;
}

export function MarkerTray({sketch=false}:{sketch?:boolean}) {
  return <footer className={`tray ${sketch?'sketch-marker-tray':''}`} aria-hidden="true"><img src="/materials/markers.webp" alt="" draggable={false}/></footer>;
}
