-- All writes go through serialized, authorized RPCs. No client receives a service key.
create schema if not exists private;
revoke all on schema private from public;
create table public.seasons (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100), starts_at timestamptz not null, ends_at timestamptz not null, deadline timestamptz not null, slot_minutes int not null default 30 check(slot_minutes in (15,30,60)), duration_minutes int not null default 120 check(duration_minutes between 30 and 360), check(ends_at>starts_at and deadline>starts_at), check(ends_at-starts_at<=interval '180 days'), check(duration_minutes%slot_minutes=0));
create table public.divisions (id uuid primary key default gen_random_uuid(), name text not null unique, team_count int not null check(team_count between 2 and 32), meetings int not null check(meetings in (1,2)));
insert into public.divisions(name,team_count,meetings) values ('Main league',12,1),('G League',6,2);
create table public.members(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100), user_id uuid unique references auth.users(id), discord_id text unique, is_admin boolean not null default false);
create table public.teams(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100), season_id uuid not null references public.seasons, division_id uuid not null references public.divisions, unique(season_id,division_id,name));
create table public.rosters(id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams, member_id uuid not null references public.members, owner boolean not null default false, eligible boolean not null default false, kind text not null default 'player' check(kind in ('player','bench','call-up')), unique(team_id,member_id));
create table public.matchups(id uuid primary key default gen_random_uuid(), team_a uuid not null references public.teams, team_b uuid not null references public.teams, meeting int not null default 1 check(meeting in (1,2)), status text not null default 'unscheduled' check(status in ('unscheduled','confirmed','completed','cancelled')), starts_at timestamptz, ends_at timestamptz, deadline timestamptz, note text not null default '', override_reason text, check(team_a<team_b), check((starts_at is null and ends_at is null) or ends_at>starts_at), unique(team_a,team_b,meeting));
create table public.availability(id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members, starts_at timestamptz not null, ends_at timestamptz not null, available boolean not null, updated_at timestamptz not null default now(), check(ends_at>starts_at));
create index availability_member_time on public.availability(member_id,starts_at,ends_at);
create table public.proposals(id uuid primary key default gen_random_uuid(), matchup_id uuid not null references public.matchups, starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'awaiting' check(status in ('awaiting','accepted_one','declined','confirmed','cancelled','invalid')), accepted_a boolean not null default false, accepted_b boolean not null default false, created_at timestamptz not null default now());
create unique index one_active_proposal on public.proposals(matchup_id) where status in ('awaiting','accepted_one','confirmed');
create table public.bookings(matchup_id uuid not null references public.matchups, member_id uuid not null references public.members, team_id uuid not null references public.teams, starts_at timestamptz not null, ends_at timestamptz not null, primary key(matchup_id,member_id));
create index bookings_member_time on public.bookings(member_id,starts_at,ends_at);
create table public.audit(id uuid primary key default gen_random_uuid(), actor uuid, action text not null, detail jsonb not null, created_at timestamptz not null default now());
create table public.notification_settings(id boolean primary key default true check(id), enabled boolean not null default false, events text[] not null default array['proposal','decision','confirmed','cancelled']);
insert into public.notification_settings default values;
create table public.outbox(id uuid primary key default gen_random_uuid(), event text not null, payload jsonb not null, status text not null default 'pending', error text, attempts int not null default 0, created_at timestamptz not null default now());

create function private.member_id() returns uuid language sql stable security definer set search_path='' as $$ select id from public.members where user_id=auth.uid() $$;
create function private.admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.members where user_id=auth.uid()),false) $$;
create function private.owner(t uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.rosters where team_id=t and member_id=private.member_id() and owner) $$;
create function private.team_member(t uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.admin() or exists(select 1 from public.rosters where team_id=t and member_id=private.member_id()) $$;
create function private.log(a text,d jsonb) returns void language sql security definer set search_path='' as $$ insert into public.audit(actor,action,detail) values(auth.uid(),a,d) $$;
create function private.notify(e text,m uuid,s timestamptz default null,f timestamptz default null) returns void language sql security definer set search_path='' as $$
 insert into public.outbox(event,payload) select e,jsonb_build_object('matchup_id',x.id,'team_a',a.name,'team_b',b.name,'meeting',x.meeting,'starts_at',s,'ends_at',f,'timezone','UTC') from public.matchups x join public.teams a on a.id=x.team_a join public.teams b on b.id=x.team_b where x.id=m and exists(select 1 from public.notification_settings where enabled and e=any(events)); $$;

-- Internal candidate identities never leave the server for an opposing team.
create function private.candidates(t uuid,s timestamptz,e timestamptz) returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(r.member_id order by r.member_id),'{}'::uuid[]) from public.rosters r where r.team_id=t and r.eligible
 and coalesce((select tstzrange(s,e,'[)') <@ range_agg(tstzrange(a.starts_at,a.ends_at,'[)')) from public.availability a where a.member_id=r.member_id and a.available),false)
 and not exists(select 1 from public.bookings b where b.member_id=r.member_id and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(s,e,'[)')); $$;
create function private.valid_window(m uuid,s timestamptz,e timestamptz) returns boolean language plpgsql stable security definer set search_path='' as $$
declare x public.matchups; z public.seasons; a uuid[]; b uuid[];
begin
 select * into x from public.matchups where id=m; select se.* into z from public.seasons se join public.teams t on t.season_id=se.id where t.id=x.team_a;
 if x.id is null or x.status not in ('unscheduled','cancelled') or s<now() or s<greatest(z.starts_at,coalesce(x.starts_at,z.starts_at)) or e>least(z.ends_at,z.deadline,coalesce(x.ends_at,z.ends_at),coalesce(x.deadline,z.deadline)) or e-s<>make_interval(mins=>z.duration_minutes) or mod(extract(epoch from s)::numeric,z.slot_minutes*60)<>0 then return false; end if;
 if exists(select 1 from public.matchups q where q.status='confirmed' and (q.team_a in(x.team_a,x.team_b) or q.team_b in(x.team_a,x.team_b)) and tstzrange(q.starts_at,q.ends_at,'[)') && tstzrange(s,e,'[)')) then return false; end if;
 a:=private.candidates(x.team_a,s,e); b:=private.candidates(x.team_b,s,e);
 return cardinality(a)>=5 and cardinality(b)>=5 and (select count(distinct u) from unnest(a||b) u)>=10;
end $$;

create function public.recommendations(matchup uuid) returns table(starts_at timestamptz,ends_at timestamptz,count_a int,count_b int) language plpgsql stable security definer set search_path='' as $$
declare x public.matchups; z public.seasons; low timestamptz; high timestamptz;
begin
 select * into x from public.matchups where id=matchup;
 if not (private.team_member(x.team_a) or private.team_member(x.team_b)) then raise exception 'Team access required'; end if;
 select se.* into z from public.seasons se join public.teams t on t.season_id=se.id where t.id=x.team_a;
 low:=greatest(now(),z.starts_at,coalesce(x.starts_at,z.starts_at)); high:=least(z.ends_at,z.deadline,coalesce(x.ends_at,z.ends_at),coalesce(x.deadline,z.deadline));
 return query select s,s+make_interval(mins=>z.duration_minutes),cardinality(private.candidates(x.team_a,s,s+make_interval(mins=>z.duration_minutes))),cardinality(private.candidates(x.team_b,s,s+make_interval(mins=>z.duration_minutes))) from generate_series(to_timestamp(ceil(extract(epoch from low)/(z.slot_minutes*60))*(z.slot_minutes*60)),high-make_interval(mins=>z.duration_minutes),make_interval(mins=>z.slot_minutes)) s where private.valid_window(matchup,s,s+make_interval(mins=>z.duration_minutes)) order by least(cardinality(private.candidates(x.team_a,s,s+make_interval(mins=>z.duration_minutes))),cardinality(private.candidates(x.team_b,s,s+make_interval(mins=>z.duration_minutes)))) desc, cardinality(private.candidates(x.team_a,s,s+make_interval(mins=>z.duration_minutes)))+cardinality(private.candidates(x.team_b,s,s+make_interval(mins=>z.duration_minutes))) desc,s limit 8;
end $$;

create function public.save_availability(period_start timestamptz,period_end timestamptz,slots jsonb) returns void language plpgsql security definer set search_path='' as $$
declare mid uuid:=private.member_id(); r record;
begin
 perform pg_advisory_xact_lock(78231001);
 if mid is null then raise exception 'Ask an admin to link your Discord account'; end if;
 if period_end<=period_start or period_end-period_start>interval '8 days' or jsonb_array_length(slots)>1000 then raise exception 'Invalid availability period'; end if;
 if exists(select 1 from jsonb_to_recordset(slots) as a(starts_at timestamptz,ends_at timestamptz,available boolean) where starts_at is null or ends_at is null or available is null or starts_at<period_start or ends_at>period_end or ends_at<=starts_at) then raise exception 'Invalid slot'; end if;
 if exists(select 1 from jsonb_array_elements(slots) with ordinality a(v,n) join jsonb_array_elements(slots) with ordinality b(v,n) on a.n<b.n and tstzrange((a.v->>'starts_at')::timestamptz,(a.v->>'ends_at')::timestamptz,'[)') && tstzrange((b.v->>'starts_at')::timestamptz,(b.v->>'ends_at')::timestamptz,'[)')) then raise exception 'Slots overlap'; end if;
 for r in delete from public.availability where member_id=mid and tstzrange(starts_at,ends_at,'[)') && tstzrange(period_start,period_end,'[)') returning * loop
   if r.starts_at<period_start then insert into public.availability(member_id,starts_at,ends_at,available) values(mid,r.starts_at,period_start,r.available); end if;
   if r.ends_at>period_end then insert into public.availability(member_id,starts_at,ends_at,available) values(mid,period_end,r.ends_at,r.available); end if;
 end loop;
 insert into public.availability(member_id,starts_at,ends_at,available) select mid,a.starts_at,a.ends_at,a.available from jsonb_to_recordset(slots) as a(starts_at timestamptz,ends_at timestamptz,available boolean);
 perform private.log('availability_saved',jsonb_build_object('member_id',mid,'start',period_start,'end',period_end));
end $$;

create function public.propose(matchup uuid,start_time timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare x public.matchups; finish timestamptz; pid uuid;
begin
 perform pg_advisory_xact_lock(78231001);
 select * into x from public.matchups where id=matchup;
 if not(private.admin() or private.owner(x.team_a) or private.owner(x.team_b)) then raise exception 'Owner access required'; end if;
 select start_time+make_interval(mins=>s.duration_minutes) into finish from public.seasons s join public.teams t on t.season_id=s.id where t.id=x.team_a;
 if not private.valid_window(matchup,start_time,finish) then raise exception 'This window no longer qualifies. Availability, eligibility, the deadline or another booking changed.'; end if;
 if exists(select 1 from public.proposals where matchup_id=matchup and status in ('awaiting','accepted_one','confirmed')) then raise exception 'Cancel the active proposal before proposing another time'; end if;
 insert into public.proposals(matchup_id,starts_at,ends_at) values(matchup,start_time,finish) returning id into pid;
 perform private.log('proposal',jsonb_build_object('proposal_id',pid)); perform private.notify('proposal',matchup,start_time,finish); return pid;
end $$;

create function public.decide(proposal uuid,team uuid,accept boolean) returns text language plpgsql security definer set search_path='' as $$
declare p public.proposals; x public.matchups; a uuid[]; b uuid[]; chosen uuid[];
begin
 perform pg_advisory_xact_lock(78231001);
 select * into p from public.proposals where id=proposal for update; select * into x from public.matchups where id=p.matchup_id;
 if team not in(x.team_a,x.team_b) or not private.owner(team) then raise exception 'Only this team’s assigned owner can decide'; end if;
 if p.id is null or p.status not in ('awaiting','accepted_one') then raise exception 'Proposal is no longer awaiting a decision'; end if;
 if not accept then update public.proposals set status='declined' where id=proposal; perform private.log('declined',jsonb_build_object('proposal_id',proposal,'team_id',team)); perform private.notify('decision',x.id,p.starts_at,p.ends_at); return 'declined'; end if;
 if team=x.team_a then p.accepted_a:=true; else p.accepted_b:=true; end if;
 if p.accepted_a and p.accepted_b then
   if not private.valid_window(x.id,p.starts_at,p.ends_at) then update public.proposals set status='invalid' where id=proposal; perform private.log('proposal_invalid',jsonb_build_object('proposal_id',proposal)); return 'invalid'; end if;
   a:=private.candidates(x.team_a,p.starts_at,p.ends_at); b:=private.candidates(x.team_b,p.starts_at,p.ends_at);
   -- Prefer A-only players, leaving shared members for B. Distinct lineups always exist if union >= 10.
   select array_agg(u) into chosen from (select u from unnest(a) u order by (u=any(b)),u limit 5) q;
   insert into public.bookings select x.id,u,x.team_a,p.starts_at,p.ends_at from unnest(chosen) u;
   insert into public.bookings select x.id,u,x.team_b,p.starts_at,p.ends_at from unnest(b) u where not(u=any(chosen)) order by u limit 5;
   update public.matchups set status='confirmed',starts_at=p.starts_at,ends_at=p.ends_at where id=x.id;
   p.status:='confirmed';
 else p.status:='accepted_one'; end if;
 update public.proposals set accepted_a=p.accepted_a,accepted_b=p.accepted_b,status=p.status where id=proposal;
 perform private.log(p.status,jsonb_build_object('proposal_id',proposal,'team_id',team)); perform private.notify(case when p.status='confirmed' then 'confirmed' else 'decision' end,x.id,p.starts_at,p.ends_at); return p.status;
end $$;

create function public.cancel_series(matchup uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare x public.matchups;
begin
 perform pg_advisory_xact_lock(78231001); select * into x from public.matchups where id=matchup;
 if not(private.admin() or private.owner(x.team_a) or private.owner(x.team_b)) then raise exception 'Owner access required'; end if;
 if length(trim(reason))<3 then raise exception 'A cancellation reason is required'; end if;
 if x.status='completed' then raise exception 'Completed series cannot be cancelled'; end if;
 update public.proposals set status='cancelled' where matchup_id=matchup and status in('awaiting','accepted_one','confirmed'); delete from public.bookings where matchup_id=matchup;
 -- Clear former confirmed times; matchup windows can be set again by an admin.
 if x.status='confirmed' then update public.matchups set status='cancelled',starts_at=null,ends_at=null,override_reason=null,note=reason where id=matchup; end if;
 perform private.log('cancelled',jsonb_build_object('matchup_id',matchup,'reason',reason)); perform private.notify('cancelled',matchup,x.starts_at,x.ends_at);
end $$;

create function public.admin_write(entity text,record jsonb,remove boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare cols text; updates text; rid uuid:=(record->>'id')::uuid; old public.matchups;
begin
 perform pg_advisory_xact_lock(78231001);
 if not private.admin() then raise exception 'Admin access required'; end if;
 if entity not in('seasons','divisions','teams','members','rosters','matchups') then raise exception 'Unsupported entity'; end if;
 if entity='members' and exists(select 1 from public.members where id=rid and is_admin) and (remove or not coalesce((record->>'is_admin')::boolean,false)) and (select count(*) from public.members where is_admin)<2 then raise exception 'Cannot remove the last admin'; end if;
 if entity='matchups' then
  select * into old from public.matchups where id=rid;
  if old.status='confirmed' or (record->>'status')='confirmed' or record->>'override_reason' is not null then raise exception 'Use cancellation or the explicit override workflow for confirmed series'; end if;
  if exists(select 1 from public.proposals where matchup_id=rid and status in('awaiting','accepted_one')) then raise exception 'Cancel the active proposal before editing this matchup'; end if;
 end if;
 if remove then execute format('delete from public.%I where id=$1',entity) using rid;
 else
  select string_agg(quote_ident(column_name),','),string_agg(format('%I=excluded.%I',column_name,column_name),',') filter(where column_name<>'id') into cols,updates from information_schema.columns where table_schema='public' and table_name=entity;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(id) do update set %s',entity,cols,cols,entity,updates) using record;
 end if;
 perform private.log('admin_'||entity,jsonb_build_object('record',record,'removed',remove));
end $$;

create function private.check_matchup() returns trigger language plpgsql set search_path='' as $$
declare a public.teams; b public.teams; n int;
begin
 select * into a from public.teams where id=new.team_a; select * into b from public.teams where id=new.team_b; select meetings into n from public.divisions where id=a.division_id;
 if a.season_id<>b.season_id or a.division_id<>b.division_id or new.meeting>n then raise exception 'Teams must be in the same season and division with a valid meeting number'; end if;
 return new;
end $$;
create trigger validate_matchup before insert or update on public.matchups for each row execute function private.check_matchup();
create function private.check_team_move() returns trigger language plpgsql set search_path='' as $$ begin if (new.season_id<>old.season_id or new.division_id<>old.division_id) and exists(select 1 from public.matchups where team_a=old.id or team_b=old.id) then raise exception 'A team with matchups cannot move season or division'; end if; return new; end $$;
create trigger validate_team_move before update on public.teams for each row execute function private.check_team_move();

create function public.generate_matchups(season uuid,division uuid) returns int language plpgsql security definer set search_path='' as $$
declare total int; expected int; n int; added int;
begin
 perform pg_advisory_xact_lock(78231001); if not private.admin() then raise exception 'Admin access required'; end if;
 select team_count,meetings into expected,n from public.divisions where id=division; select count(*) into total from public.teams where season_id=season and division_id=division;
 if total<>expected then raise exception 'Expected % teams, found %',expected,total; end if;
 insert into public.matchups(team_a,team_b,meeting) select a.id,b.id,g from public.teams a join public.teams b on a.id<b.id and a.season_id=b.season_id and a.division_id=b.division_id cross join generate_series(1,n) g where a.season_id=season and a.division_id=division on conflict(team_a,team_b,meeting) do nothing;
 get diagnostics added=row_count; perform private.log('generate_matchups',jsonb_build_object('added',added,'division',division)); return added;
end $$;

create function public.admin_resolve(matchup uuid,action text,reason text,start_time timestamptz default null,end_time timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare x public.matchups;
begin
 perform pg_advisory_xact_lock(78231001); if not private.admin() then raise exception 'Admin access required'; end if;
 if length(trim(reason))<3 then raise exception 'A recorded reason is required'; end if;
 select * into x from public.matchups where id=matchup; if x.id is null then raise exception 'Matchup not found'; end if;
 if action not in('complete','override') then raise exception 'Unsupported resolution'; end if;
 if action='override' and (start_time is null or end_time is null or end_time<=start_time) then raise exception 'Valid start and end required'; end if;
 if action='override' and exists(select 1 from public.matchups q where q.id<>matchup and q.status='confirmed' and (q.team_a in(x.team_a,x.team_b) or q.team_b in(x.team_a,x.team_b)) and tstzrange(q.starts_at,q.ends_at,'[)') && tstzrange(start_time,end_time,'[)')) then raise exception 'Cancel the conflicting team booking before overriding'; end if;
 delete from public.bookings where matchup_id=matchup;
 update public.proposals set status='cancelled' where matchup_id=matchup and status in('awaiting','accepted_one','confirmed');
 update public.matchups set status=case when action='complete' then 'completed' else 'confirmed' end,starts_at=case when action='override' then start_time else null end,ends_at=case when action='override' then end_time else null end,note=reason,override_reason=case when action='override' then reason else null end where id=matchup;
 -- Exceptional booking reserves ALL eligible players, avoiding untracked cross-team conflicts.
 if action='override' then
  if exists(select 1 from public.bookings b join public.rosters r on r.member_id=b.member_id where r.team_id in(x.team_a,x.team_b) and r.eligible and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,end_time,'[)')) then raise exception 'An eligible player has a conflicting booking'; end if;
  insert into public.bookings select distinct on(r.member_id) matchup,r.member_id,r.team_id,start_time,end_time from public.rosters r where r.team_id in(x.team_a,x.team_b) and r.eligible order by r.member_id,r.team_id;
  perform private.notify('confirmed',matchup,start_time,end_time);
 end if;
 perform private.log('admin_'||action,jsonb_build_object('matchup_id',matchup,'reason',reason,'start',start_time,'end',end_time));
end $$;

create function public.set_notifications(enabled boolean,events text[]) returns void language plpgsql security definer set search_path='' as $$ begin perform pg_advisory_xact_lock(78231001); if not private.admin() then raise exception 'Admin access required'; end if; update public.notification_settings s set enabled=set_notifications.enabled,events=set_notifications.events; perform private.log('notifications_updated',jsonb_build_object('enabled',enabled,'events',events)); end $$;

-- Read policies: members only; opposing individual availability and bookings stay private.
do $$ declare t text; begin foreach t in array array['seasons','divisions','teams','members','rosters','matchups','availability','proposals','bookings','audit','notification_settings','outbox'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant select on public.%I to authenticated',t); end loop; end $$;
grant usage on schema private to authenticated;
grant execute on function private.member_id(),private.admin(),private.owner(uuid),private.team_member(uuid) to authenticated;
do $$ declare t text; begin foreach t in array array['seasons','divisions','teams','rosters','matchups','proposals','notification_settings'] loop execute format('create policy member_read on public.%I for select to authenticated using (private.member_id() is not null)',t); end loop; end $$;
create policy members_read on public.members for select to authenticated using(private.admin() or id=private.member_id() or exists(select 1 from public.rosters r where r.member_id=id and private.team_member(r.team_id)));
create policy availability_read on public.availability for select to authenticated using(private.admin() or member_id=private.member_id() or exists(select 1 from public.rosters r where r.member_id=availability.member_id and private.owner(r.team_id)));
create policy bookings_read on public.bookings for select to authenticated using(private.admin() or private.team_member(team_id));
create policy audit_read on public.audit for select to authenticated using(private.admin());
create policy outbox_read on public.outbox for select to authenticated using(private.admin());
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.member_id(),private.admin(),private.owner(uuid),private.team_member(uuid) to authenticated;
revoke execute on all functions in schema public from public,anon;
grant execute on function public.recommendations(uuid),public.save_availability(timestamptz,timestamptz,jsonb),public.propose(uuid,timestamptz),public.decide(uuid,uuid,boolean),public.cancel_series(uuid,text),public.admin_write(text,jsonb,boolean),public.generate_matchups(uuid,uuid),public.admin_resolve(uuid,text,text,timestamptz,timestamptz),public.set_notifications(boolean,text[]) to authenticated;

