\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
insert into auth.users(id,email) values('91000000-0000-4000-8000-000000000001','preparation-owner@example.test'),('91000000-0000-4000-8000-000000000002','preparation-kitchen@example.test');
insert into public.staff_memberships(restaurant_id,user_id,role) values('10000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','owner'),('10000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','kitchen');
update public.restaurant_hours set opens='00:00',closes='23:59:59';
update public.menu_items set preparation_minutes=90 where id='30000000-0000-4000-8000-000000000001';
create temp table preparation_order(id uuid);
insert into preparation_order select (public.place_order(jsonb_build_object('restaurant_id','10000000-0000-4000-8000-000000000001','idempotency_key',gen_random_uuid(),'customer_name','Fictional preparation test','phone','000000000','service_type','takeaway','timing','scheduled','requested_at',now()+interval '2 hours','payment_method','wave','reference','PREPARATION-TEST','items',jsonb_build_array(jsonb_build_object('id','30000000-0000-4000-8000-000000000001','quantity',1,'options',jsonb_build_array()))),repeat('e',64),repeat('d',64))->>'id')::uuid;
select pg_temp.assert_true((select preparation_minutes=90 from public.orders where id=(select id from preparation_order)),'order snapshots the longest meal preparation time');
update public.menu_items set preparation_minutes=5 where id='30000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select preparation_minutes=90 from public.orders where id=(select id from preparation_order)),'later menu edits do not change preparation snapshots');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.review_payment((select id from preparation_order),'verified','Actual development test receipt');
select public.change_order((select id from preparation_order),'accepted');
do $$begin
 begin perform public.confirm_service_time((select id from preparation_order),now()+interval '80 minutes');raise exception 'FAIL: insufficient preparation time confirmed';exception when raise_exception then if sqlerrm not like '%Invalid service time%' then raise;end if;end;
 raise notice 'PASS: service-time changes honor retained preparation time';
end$$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform public.change_order((select id from preparation_order),'preparing');raise exception 'FAIL: future preparation started too early';exception when raise_exception then if sqlerrm not like '%not due%' then raise;end if;end;
 raise notice 'PASS: kitchen cannot start before the retained preparation window';
end$$;
-- Simulate arrival of the preparation window without changing the database clock.
update public.orders set confirmed_at=now()+interval '80 minutes' where id=(select id from preparation_order);
select public.change_order((select id from preparation_order),'preparing');
select pg_temp.assert_true((select status='preparing' from public.orders where id=(select id from preparation_order)),'kitchen starts a long-preparation meal before the shorter restaurant default window');
rollback;
