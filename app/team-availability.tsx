'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {DateTime} from 'luxon';
import {overlapWeek,rankWindows,weekStart,type AvailabilityPlayer,type AvailabilityWindow} from '../lib/team-availability';


const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
type Preferences={zone:string;date:string;minimum:number;duration:number;allHours:boolean};
function SlotDialog({children,close}:{children:React.ReactNode;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 return <dialog ref={ref} className="availability-detail" aria-labelledby="slot-title" onCancel={e=>{e.preventDefault();close();}}><button autoFocus className="secondary" onClick={close}>Back to availability</button>{children}</dialog>;
}
export default function TeamAvailability({teamId,variant='owner',samplePlayers}:{teamId:string;variant?:'owner'|'player';samplePlayers?:AvailabilityPlayer[]}){
 const [players,setPlayers]=useState<AvailabilityPlayer[]|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[preferences,setPreferences]=useState<Preferences|null>(null),[zones,setZones]=useState(['UTC']),[selected,setSelected]=useState<number|null>(null),[busy,setBusy]=useState(false),[showMore,setShowMore]=useState(false),[clock,setClock]=useState(Date.now());
 const request=useRef(0);
 async function refresh(){
  const current=++request.current;setBusy(true);setError('');
  if(samplePlayers){setPlayers(samplePlayers);setBusy(false);return;}
  try{const response=await fetch(`/api/team/${teamId}/availability`,{signal:AbortSignal.timeout(15000)});const body=await response.json() as {error?:string;players:AvailabilityPlayer[]};if(!response.ok)throw Error(body.error||'Unable to load team hours.');if(current===request.current)setPlayers(body.players);}
  catch(e){if(current===request.current)setError((e as Error).message);}
  finally{if(current===request.current)setBusy(false);}
 }
 useEffect(()=>{
  const local=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const availableZones=[...new Set([local,'UTC',...Intl.supportedValuesOf('timeZone')])];setZones(availableZones);
  let next:Preferences={zone:local,date:weekStart(local).toISODate()!,minimum:5,duration:2,allHours:false};
  try{const stored=JSON.parse(localStorage.getItem(`sr-comparison:${teamId}`)||'null');if(stored){const zone=availableZones.includes(stored.zone)?stored.zone:local;const date=typeof stored.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(stored.date)&&DateTime.fromISO(stored.date).isValid?stored.date:weekStart(zone).toISODate()!;next={zone,date:date<weekStart(zone).toISODate()!?weekStart(zone).toISODate()!:date,minimum:Number.isInteger(stored.minimum)&&stored.minimum>=1&&stored.minimum<=20?stored.minimum:5,duration:[1,2,3].includes(stored.duration)?stored.duration:1,allHours:stored.allHours===true};}}catch{/* Preferences are optional on shared/private browsers. */}
  setPreferences(next);setPlayers(null);setSelected(null);setShowMore(false);void refresh();
  return()=>{request.current++;};
 },[teamId,samplePlayers]);
 useEffect(()=>{if(preferences)try{localStorage.setItem(`sr-comparison:${teamId}`,JSON.stringify(preferences));}catch{/* Continue without saved preferences. */}},[preferences,teamId]);
 function change(patch:Partial<Preferences>){setPreferences(p=>p?{...p,...patch}:p);setSelected(null);setShowMore(false);setMessage('');}
 const zone=preferences?.zone||'UTC',date=preferences?.date||'',minimum=preferences?.minimum||5,duration=preferences?.duration||2;
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const cells=useMemo(()=>players&&date?overlapWeek(players,zone,date):[],[players,zone,date]);
 const windows=useMemo(()=>rankWindows(cells.filter(c=>c.start>=clock),minimum,duration),[cells,minimum,duration,clock]);
 const rows=[...new Set(cells.map(c=>c.row))].sort().filter(row=>preferences?.allHours||Number(row.slice(0,2))>=16);
 const chosen=cells.find(c=>c.start===selected),pending=players?.filter(p=>p.slots===null)||[],responded=(players?.length||0)-pending.length;
 const start=DateTime.fromISO(date,{zone}),now=DateTime.now().setZone(zone);
 const names=(ids:string[])=>players?.filter(p=>ids.includes(p.id)).map(p=>p.name).join(', ')||'';
 const timeRange=(w:AvailabilityWindow)=>{const from=DateTime.fromMillis(w.start,{zone}),to=DateTime.fromMillis(w.end,{zone});return `${from.toFormat('h:mm a')}–${to.toFormat(from.toISODate()===to.toISODate()?'h:mm a ZZZZ':'ccc h:mm a ZZZZ')}`;};
 async function copy(text:string,success:string){setError('');setMessage('');try{await navigator.clipboard.writeText(text);setMessage(success);}catch{setError('Copy was blocked by your browser. Select and copy the visible text instead.');}}
 function copyWindow(w:AvailabilityWindow){const at=DateTime.fromMillis(w.start,{zone});void copy(`Proposed game time — not booked\n${at.toFormat('cccc, LLL d, yyyy')} · ${timeRange(w)} (${zone})\n${w.count} players available for the full ${duration} ${duration===1?'hour':'hours'}: ${names(w.available)}\nBased on recurring weekly availability. Please confirm this date with the players and opposing owner.`, 'Proposal copied. Share it with the other owner to confirm.');}
 const grid=players&&preferences&&<><div className="grid-controls"><p>{preferences.allHours?'All 24 hours':'4 PM–midnight'} · tap a count for names</p><button className="text-button" onClick={()=>change({allHours:!preferences.allHours})}>{preferences.allHours?'Show evenings':'Show all hours'}</button></div><div className="week-grid overlap-grid" aria-label="Team weekly availability"><div className="week-head"><span>Time</span>{days.map(d=><span key={d}>{d}</span>)}</div>{rows.map(row=>{const [clock,repeat]=row.split('-'),h=Number(clock.slice(0,2));return <div className="hour-row" key={row}><span className="hour-label">{h%12||12}{clock.endsWith(':00')?'':clock.slice(2)} {h<12?'AM':'PM'}{repeat==='1'?' ②':''}</span>{days.map((_,day)=>{const c=cells.find(c=>c.day===day&&c.row===row);return c?<button key={day} className={`hour overlap-hour ${c.available.length>=minimum?'meets':''} ${c.available.length?'has-players':''}`} aria-label={`${c.label}: ${c.available.length} of ${players.length} available`} onClick={()=>setSelected(c.start)}>{c.available.length||'–'}</button>:<span key={day} className="missing-hour" aria-label="This local hour does not occur">—</span>;})}</div>;})}</div><p className="grid-note">Highlighted = {minimum}+ players for that hour. Unsaved hours are unknown. ② = repeated daylight-saving hour.</p></>;
 return <section className={`team-overview${variant==='player'?' player-team-availability':''}`} aria-label="Team availability overview">
  <div className="overview-heading">{variant==='player'?<h2>Team availability</h2>:<h1>Team availability</h1>}<button className="text-button" disabled={busy} onClick={refresh}>{busy?'Refreshing…':'Refresh'}</button></div>
  {error&&<div className="overview-error" role="alert"><p>{error}</p>{!players&&<button className="secondary" onClick={refresh} disabled={busy}>Try again</button>}</div>}
  {message&&<p className="overview-message" role="status">{message}</p>}
  {!players&&!error&&<p role="status">Loading team hours…</p>}
  {players&&preferences&&<>
   <div className="response-status"><strong>{responded} of {players.length} players responded</strong><span>Saved weekly hours</span></div>
   {pending.length>0?<details className="pending-players"><summary>Waiting on {pending.length} {pending.length===1?'player':'players'}</summary><p>{pending.map(p=>p.name).join(', ')}</p>{variant==='owner'&&<button className="text-button" onClick={()=>copy(`Please save your recurring weekly availability: ${pending.map(p=>p.name).join(', ')}.\n${location.origin}/?team=${teamId}\nEnter the team password, choose your name, and save your hours.`, 'Reminder copied. Paste it in your team Discord.')}>Copy reminder</button>}</details>:<p className="overview-caption">Everyone has responded.</p>}
   {variant==='owner'?<>
   <div className="best-heading"><h2>Best times</h2><p>{start.toFormat('LLL d')}–{start.plus({days:6}).toFormat('LLL d, yyyy')} · {zone.replaceAll('_',' ')}</p></div>
   <details className="match-settings"><summary>{minimum}+ players · {duration}-hour window</summary><div className="match-filters"><label>Players needed<select value={minimum} onChange={e=>change({minimum:Number(e.target.value)})}>{Array.from({length:Math.max(5,players.length,minimum)},(_,i)=><option key={i+1} value={i+1}>{i+1}+ players</option>)}</select></label><label>Game time<select value={duration} onChange={e=>change({duration:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n} value={n}>{n} {n===1?'hour':'hours'}</option>)}</select></label></div></details>
   <p className="overview-caption">Shared weekly hours · not confirmed games.</p>
   {start.plus({days:7})<=now.startOf('day')&&<div className="overview-empty"><p>You’re viewing a past week.</p><button className="text-button" onClick={()=>change({date:weekStart(zone).toISODate()!})}>Show this week</button></div>}
   {windows.length>0?<div className="best-times">{windows.slice(0,showMore?12:3).map((w,i)=><article className="time-card" key={w.start}><div className="time-card-heading"><h3>{DateTime.fromMillis(w.start,{zone}).toFormat('ccc, LLL d')}</h3><span>{w.count}/{players.length} available</span></div><strong className="time-card-time">{timeRange(w)}</strong><p>{names(w.available)}</p><button className={i===0?'primary':'secondary'} onClick={()=>copyWindow(w)}>Copy proposed time</button></article>)}</div>:<div className="overview-empty"><h3>{responded===0?'Waiting for weekly hours':'No shared time yet'}</h3><p>{responded===0?'Ask your players to save their hours. Their best shared times will appear here.':`No upcoming ${duration}-hour window has ${minimum} players available throughout.${pending.length?' More player responses may reveal a match.':' Check another week or ask players to update their hours.'}`}</p><button className="text-button" onClick={()=>change({date:start.plus({weeks:1}).toISODate()!})}>Check next week</button></div>}
   {windows.length>3&&<button className="text-button more-times" onClick={()=>setShowMore(!showMore)}>{showMore?'Show fewer times':`Show more times (${Math.min(12,windows.length)})`}</button>}
   </>:<><p className="overview-caption">{start.toFormat('LLL d')}–{start.plus({days:6}).toFormat('LLL d, yyyy')} · {zone.replaceAll('_',' ')}<br/>Shared weekly hours · not confirmed games.</p><details className="match-settings"><summary>Highlight {minimum}+ players</summary><label>Players needed<select value={minimum} onChange={e=>change({minimum:Number(e.target.value)})}>{Array.from({length:Math.max(5,players.length,minimum)},(_,i)=><option key={i+1} value={i+1}>{i+1}+ players</option>)}</select></label></details></>}
   <details className="comparison-settings"><summary>Change week or time zone</summary><label>Show times in<select value={zone} onChange={e=>change({zone:e.target.value})}>{zones.map(z=><option key={z}>{z}</option>)}</select></label><div className="week-switch"><button className="secondary" aria-label="Previous week" onClick={()=>change({date:start.minus({weeks:1}).toISODate()!})}>‹</button><strong>{start.toFormat('LLL d')}–{start.plus({days:6}).toFormat('LLL d')}</strong><button className="secondary" aria-label="Next week" onClick={()=>change({date:start.plus({weeks:1}).toISODate()!})}>›</button></div><button className="text-button" onClick={()=>change({date:weekStart(zone).toISODate()!})}>This week</button><p className="overview-caption">Recurring hours are adjusted for this week’s time zones. Date-specific exceptions come later.</p></details>
   {variant==='player'?grid:<details className="full-week-grid"><summary>View weekly grid</summary>{grid}</details>}
   {chosen&&<SlotDialog close={()=>setSelected(null)}><h2 id="slot-title">{chosen.label}</h2><p>{zone}</p>{[['Available',players.filter(p=>chosen.available.includes(p.id))],['Unavailable',players.filter(p=>p.slots!==null&&!chosen.available.includes(p.id))],['Not yet answered',pending]].map(([title,list])=><div key={title as string}><h3>{title as string} · {(list as AvailabilityPlayer[]).length}</h3><p>{(list as AvailabilityPlayer[]).map(p=>p.name).join(', ')||'None'}</p></div>)}</SlotDialog>}
  </>}
 </section>;
}
