-- Failed checkout validations must still consume a rate-limit attempt. Called in a
-- separate committed RPC by the trusted server before order creation.
create function public.checkout_budget(client_bucket text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if length(client_bucket)<>64 then raise exception 'Invalid bucket'; end if;
 insert into public.checkout_limits values('attempt:'||client_bucket,1,now()+interval '10 minutes')
 on conflict(bucket) do update set attempts=case when checkout_limits.expires_at<now() then 1 else checkout_limits.attempts+1 end,
 expires_at=case when checkout_limits.expires_at<now() then now()+interval '10 minutes' else checkout_limits.expires_at end returning attempts into n;
 return n<=20;
end $$;
revoke all on function public.checkout_budget(text) from public,anon,authenticated;
grant execute on function public.checkout_budget(text) to service_role;

-- Restrict kitchen/waiter reads to operationally relevant orders. Payment rows
-- remain restricted to cashier/management by the foundation migration.
drop policy staff_read on public.orders;
create policy operational_order_read on public.orders for select to authenticated using(
 public.has_role(restaurant_id,array['owner','manager','cashier']::public.staff_role[])
 or (public.has_role(restaurant_id,array['kitchen']::public.staff_role[]) and status in ('accepted','preparing','ready') and (timing='now' or payment_status='verified'))
 or (public.has_role(restaurant_id,array['waiter']::public.staff_role[]) and service_type='dine_in')
);

create function public.verify_table(order_ref uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 select * into strict o from public.orders where id=order_ref for update;
 if not public.has_role(o.restaurant_id,array['owner','manager','waiter']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if o.service_type<>'dine_in' or o.table_id is null then raise exception 'No table assigned'; end if;
 update public.orders set table_verified=true where id=o.id;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id) values(o.restaurant_id,auth.uid(),'table.verify',o.id);
end $$;
revoke all on function public.verify_table(uuid) from public;
grant execute on function public.verify_table(uuid) to authenticated;

create function public.remove_staff(tenant uuid, member uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,0));
 if not public.has_role(tenant,array['owner']::public.staff_role[]) then raise exception 'Only owners can remove staff'; end if;
 if exists(select 1 from public.staff_memberships where restaurant_id=tenant and user_id=member and role='owner') and (select count(*) from public.staff_memberships where restaurant_id=tenant and role='owner')<=1 then raise exception 'Cannot remove the last owner'; end if;
 delete from public.staff_memberships where restaurant_id=tenant and user_id=member;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id) values(tenant,auth.uid(),'staff.remove',member);
end $$;
revoke all on function public.remove_staff(uuid,uuid) from public;
grant execute on function public.remove_staff(uuid,uuid) to authenticated;
