'use client';
import {useRef, useState} from 'react';
import square from '../vendor/schedule-selector/square';

const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const dates=days.map((_,d)=>Array.from({length:24},(_,h)=>new Date(2023,0,1+d,h)));
const dateFor=(slot:number)=>dates[Math.floor(slot/24)][slot%24];
const slotFor=(date:Date)=>date.getDay()*24+date.getHours();
export function rectangle(start:number,end:number){return square(dateFor(start),dateFor(end),dates).map(slotFor);}
export default function AvailabilityGrid({selected,onChange,disabled}:{selected:Set<number>;onChange:(s:Set<number>)=>void;disabled:boolean}){
 const [period,setPeriod]=useState(16),[paint,setPaint]=useState(false);
 const tap=useRef<{slot:number;x:number;y:number}|null>(null);
 const drag=useRef<{start:number;base:Set<number>;add:boolean;pointer:number}|null>(null);
 const [focus,setFocus]=useState(16),root=useRef<HTMLDivElement>(null);
 function update(end:number){const d=drag.current;if(!d)return;const next=new Set(d.base);for(const s of rectangle(d.start,end))d.add?next.add(s):next.delete(s);onChange(next);}
 function toggle(slot:number){const next=new Set(selected);next.has(slot)?next.delete(slot):next.add(slot);onChange(next);}
 return <><div className="grid-toolbar"><div className="segments" aria-label="Hours shown">{[[0,'Night'],[8,'Day'],[16,'Evening']].map(([n,label])=><button key={n} type="button" aria-pressed={period===n} onClick={()=>{setPeriod(Number(n));setFocus(Number(n));}}>{label}</button>)}</div><button type="button" className="text-button touch-paint" aria-pressed={paint} onClick={()=>setPaint(!paint)}>{paint?'Drag on':'Drag off'}</button></div>
 <p className="grid-hint">Tap hours you can play.{paint?' Drag across hours to fill a block.':' Mouse users can drag across a block.'}</p>
 <div className={'availability-grid '+(paint?'paint':'')} ref={root} role="group" aria-label="Weekly availability grid" onPointerMove={e=>{if(!drag.current)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-slot]');if(target&&root.current?.contains(target))update(Number(target.dataset.slot));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;tap.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
 <span className="grid-corner" aria-hidden="true">Hour</span>{days.map((d,i)=><div className="grid-day" key={d}>{d.slice(0,3)}<small>{[...selected].filter(n=>Math.floor(n/24)===i).length}h</small></div>)}
 {Array.from({length:8},(_,i)=>i+period).map(h=><div className="grid-row" key={h}><span className="grid-time">{h%12||12}<small>{h<12?'AM':'PM'}</small></span>{days.map((d,i)=>{const slot=i*24+h;return <button key={slot} type="button" data-slot={slot} tabIndex={slot===focus?0:-1} disabled={disabled} aria-pressed={selected.has(slot)} aria-label={`${d}, ${h%12||12} ${h<12?'AM':'PM'} to ${(h+1)%12||12} ${(h+1)%24<12?'AM':'PM'}`} onFocus={()=>setFocus(slot)} onPointerDown={e=>{if(disabled||e.button!==0)return;if(e.pointerType==='touch'&&!paint){tap.current={slot,x:e.clientX,y:e.clientY};return;}e.preventDefault();e.currentTarget.focus();root.current?.setPointerCapture(e.pointerId);drag.current={start:slot,base:new Set(selected),add:!selected.has(slot),pointer:e.pointerId};update(slot);}} onPointerUp={e=>{const t=tap.current;if(t&&t.slot===slot&&Math.hypot(e.clientX-t.x,e.clientY-t.y)<10&&!disabled)toggle(slot);tap.current=null;}} onClick={e=>{if(e.detail===0)toggle(slot);}} onKeyDown={e=>{let next=slot;if(e.key==='ArrowRight')next=Math.min(6,i+1)*24+h;else if(e.key==='ArrowLeft')next=Math.max(0,i-1)*24+h;else if(e.key==='ArrowDown')next=i*24+Math.min(period+7,h+1);else if(e.key==='ArrowUp')next=i*24+Math.max(period,h-1);else return;e.preventDefault();setFocus(next);root.current?.querySelector<HTMLButtonElement>(`[data-slot="${next}"]`)?.focus();}}><span aria-hidden="true">{selected.has(slot)?'✓':''}</span></button>;})}</div>)}
 </div><div className="grid-legend"><span><i/> Available</span><span><i/> Not selected</span><span>1-hour blocks</span></div></>;
}
