import { DateTime } from 'luxon';
import type { Snapshot } from './types';
import { generatePairs } from './scheduling';
export function makeDemo(): Snapshot {
 const base=DateTime.now().toUTC().startOf('day').plus({days:1});
 const iso=(days=0,hours=0)=>base.plus({days,hours}).toISO()!;
 const s:Snapshot={me:'sample-player-1',seasons:[{id:'sample-season',name:'Sample season',starts_at:iso(-7),ends_at:iso(28),deadline:iso(28),slot_minutes:30,duration_minutes:120}],divisions:[{id:'main',name:'Main league',team_count:12,meetings:1},{id:'g',name:'G League',team_count:6,meetings:2}],teams:[],members:[],rosters:[],matchups:[],availability:[],proposals:[],bookings:[],audit:[],outbox:[],notifications:{enabled:false,events:[]}};
 const names=['Night Shift','Gold Standard','Full Court','After Hours','Baseline','High Voltage','The Collective','Northside','Fast Break','Overtime','Skyline','Zero Gravity'];
 for(const d of s.divisions) for(let i=0;i<d.team_count;i++){
  const tid=`${d.id}-${String(i+1).padStart(2,'0')}`;
  s.teams.push({id:tid,name:d.id==='main'?names[i]:`Development ${i+1}`,division_id:d.id,season_id:'sample-season'});
  for(let j=0;j<7;j++){
   const mid=d.id==='main'&&i===0&&j===0?'sample-player-1':`${tid}-p${j}`;
   s.members.push({id:mid,name:j===0?`Sample captain ${i+1}`:`Sample player ${i+1}.${j+1}`,user_id:null,discord_id:null,is_admin:mid==='sample-player-1'});
   s.rosters.push({id:`r-${mid}`,team_id:tid,member_id:mid,owner:j===0,eligible:true,kind:j>4?'bench':'player'});
   for(let day=0;day<7;day++) if(j<6 || day%2===0) s.availability.push({member_id:mid,starts_at:iso(day,23),ends_at:iso(day+1,4),available:true,updated_at:iso(-1)});
  }
 }
 for(const d of s.divisions) s.matchups.push(...generatePairs(s.teams.filter(t=>t.division_id===d.id).map(t=>t.id),d.meetings).map((p,i)=>({...p,id:`${d.id}-match-${i}`,status:'unscheduled',starts_at:null,ends_at:null,deadline:null,note:'Sample matchup — not real league data',override_reason:null})));
 const m=s.matchups[0]; m.status='confirmed';m.starts_at=iso(1,23);m.ends_at=iso(2,1);
 for(const t of [m.team_a,m.team_b]) s.bookings.push(...s.rosters.filter(r=>r.team_id===t).slice(0,5).map(r=>({matchup_id:m.id,member_id:r.member_id,team_id:t,starts_at:m.starts_at!,ends_at:m.ends_at!})));
 s.proposals.push({id:'sample-proposal',matchup_id:s.matchups[1].id,starts_at:iso(2,23),ends_at:iso(3,1),status:'accepted_one',accepted_a:false,accepted_b:true,created_at:iso(-1)});
 s.matchups[3].status='completed';s.matchups[3].note='Sample previously completed series';
 return s;
}
