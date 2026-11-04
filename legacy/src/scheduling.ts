import type { Snapshot, Matchup, Option } from './types';
export const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;
export function covers(spans:{starts_at:string;ends_at:string}[],start:number,end:number){let covered=start;for(const a of [...spans].sort((a,b)=>+new Date(a.starts_at)-+new Date(b.starts_at))){const x=+new Date(a.starts_at),y=+new Date(a.ends_at);if(x<=covered&&y>covered)covered=y;}return covered>=end;}
export function candidates(s: Snapshot, m: Matchup, start: number, end: number, team: string) {
  return [...new Set(s.rosters.filter(r => r.team_id === team && r.eligible).map(r => r.member_id))].filter(id => {
    if (s.bookings.some(b => b.member_id === id && overlaps(start,end,+new Date(b.starts_at),+new Date(b.ends_at)))) return false;
    const spans = s.availability.filter(a => a.member_id === id && a.available).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
    let covered = start;
    for (const a of spans) { const x=+new Date(a.starts_at), y=+new Date(a.ends_at); if(x<=covered && y>covered) covered=y; }
    return covered >= end;
  });
}
export function recommend(s: Snapshot, m: Matchup, now=Date.now()): Option[] {
  if(!['unscheduled','cancelled'].includes(m.status)) return [];
  const team=s.teams.find(t=>t.id===m.team_a)!; const season=s.seasons.find(x=>x.id===team.season_id)!;
  const step=season.slot_minutes*60000, duration=season.duration_minutes*60000;
  const low=Math.max(now,+new Date(season.starts_at),m.starts_at?+new Date(m.starts_at):0);
  const high=Math.min(+new Date(season.ends_at),+new Date(season.deadline),m.ends_at?+new Date(m.ends_at):Infinity,m.deadline?+new Date(m.deadline):Infinity);
  const result: Option[]=[];
  for(let t=Math.ceil(low/step)*step;t+duration<=high;t+=step){
    if(s.matchups.some(x=>x.status==='confirmed' && [m.team_a,m.team_b].some(id=>[x.team_a,x.team_b].includes(id)) && overlaps(t,t+duration,+new Date(x.starts_at!),+new Date(x.ends_at!)))) continue;
    const a=candidates(s,m,t,t+duration,m.team_a), b=candidates(s,m,t,t+duration,m.team_b);
    // A shared eligible member can play for only one side in this series.
    if(a.length>=5 && b.length>=5 && new Set([...a,...b]).size>=10) result.push({starts_at:new Date(t).toISOString(),ends_at:new Date(t+duration).toISOString(),count_a:a.length,count_b:b.length});
  }
  return result.sort((a,b)=>Math.min(b.count_a,b.count_b)-Math.min(a.count_a,a.count_b)||(b.count_a+b.count_b)-(a.count_a+a.count_b)||a.starts_at.localeCompare(b.starts_at)).slice(0,8);
}
export function generatePairs(ids: string[], meetings: number) { const sorted=[...ids].sort(); return sorted.flatMap((a,i)=>sorted.slice(i+1).flatMap(b=>Array.from({length:meetings},(_,n)=>({team_a:a,team_b:b,meeting:n+1})))); }
