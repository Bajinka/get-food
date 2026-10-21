-- Public availability exposes service times only, never booking or customer rows.
-- Checkout remains authoritative: capacity is rechecked under its tenant lock.
create index orders_active_service_time on public.orders(restaurant_id,(coalesce(confirmed_at,requested_at)))
where status not in ('cancelled','rejected','completed');
create function public.available_service_times(tenant uuid, service_day date, item_ids uuid[])
returns table(service_time timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare r public.restaurants; s public.restaurant_settings; lead_minutes integer;
begin
 select * into r from public.restaurants where id=tenant and active;
 if not found then return; end if;
 if service_day is null or service_day<(now() at time zone r.timezone)::date
    or service_day>(now() at time zone r.timezone)::date+30 then return; end if;
 if item_ids is null or cardinality(item_ids) not between 1 and 30 then return; end if;
 if exists(select 1 from unnest(item_ids) i where not exists(
   select 1 from public.menu_items m where m.id=i and m.restaurant_id=tenant and m.available
 )) then return; end if;
 select * into s from public.restaurant_settings where restaurant_id=tenant;
 if not found then return; end if;
 select greatest(s.preparation_minutes,s.cutoff_minutes,coalesce(max(m.preparation_minutes),0))
 into lead_minutes from public.menu_items m where m.restaurant_id=tenant and m.id=any(item_ids);
 return query
 select candidate.slot from public.restaurant_hours h
 cross join lateral generate_series(
   (service_day+h.opens) at time zone r.timezone,
   (service_day+h.closes) at time zone r.timezone,
   interval '30 minutes'
 ) candidate(slot)
 where h.restaurant_id=tenant and h.weekday=extract(dow from service_day)::integer
   and candidate.slot<((service_day+h.closes) at time zone r.timezone)
   and candidate.slot>=now()+make_interval(mins=>lead_minutes)
   and candidate.slot<=now()+interval '30 days'
   and (select count(*) from public.orders o
     where o.restaurant_id=tenant and o.status not in ('cancelled','rejected','completed')
       and not (o.status='pending' and o.payment_method<>'cash' and o.payment_status<>'verified' and o.payment_deadline<now())
       and coalesce(o.confirmed_at,o.requested_at)>=date_bin('30 minutes',candidate.slot,'2000-01-01'::timestamptz)
       and coalesce(o.confirmed_at,o.requested_at)<date_bin('30 minutes',candidate.slot,'2000-01-01'::timestamptz)+interval '30 minutes'
   )<s.slot_capacity
 order by candidate.slot;
end $$;
revoke all on function public.available_service_times(uuid,date,uuid[]) from public;
grant execute on function public.available_service_times(uuid,date,uuid[]) to anon,authenticated;
