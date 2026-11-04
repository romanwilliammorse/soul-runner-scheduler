import { useEffect, useRef, type ReactNode } from 'react';
export default function Modal({label,onClose,children}:{label:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{const before=document.activeElement as HTMLElement|null;ref.current?.querySelector<HTMLElement>('button,input,select')?.focus();return()=>before?.focus();},[]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={label} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();onClose();}
  if(e.key==='Tab'){const nodes=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')||[]);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>{children}</section></div>;
}
