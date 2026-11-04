create function public.admin_import(entity text,records jsonb) returns int language plpgsql security definer set search_path='' as $$
declare r jsonb; n int:=0;
begin
 perform pg_advisory_xact_lock(78231001);
 if not private.admin() then raise exception 'Admin access required'; end if;
 if jsonb_array_length(records)>500 then raise exception 'Maximum 500 rows'; end if;
 for r in select value from jsonb_array_elements(records) loop perform public.admin_write(entity,r,false); n:=n+1; end loop;
 return n;
end $$;
revoke all on function public.admin_import(text,jsonb) from public,anon;
grant execute on function public.admin_import(text,jsonb) to authenticated;
-- Worker claims with SKIP LOCKED; a 10-minute lease recovers interrupted workers.
alter table public.outbox add column claimed_at timestamptz;
create function public.claim_notifications() returns setof public.outbox language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notification_settings where enabled) then return; end if;
 return query update public.outbox set status='sending',attempts=attempts+1,claimed_at=now() where id in(select id from public.outbox where (status in('pending','failed') or (status='sending' and claimed_at<now()-interval '10 minutes')) and attempts<5 order by created_at for update skip locked limit 20) returning *;
end $$;
revoke all on function public.claim_notifications() from public,anon,authenticated;
grant execute on function public.claim_notifications() to service_role;
grant select,update on public.outbox to service_role;
grant select on public.notification_settings to service_role;
