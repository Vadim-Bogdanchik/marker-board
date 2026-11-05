import { useEffect, useRef, type ReactNode } from 'react';
export function Icon({name,size=23}:{name:string;size?:number}) {
  const paths:Record<string,ReactNode>={
    trash:<path d="m4 6 16-.3M9 5.5l.3-3 5 .2.3 3M6 6.4l1.4 14.2 9.5.3 1.6-14.7M10 9.5l.4 8m3.7-8-.5 8"/>,
    sketch:<><path d="m4 20 3-7L18 2l4 4-11 11zM7 13l4 4M3 22q7-2 17-1"/></>,
    compact:<><path d="m3 5 3-.2v3H3zM10 6h11M3 11h3v3H3zM10 12h11M3 17h3v3H3zM10 18h11"/></>,
    full:<><path d="m3 3 18 .3-.2 18L3 21zM7 7h10M7 12h10M7 17h6"/></>,
    more:<><path d="M4 11v2m8-2v2m8-2v2" strokeWidth="3.5"/></>,
    chevron:<path d="m9 5 7 7-7 7"/>,
    plus:<path d="M12 3v18M3 12h18"/>,
    board:<><path d="M3 4l18-.5.3 15L3 19zM9 4v15M15 4v15M8 22h9"/></>,
    search:<><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></>,
    user:<><ellipse cx="12" cy="6" rx="3.4" ry="3.8"/><path d="M4 21c0-10 16-11 16 0z"/></>,
    calendar:<><path d="m3 5 18-.3v16H3zM3 10h18M7 2v5M17 2v5M7 14h2M13 14h3"/></>,
    folder:<path d="M2 6V3h7l3 3h10l-.5 15H2z"/>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v7l5 2"/></>,
    link:<><path d="m9 7 3-3c6-6 12 2 7 6l-3 3M8 11l-4 4c-5 5 2 11 7 6l3-3M8 16l8-8"/></>,
    sun:<><circle cx="12" cy="12" r="5"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
    moon:<path d="M18 3c-14-2-20 18-3 19 3 0 5-1 7-4C10 20 7 8 18 3z"/>,
    settings:<><path d="M3 5h18M3 12h18M3 19h18"/><path d="M8 2v6M16 9v6M9 16v6"/></>,
    flag:<path d="M5 22V3c6-5 9 5 16 0v11c-6 6-10-5-16 0"/>,
    target:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m12 12 10-10"/></>,
    chat:<path d="M12 3C-1 2-1 18 8 18l-1 5 7-5C27 18 25 3 12 3z"/>,
    archive:<><path d="M3 3h18v5H3zM5 8v13h14V8M9 12h6"/></>,
    check:<path d="m4 12 5 7L21 4"/>,
    arrow:<path d="M3 12h18m-7-7 7 7-7 7"/>,
    light:<><path d="M8 17c0-4-4-5-4-10C4-3 21-3 20 7c0 5-4 6-4 10zM8 21h8M10 24h4M12 16V9"/></>,
    download:<><path d="M12 2v14m-6-6 6 6 6-6M3 17v5h18v-5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.board}</svg>;
}
export function Modal({title,onClose,children,wide=false,className=''}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean;className?:string}) {
  const ref=useRef<HTMLDialogElement>(null), close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.showModal();const target=window.matchMedia('(max-width: 760px)').matches?ref.current?.querySelector<HTMLElement>('.modal-heading h2'):ref.current?.querySelector<HTMLElement>('[data-initial-focus]');target?.focus();return()=>{ref.current?.close();previous?.focus();};},[]);
  return <dialog className={`paper-modal ${wide?'wide':''} ${className}`} ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();close.current();}} onClick={e=>{if(e.target===e.currentTarget)close.current();}}>
    <div className="modal-heading"><h2 tabIndex={-1}>{title}</h2><button className="close" aria-label="Закрыть" onClick={onClose}>×</button></div>{children}
  </dialog>;
}
export const formatDate=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
