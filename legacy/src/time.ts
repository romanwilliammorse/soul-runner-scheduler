import { DateTime } from 'luxon';
export const localZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
export function timeLabel(iso:string,zone:string){return DateTime.fromISO(iso).setZone(zone).toFormat('ccc, LLL d · h:mm a ZZZZ');}
export function weekDays(week:number,zone:string){const start=DateTime.now().setZone(zone).startOf('week').plus({weeks:week});return Array.from({length:7},(_,i)=>start.plus({days:i}));}
export function daySlots(day:DateTime,minutes:number){const end=day.plus({days:1});const slots:DateTime[]=[];for(let t=day;t<end;t=t.plus({minutes}))slots.push(t);return slots;}
