\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
create function pg_temp.slots(day_offset integer default 1) returns table(service_time timestamptz) language sql as $$
 select * from public.available_service_times('10000000-0000-4000-8000-000000000001',current_date+day_offset,array['30000000-0000-4000-8000-000000000001'::uuid]);
$$;
set local role anon;
select pg_temp.assert_true((select count(*)=26 from pg_temp.slots()),'public availability lists 26 half-hour slots for 09:00–22:00');
select pg_temp.assert_true((select min(service_time::time)='09:00'::time and max(service_time::time)='21:30'::time from pg_temp.slots()),'closing time is excluded from available service times');
select pg_temp.assert_true((select count(*)=0 from pg_temp.slots(-1)),'past dates have no service times');
select pg_temp.assert_true((select count(*)=0 from pg_temp.slots(31)),'dates beyond the booking horizon have no service times');
select pg_temp.assert_true((select count(*)=0 from public.available_service_times('10000000-0000-4000-8000-000000000001',current_date+1,array[]::uuid[])),'empty carts have no service times');
select pg_temp.assert_true((select count(*)=0 from public.available_service_times('10000000-0000-4000-8000-000000000001',current_date+1,array[gen_random_uuid()])),'unknown menu items have no service times');
reset role;
update public.restaurant_settings set slot_capacity=1 where restaurant_id='10000000-0000-4000-8000-000000000001';
create temp table availability_order(id uuid);
with placed as (
 insert into public.orders(restaurant_id,idempotency_key,request_hash,tracking_token_hash,customer_name,phone,service_type,timing,payment_method,payment_status,requested_at,payment_deadline,total)
 values('10000000-0000-4000-8000-000000000001',gen_random_uuid(),'availability-fixture',encode(extensions.gen_random_bytes(32),'hex'),'Fictional availability test','000000000','takeaway','scheduled','wave','pending_verification',(current_date+1+time '10:00') at time zone 'Africa/Banjul',now()+interval '10 minutes',250)
 returning id
) insert into availability_order select id from placed;
select pg_temp.assert_true(not exists(select 1 from pg_temp.slots() where service_time::time='10:00'),'full capacity removes a service slot');
update public.orders set payment_deadline=now()-interval '1 minute' where id=(select id from availability_order);
select pg_temp.assert_true(exists(select 1 from pg_temp.slots() where service_time::time='10:00'),'expired unverified claims release availability');
update public.orders set payment_status='verified' where id=(select id from availability_order);
select pg_temp.assert_true(not exists(select 1 from pg_temp.slots() where service_time::time='10:00'),'verified payments retain capacity after the payment deadline');
update public.orders set confirmed_at=(current_date+1+time '11:00') at time zone 'Africa/Banjul' where id=(select id from availability_order);
select pg_temp.assert_true(exists(select 1 from pg_temp.slots() where service_time::time='10:00') and not exists(select 1 from pg_temp.slots() where service_time::time='11:00'),'staff-confirmed times determine occupied capacity');
update public.orders set status='cancelled' where id=(select id from availability_order);
select pg_temp.assert_true(exists(select 1 from pg_temp.slots() where service_time::time='11:00'),'cancelled orders release availability');
update public.menu_items set available=false where id='30000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*)=0 from pg_temp.slots()),'unavailable dishes prevent scheduled checkout');
update public.menu_items set available=true,preparation_minutes=240 where id='30000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select min(service_time)>=now()+interval '240 minutes' from (select * from pg_temp.slots(0) union all select * from pg_temp.slots(1)) candidates),'availability honors the longest meal preparation time');
update public.restaurant_settings set cutoff_minutes=1440 where restaurant_id='10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select min(service_time)>=now()+interval '1440 minutes' from (select * from pg_temp.slots(1) union all select * from pg_temp.slots(2)) candidates),'availability honors the restaurant cut-off');
delete from public.restaurant_hours;
select pg_temp.assert_true((select count(*)=0 from pg_temp.slots()),'closed days offer no service times');
rollback;
