\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
insert into auth.users(id,email) select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'test-'||n||'@example.test' from generate_series(1,5)n;
insert into public.staff_memberships(restaurant_id,user_id,role) select '10000000-0000-4000-8000-000000000001',('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,role::public.staff_role from (values(1,'owner'),(2,'manager'),(3,'cashier'),(4,'kitchen'),(5,'waiter')) x(n,role);
update public.restaurant_hours set opens='00:00',closes='23:59:59';
select pg_temp.assert_true((select count(*)=17 from pg_tables where schemaname='public' and rowsecurity),'RLS enabled on all business and rate-limit tables');
set local role anon;
select pg_temp.assert_true((select count(*)=6 from public.menu_items),'anonymous menu reads work');
select pg_temp.assert_true(not has_table_privilege(current_user,'public.orders','SELECT'),'guest cannot read order rows');
select pg_temp.assert_true(not has_function_privilege(current_user,'public.place_order(jsonb,text,text)','EXECUTE'),'guest cannot bypass server checkout');
reset role;

create temp table test_state(k text primary key,v text);
create function pg_temp.payload() returns jsonb language sql as $$select jsonb_build_object('restaurant_id','10000000-0000-4000-8000-000000000001','idempotency_key',gen_random_uuid(),'customer_name','Test guest','phone','+2201234567','email','','instructions','','service_type','takeaway','timing','now','payment_method','cash','reference','','items',jsonb_build_array(jsonb_build_object('id','30000000-0000-4000-8000-000000000001','quantity',2,'options','[]'::jsonb)))$$;
insert into test_state values('token',repeat('a',64)),('payload',pg_temp.payload()::text);
insert into test_state select 'order',(public.place_order((select v::jsonb from test_state where k='payload'),repeat('a',64),repeat('b',64))->>'id');
select pg_temp.assert_true((select total=500 from public.orders where id=(select v::uuid from test_state where k='order')),'checkout calculates database prices');
select pg_temp.assert_true((select count(*)=1 and min(unit_price)=250 from public.order_items where order_id=(select v::uuid from test_state where k='order')),'checkout snapshots items atomically');
select pg_temp.assert_true(public.place_order((select v::jsonb from test_state where k='payload'),repeat('a',64),repeat('b',64))->>'id'=(select v from test_state where k='order'),'idempotent retries return same order');
do $$begin
 begin perform public.place_order((select v::jsonb||'{"phone":"changed"}'::jsonb from test_state where k='payload'),repeat('a',64),repeat('b',64));raise exception 'FAIL: changed idempotency payload accepted';exception when raise_exception then if sqlerrm not like '%Idempotency key%' then raise;end if;end;
 raise notice 'PASS: changed idempotency payload rejected';
 begin perform public.place_order(pg_temp.payload()||jsonb_build_object('timing','scheduled','requested_at',now()+interval '1 day'),repeat('c',64),repeat('d',64));raise exception 'FAIL: cash preorder accepted';exception when raise_exception then if sqlerrm not like '%advance mobile-money%' then raise;end if;end;
 raise notice 'PASS: cash preorders rejected';
end$$;
select pg_temp.assert_true(public.track_order(repeat('a',64))->>'total'='500.00','tracking capability returns correct order');
select pg_temp.assert_true(public.track_order(repeat('f',64)) is null,'unknown tracking token returns nothing');
select pg_temp.assert_true(not (public.track_order(repeat('a',64))?'phone'),'tracking response omits phone');

insert into test_state select 'preorder',(public.place_order(pg_temp.payload()||jsonb_build_object('timing','scheduled','requested_at',now()+interval '1 day','payment_method','wave','reference','INTEGRATION-REF'),repeat('c',64),repeat('e',64))->>'id');
select pg_temp.assert_true((select payment_status='pending_verification' from public.orders where id=(select v::uuid from test_state where k='preorder')),'customer reference never verifies payment');
do $$begin
 begin perform public.place_order(pg_temp.payload()||jsonb_build_object('payment_method','wave','reference',' integration-ref '),repeat('d',64),repeat('f',64));raise exception 'FAIL: duplicate payment reference accepted';exception when unique_violation then null;end;
 raise notice 'PASS: duplicate payment reference rejected';
end$$;
grant select on test_state to authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$begin
 begin perform public.change_order((select v::uuid from test_state where k='preorder'),'accepted');raise exception 'FAIL: unpaid preorder accepted';exception when raise_exception then if sqlerrm not like '%Verify advance payment%' then raise;end if;end;
 raise notice 'PASS: unpaid preorders cannot enter kitchen schedule';
end$$;
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.orders where id=(select v::uuid from test_state where k='preorder')),'kitchen cannot read unverified preorders');
select pg_temp.assert_true(not has_table_privilege(current_user,'public.payments','UPDATE'),'no direct payment writes');
do $$begin
 begin perform public.review_payment((select v::uuid from test_state where k='preorder'),'verified','');raise exception 'FAIL: kitchen verified payment';exception when raise_exception then if sqlerrm not like '%Not authorized%' then raise;end if;end;
 raise notice 'PASS: kitchen cannot verify payments';
 update public.menu_items set price=1 where id='30000000-0000-4000-8000-000000000001';
end$$;
reset role;
select pg_temp.assert_true((select price=250 from public.menu_items where id='30000000-0000-4000-8000-000000000001'),'kitchen cannot change prices');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_payment((select v::uuid from test_state where k='preorder'),'verified','');
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.change_order((select v::uuid from test_state where k='preorder'),'accepted');
reset role;
select pg_temp.assert_true((select status='accepted' and payment_status='verified' from public.orders where id=(select v::uuid from test_state where k='preorder')),'verified preorder may be accepted');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$begin
 begin perform public.change_order((select v::uuid from test_state where k='preorder'),'preparing');raise exception 'FAIL: future preorder preparation started';exception when raise_exception then if sqlerrm not like '%not due%' then raise;end if;end;
 raise notice 'PASS: future preorders cannot prepare early';
end$$;
reset role;

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.change_order((select v::uuid from test_state where k='order'),'accepted');
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select public.change_order((select v::uuid from test_state where k='order'),'preparing');
select public.change_order((select v::uuid from test_state where k='order'),'ready');
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000005',true);
set local role authenticated;
do $$begin
 begin perform public.change_order((select v::uuid from test_state where k='order'),'completed');raise exception 'FAIL: unpaid order completed';exception when raise_exception then if sqlerrm not like '%Record payment%' then raise;end if;end;
 raise notice 'PASS: cash receipt required before completion';
end$$;
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select public.review_payment((select v::uuid from test_state where k='order'),'verified','');
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select public.change_order((select v::uuid from test_state where k='order'),'completed');
reset role;
select pg_temp.assert_true((select status='completed' from public.orders where id=(select v::uuid from test_state where k='order')),'accepted-to-completed order lifecycle works');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select public.review_payment((select v::uuid from test_state where k='order'),'refunded','Refund performed externally after service');
select pg_temp.assert_true((select payment_status='refunded' from public.orders where id=(select v::uuid from test_state where k='order')),'completed service can record an external refund');
select pg_temp.assert_true((select verified_by='90000000-0000-4000-8000-000000000003'::uuid from public.payments where order_id=(select v::uuid from test_state where k='order')),'refund preserves original payment verifier');

insert into test_state select 'late-order',(public.place_order(pg_temp.payload()||jsonb_build_object('payment_method','wave','reference','LATE-REF'),repeat('4',64),repeat('6',64))->>'id');
update public.orders set payment_deadline=now()-interval '1 minute' where id=(select v::uuid from test_state where k='late-order');
do $$begin
 begin perform public.review_payment((select v::uuid from test_state where k='late-order'),'verified','');raise exception 'FAIL: late payment silently verified';exception when raise_exception then if sqlerrm not like '%deadline expired%' then raise;end if;end;
 raise notice 'PASS: late payment requires explicit reconciliation';
end$$;
select public.review_payment((select v::uuid from test_state where k='late-order'),'refunded','Late receipt refunded externally');
select pg_temp.assert_true((select payment_status='refunded' from public.orders where id=(select v::uuid from test_state where k='late-order')),'late payment external refund recorded');

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$begin
 begin perform public.remove_staff('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001');raise exception 'FAIL: last owner removed';exception when raise_exception then if sqlerrm not like '%last owner%' then raise;end if;end;
 raise notice 'PASS: last owner cannot be removed';
end$$;
reset role;
insert into test_state select 'qr',public.issue_qr('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.resolve_qr((select v from test_state where k='qr'))->>'table_number'='01','issued QR resolves to correct table');
select public.revoke_qr((select id from public.qr_codes where token_hash=encode(extensions.digest((select v from test_state where k='qr'),'sha256'),'hex')));
select pg_temp.assert_true(public.resolve_qr((select v from test_state where k='qr')) is null,'revoked QR no longer resolves');
select pg_temp.assert_true((select count(*)>=5 from public.audit_logs where entity_id=(select v::uuid from test_state where k='order')),'sensitive order and payment changes are audited');
do $$declare n integer;begin for n in 1..20 loop perform pg_temp.assert_true(public.checkout_budget(repeat('9',64)),'budget allows attempt '||n);end loop;end$$;
select pg_temp.assert_true(not public.checkout_budget(repeat('9',64)),'rate limit blocks exhausted budget');
do $$declare before_count integer; p jsonb; begin
 select count(*) into before_count from public.orders;
 p:=pg_temp.payload()||jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id','30000000-0000-4000-8000-000000000001','quantity',1,'options',jsonb_build_array(gen_random_uuid()))));
 begin perform public.place_order(p,repeat('1',64),repeat('2',64));raise exception 'FAIL: invalid option accepted';exception when no_data_found then null;end;
 perform pg_temp.assert_true((select count(*)=before_count from public.orders),'invalid options roll back atomic checkout');
 p:=pg_temp.payload()||jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id','30000000-0000-4000-8000-000000000001','quantity',2,'options',jsonb_build_array('50000000-0000-4000-8000-000000000001'))));
 p:=public.place_order(p,repeat('1',64),repeat('3',64));
 perform pg_temp.assert_true((select total=580 from public.orders where id=(p->>'id')::uuid),'option prices are calculated and snapshotted');
end$$;
update public.restaurant_settings set slot_capacity=1 where restaurant_id='10000000-0000-4000-8000-000000000001';
do $$begin
 begin perform public.place_order(pg_temp.payload()||jsonb_build_object('timing','scheduled','requested_at',now()+interval '1 day','payment_method','wave','reference','CAPACITY-TEST'),repeat('2',64),repeat('4',64));raise exception 'FAIL: full slot accepted';exception when raise_exception then if sqlerrm not like '%slot is full%' then raise;end if;end;
 raise notice 'PASS: capacity limits reject full service slots';
end$$;
delete from public.restaurant_hours;
do $$begin
 begin perform public.place_order(pg_temp.payload(),repeat('3',64),repeat('5',64));raise exception 'FAIL: closed hours accepted';exception when raise_exception then if sqlerrm not like '%outside opening hours%' then raise;end if;end;
 raise notice 'PASS: closed restaurant rejects checkout';
end$$;
insert into public.restaurants(id,slug,name) values('10000000-0000-4000-8000-000000000002','other-tenant','Other tenant');
insert into public.restaurant_settings(restaurant_id) values('10000000-0000-4000-8000-000000000002');
set local role authenticated;
update public.restaurant_settings set slot_capacity=1 where restaurant_id='10000000-0000-4000-8000-000000000002';
reset role;
select pg_temp.assert_true((select slot_capacity=20 from public.restaurant_settings where restaurant_id='10000000-0000-4000-8000-000000000002'),'staff cannot alter another restaurant');
rollback;
