import {DateTime} from 'luxon';
export type AvailabilityPlayer={id:string;name:string;timezone:string|null;slots:number[]|null};
export type OverlapCell={start:number;end:number;day:number;row:string;label:string;available:string[]};
export function weekStart(zone:string,now=DateTime.now()){
 const local=now.setZone(zone).startOf('day');
 return local.minus({days:local.weekday%7});
}
// Evaluate the entire displayed hour, including fractional-offset time zones.
// Minute granularity covers contemporary IANA offsets and DST transitions.
export function overlapWeek(players:AvailabilityPlayer[],zone:string,startDate:string){
 const start=DateTime.fromISO(startDate,{zone}).startOf('day');
 const cells:OverlapCell[]=[];
 const prepared=players.filter(p=>p.slots!==null&&p.timezone).map(p=>({...p,set:new Set(p.slots!)}));
 const zones=[...new Set(prepared.map(p=>p.timezone!))];
 for(let day=0;day<7;day++){
  const first=start.plus({days:day}),end=first.plus({days:1});
  const occurrences=new Map<string,number>();
  for(let at=first;at<end;at=at.plus({hours:1})){
   const until=Math.min(at.plus({hours:1}).toMillis(),end.toMillis());
   // A short DST day can end with a partial clock-hour interval. It cannot
   // satisfy a full-hour game window, so don't advertise it as one.
   if(until-at.toMillis()!==3600000)continue;
   const clock=at.toFormat('HH:mm'),occurrence=occurrences.get(clock)||0;occurrences.set(clock,occurrence+1);
   // Conversion depends on the zone, not the player. Share the required
   // weekly slots across every player in that zone instead of converting
   // the same instant once per player.
   const required=new Map<string,Set<number>>();
   for(const playerZone of zones){
    const slots=new Set<number>();
    for(let ms=at.toMillis();ms<until;ms+=60000){const local=DateTime.fromMillis(ms,{zone:playerZone});slots.add((local.weekday%7)*24+local.hour);}
    required.set(playerZone,slots);
   }
   const available=prepared.filter(p=>[...required.get(p.timezone!)!].every(slot=>p.set.has(slot))).map(p=>p.id);
   cells.push({start:at.toMillis(),end:until,day,row:`${clock}-${occurrence}`,label:at.toFormat('cccc, LLL d · h:mm a ZZZZ'),available});
  }
 }
 return cells;
}
export type AvailabilityWindow={start:number;end:number;available:string[];count:number};
export function rankWindows(cells:OverlapCell[],minimum:number,durationHours:number):AvailabilityWindow[]{
 if(!Number.isInteger(minimum)||minimum<1||![1,2,3].includes(durationHours))return [];
 const chronological=[...cells].sort((a,b)=>a.start-b.start),byStart=new Map(chronological.map(c=>[c.start,c]));
 const candidates:AvailabilityWindow[]=[];
 for(const first of chronological){
  let available=[...first.available],end=first.start,complete=true;
  for(let h=0;h<durationHours;h++){
   const cell=byStart.get(first.start+h*3600000);
   if(!cell||cell.end-cell.start!==3600000){complete=false;break;}
   const ids=new Set(cell.available);available=available.filter(id=>ids.has(id));end=cell.end;
   if(available.length<minimum){complete=false;break;}
  }
  if(complete)candidates.push({start:first.start,end,available,count:available.length});
 }
 candidates.sort((a,b)=>b.count-a.count||a.start-b.start);
 const selected:AvailabilityWindow[]=[];
 for(const candidate of candidates){
  const identity=[...candidate.available].sort().join(',');
  if(selected.some(prior=>prior.start<candidate.end&&candidate.start<prior.end&&[...prior.available].sort().join(',')===identity))continue;
  selected.push(candidate);
 }
 return selected;
}
