import { WindowReflection } from './WindowReflection';
/** Photographic materials stay separate from searchable, accessible board content. */
export function BoardMaterial() {
  return <div className="board-materials" aria-hidden="true">
    <div className="board-plate day-plate"/>
    <div className="board-plate night-plate"/>
  </div>;
}

export function BoardLighting() {
  return <div className="board-lighting" aria-hidden="true"><WindowReflection/></div>;
}

export function PaperSurface() {
  return <span className="note-paper" aria-hidden="true"><span className="paper-pigment"/></span>;
}

export function MarkerTray({sketch=false}:{sketch?:boolean}) {
  return <footer className={`tray ${sketch?'sketch-marker-tray':''}`} aria-hidden="true"><img src="/materials/markers.png" alt="" draggable={false}/></footer>;
}
