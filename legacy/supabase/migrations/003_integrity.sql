-- Preserve cancellation reasons for both teams without exposing the private admin audit.
create function private.cancel_note() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.action='cancelled' then update public.matchups set note=new.detail->>'reason' where id=(new.detail->>'matchup_id')::uuid; end if;
 return new;
end $$;
create trigger cancellation_note after insert on public.audit for each row execute function private.cancel_note();
revoke all on function private.cancel_note() from public,anon,authenticated;
-- Reject partial null windows explicitly (SQL CHECK treats NULL as passing).
alter table public.matchups add constraint complete_window check ((starts_at is null)=(ends_at is null));
alter table public.matchups add constraint confirmed_has_window check (status<>'confirmed' or (starts_at is not null and ends_at is not null));
alter table public.proposals add constraint proposal_end_after_start check(ends_at>starts_at);
-- Frozen division format while it has matchups; changing meetings must never invalidate series.
create function private.check_division_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.meetings<old.meetings and exists(select 1 from public.matchups m join public.teams t on t.id=m.team_a where t.division_id=old.id and m.meeting>new.meetings) then raise exception 'Existing meeting numbers exceed the new division format'; end if;
 return new;
end $$;
create trigger division_integrity before update on public.divisions for each row execute function private.check_division_change();
revoke all on function private.check_division_change() from public,anon,authenticated;
create or replace function private.notify(e text,m uuid,s timestamptz default null,f timestamptz default null) returns void language sql security definer set search_path='' as $$
 insert into public.outbox(event,payload)
 select e,jsonb_build_object('matchup_id',x.id,'team_a',a.name,'team_b',b.name,'meeting',x.meeting,'starts_at',s,'ends_at',f,'timezone','UTC','series_status',x.status,'override_reason',x.override_reason,'note',x.note,'proposal_status',(select p.status from public.proposals p where p.matchup_id=m order by p.created_at desc limit 1),'accepted_a',(select p.accepted_a from public.proposals p where p.matchup_id=m order by p.created_at desc limit 1),'accepted_b',(select p.accepted_b from public.proposals p where p.matchup_id=m order by p.created_at desc limit 1))
 from public.matchups x join public.teams a on a.id=x.team_a join public.teams b on b.id=x.team_b where x.id=m and exists(select 1 from public.notification_settings where enabled and e=any(events));
$$;
