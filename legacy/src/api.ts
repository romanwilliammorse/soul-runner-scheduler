import { createClient } from '@supabase/supabase-js';
import type { Snapshot, Option, Slot } from './types';
import { makeDemo } from './demo';
import { recommend, generatePairs, candidates } from './scheduling';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase=url&&key?createClient(url,key):null;
export const isDemo=!supabase;
const storageKey='soul-runner-sample-v1';
let demo:Snapshot;
try { demo=JSON.parse(localStorage.getItem(storageKey)||'null')||makeDemo(); } catch { demo=makeDemo(); }
const persist=()=>localStorage.setItem(storageKey,JSON.stringify(demo));
export async function snapshot():Promise<Snapshot>{
 if(!supabase) return structuredClone(demo);
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return {seasons:[],divisions:[],teams:[],members:[],rosters:[],matchups:[],proposals:[],availability:[],bookings:[],audit:[],outbox:[],me:null,notifications:{enabled:false,events:[]}};
 const tables=['seasons','divisions','teams','members','rosters','matchups','proposals','availability','bookings','audit','outbox','notification_settings'];
 const result:Record<string,unknown>={};
 await Promise.all(tables.map(async t=>{const rows:unknown[]=[];for(let offset=0;;offset+=1000){let query=supabase!.from(t).select('*').order(t==='bookings'?'member_id':'id').range(offset,offset+999);if(t==='bookings')query=query.order('matchup_id');const {data,error}=await query;if(error)throw error;rows.push(...data);if(data.length<1000)break;}result[t]=rows;}));
 const members=result.members as Snapshot['members'];
 return {...result,me:members.find(m=>m.user_id===user?.id)?.id||null,notifications:(result.notification_settings as Snapshot['notifications'][])[0]||{enabled:false,events:[]}} as unknown as Snapshot;
}
export async function options(s:Snapshot,id:string):Promise<Option[]>{ if(!supabase)return recommend(s,s.matchups.find(m=>m.id===id)!); const {data,error}=await supabase.rpc('recommendations',{matchup:id});if(error)throw error;return data; }
export async function mutate(name:string,args:Record<string,unknown>):Promise<unknown>{
 if(supabase){const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}
 const m=demo.matchups.find(x=>x.id===args.matchup);
 let result:unknown;
 if(name==='save_availability'){
  const start=+new Date(args.period_start as string),end=+new Date(args.period_end as string);
  demo.availability=demo.availability.flatMap(a=>{if(a.member_id!==demo.me || +new Date(a.ends_at)<=start || +new Date(a.starts_at)>=end)return [a];const keep:Slot[]=[];if(+new Date(a.starts_at)<start)keep.push({...a,ends_at:new Date(start).toISOString()});if(+new Date(a.ends_at)>end)keep.push({...a,starts_at:new Date(end).toISOString()});return keep;});
  demo.availability.push(...(args.slots as Slot[]).map(a=>({...a,member_id:demo.me!,updated_at:new Date().toISOString()})));
 }else if(name==='propose'){
  const o=recommend(demo,m!).find(x=>+new Date(x.starts_at)===+new Date(args.start_time as string));if(!o)throw Error('This window no longer qualifies. Refresh recommendations.');
  if(demo.proposals.some(p=>p.matchup_id===m!.id&&['awaiting','accepted_one','confirmed'].includes(p.status)))throw Error('Cancel the active proposal first.');
  demo.proposals.push({id:crypto.randomUUID(),matchup_id:m!.id,starts_at:o.starts_at,ends_at:o.ends_at,status:'awaiting',accepted_a:false,accepted_b:false,created_at:new Date().toISOString()});
 }else if(name==='decide'){
  const p=demo.proposals.find(x=>x.id===args.proposal)!;const match=demo.matchups.find(x=>x.id===p.matchup_id)!;
  if(!['awaiting','accepted_one'].includes(p.status))throw Error('This proposal is no longer active.');
  if(!args.accept)p.status='declined';else {
   if(args.team===match.team_a)p.accepted_a=true;else p.accepted_b=true;
   p.status='accepted_one';
   if(p.accepted_a&&p.accepted_b){
    if(!recommend(demo,match).some(o=>o.starts_at===p.starts_at))p.status='invalid';
    else {const a=candidates(demo,match,+new Date(p.starts_at),+new Date(p.ends_at),match.team_a),b=candidates(demo,match,+new Date(p.starts_at),+new Date(p.ends_at),match.team_b);const chosen=a.sort((x,y)=>Number(b.includes(x))-Number(b.includes(y))||x.localeCompare(y)).slice(0,5);for(const [team,ids] of [[match.team_a,chosen],[match.team_b,b.filter(x=>!chosen.includes(x)).slice(0,5)]] as [string,string[]][])demo.bookings.push(...ids.map(id=>({matchup_id:match.id,member_id:id,team_id:team,starts_at:p.starts_at,ends_at:p.ends_at})));p.status='confirmed';match.status='confirmed';match.starts_at=p.starts_at;match.ends_at=p.ends_at;}
   }
  }result=p.status;
 }else if(name==='cancel_series'){
  demo.proposals.filter(p=>p.matchup_id===m!.id&&['awaiting','accepted_one','confirmed'].includes(p.status)).forEach(p=>p.status='cancelled');demo.bookings=demo.bookings.filter(b=>b.matchup_id!==m!.id);if(m!.status==='confirmed'){m!.status='cancelled';m!.starts_at=null;m!.ends_at=null;m!.override_reason=null;m!.note=String(args.reason);}
 }else if(name==='admin_write'){
  const table=demo[args.entity as keyof Snapshot] as unknown as {id:string}[];const r=args.record as {id:string};const index=table.findIndex(x=>x.id===r.id);if(args.remove){if(index>=0)table.splice(index,1);}else if(index>=0)table[index]=r;else table.push(r);
 }else if(name==='generate_matchups'){
  const d=demo.divisions.find(x=>x.id===args.division)!;const ids=demo.teams.filter(t=>t.division_id===d.id&&t.season_id===args.season).map(t=>t.id);if(ids.length!==d.team_count)throw Error(`Expected ${d.team_count} teams; found ${ids.length}.`);let n=0;
  for(const p of generatePairs(ids,d.meetings))if(!demo.matchups.some(m=>m.team_a===p.team_a&&m.team_b===p.team_b&&m.meeting===p.meeting)){demo.matchups.push({...p,id:crypto.randomUUID(),status:'unscheduled',starts_at:null,ends_at:null,deadline:null,note:'',override_reason:null});n++;}result=n;
 }else if(name==='admin_resolve'){
  demo.bookings=demo.bookings.filter(b=>b.matchup_id!==m!.id);demo.proposals.filter(p=>p.matchup_id===m!.id&&['awaiting','accepted_one','confirmed'].includes(p.status)).forEach(p=>p.status='cancelled');m!.status=args.action==='complete'?'completed':'confirmed';m!.note=String(args.reason);m!.override_reason=args.action==='override'?String(args.reason):null;m!.starts_at=args.action==='override'?String(args.start_time):null;m!.ends_at=args.action==='override'?String(args.end_time):null;
 }else if(name==='set_notifications'){demo.notifications={enabled:!!args.enabled,events:args.events as string[]};}
 demo.audit.unshift({id:crypto.randomUUID(),action:name,created_at:new Date().toISOString(),detail:args});persist();return result;
}
export function resetDemo(){demo=makeDemo();persist();}
