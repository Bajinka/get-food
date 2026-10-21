grant update(name,description,address,phone) on public.restaurants to authenticated;
create policy restaurant_branding on public.restaurants for update to authenticated using(public.has_role(id,array['owner','manager']::public.staff_role[])) with check(public.has_role(id,array['owner','manager']::public.staff_role[]));

create function public.confirm_service_time(order_ref uuid, service_time timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; local_time timestamp; s public.restaurant_settings;
begin
 select * into strict o from public.orders where id=order_ref for update;
 if not public.has_role(o.restaurant_id,array['owner','manager']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if o.status not in ('pending','accepted') then raise exception 'Service time can no longer be changed'; end if;
 perform 1 from public.restaurants where id=o.restaurant_id for update;
 select * into strict s from public.restaurant_settings where restaurant_id=o.restaurant_id;
 if service_time<now()+make_interval(mins=>s.preparation_minutes) or service_time>now()+interval '30 days' then raise exception 'Invalid service time'; end if;
 select service_time at time zone timezone into local_time from public.restaurants where id=o.restaurant_id;
 if not exists(select 1 from public.restaurant_hours where restaurant_id=o.restaurant_id and weekday=extract(dow from local_time)::integer and local_time::time>=opens and local_time::time<closes) then raise exception 'Restaurant closed at that time'; end if;
 if (select count(*) from public.orders where restaurant_id=o.restaurant_id and id<>o.id and status not in ('cancelled','rejected','completed') and not (status='pending' and payment_method<>'cash' and payment_status<>'verified' and payment_deadline<now()) and coalesce(confirmed_at,requested_at)>=date_bin('30 minutes',service_time,'2000-01-01'::timestamptz) and coalesce(confirmed_at,requested_at)<date_bin('30 minutes',service_time,'2000-01-01'::timestamptz)+interval '30 minutes')>=s.slot_capacity then raise exception 'Service slot is full'; end if;
 update public.orders set confirmed_at=service_time where id=o.id;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id,details) values(o.restaurant_id,auth.uid(),'order.service_time',o.id,jsonb_build_object('confirmed_at',service_time));
end $$;
revoke all on function public.confirm_service_time(uuid,timestamptz) from public;
grant execute on function public.confirm_service_time(uuid,timestamptz) to authenticated;

create function public.sales_summary(tenant uuid, from_date date, to_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_role(tenant,array['owner','manager']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if to_date<from_date or to_date-from_date>366 then raise exception 'Choose a report range of at most one year'; end if;
 with selected as (select * from public.orders where restaurant_id=tenant and created_at>=from_date::timestamptz and created_at<(to_date+1)::timestamptz),
 daily as(select created_at::date as day,count(*) as orders,coalesce(sum(total) filter(where payment_status='verified'),0) as sales from selected group by 1),
 methods as(select payment_method as method,count(*) as orders,coalesce(sum(total) filter(where payment_status='verified'),0) as sales from selected group by 1),
 popular as(select i.name,sum(i.quantity) as quantity from public.order_items i join selected o on o.id=i.order_id where o.status not in ('cancelled','rejected') group by 1 order by 2 desc limit 10)
 select jsonb_build_object('total_orders',(select count(*) from selected),'cancelled',(select count(*) from selected where status='cancelled'),'verified_sales',(select coalesce(sum(total),0) from selected where payment_status='verified'),'daily',(select coalesce(jsonb_agg(daily order by day),'[]') from daily),'methods',(select coalesce(jsonb_agg(methods),'[]') from methods),'popular',(select coalesce(jsonb_agg(popular),'[]') from popular)) into result;
 return result;
end $$;
revoke all on function public.sales_summary(uuid,date,date) from public;
grant execute on function public.sales_summary(uuid,date,date) to authenticated;
