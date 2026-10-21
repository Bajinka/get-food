insert into public.restaurants(id,slug,name,description,address,phone)
values('10000000-0000-4000-8000-000000000001','get-food-demo','GET-FOOD Demo Restaurant','Fresh Gambian favourites. Scan. Order. Enjoy.','The Gambia — fictional demonstration restaurant','') on conflict do nothing;
insert into public.restaurant_settings(restaurant_id,wave_instructions,afrimoney_instructions)
values('10000000-0000-4000-8000-000000000001','Not configured. Contact restaurant staff before sending any money.','Not configured. Contact restaurant staff before sending any money.') on conflict do nothing;
insert into public.restaurant_hours(restaurant_id,weekday,opens,closes)
select '10000000-0000-4000-8000-000000000001',d,'09:00','22:00' from generate_series(0,6) d on conflict do nothing;
insert into public.menu_categories(id,restaurant_id,name) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Gambian favourites') on conflict do nothing;
insert into public.menu_items(id,restaurant_id,category_id,name,description,price)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',name,description,price
from (values(1,'Benachin','Fragrant one-pot rice with vegetables and seasoned fish.',250),(2,'Domoda','Rich groundnut stew served with steamed rice.',275),(3,'Chicken Yassa','Grilled chicken in a bright onion and lemon sauce.',300),(4,'Grilled Fish','Freshly grilled fish with vegetables and rice.',350),(5,'Maffe','Slow-cooked peanut stew with tender beef.',280),(6,'Fried Rice','Colourful rice with vegetables and warm spices.',200)) as dishes(n,name,description,price) on conflict do nothing;
insert into public.menu_option_groups(id,restaurant_id,menu_item_id,name,max_choices)
select ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Extras',2 from generate_series(1,6)n on conflict do nothing;
insert into public.menu_options(id,restaurant_id,group_id,name,price)
select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Extra vegetables',40 from generate_series(1,6)n on conflict do nothing;
insert into public.dining_tables(id,restaurant_id,number)
select ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',lpad(n::text,2,'0') from generate_series(1,10)n on conflict do nothing;
-- Public demo tokens are intentionally inactive. Staff must issue new random QR tokens.
insert into public.qr_codes(restaurant_id,table_id,token_hash,active)
select '10000000-0000-4000-8000-000000000001',id,encode(extensions.digest('demo-table-'||number,'sha256'),'hex'),false from public.dining_tables on conflict do nothing;
insert into public.qr_codes(restaurant_id,token_hash,active) values('10000000-0000-4000-8000-000000000001',encode(extensions.digest('demo-general','sha256'),'hex'),false) on conflict do nothing;

-- Fictional orders contain no real customer details or usable tracking tokens.
insert into public.orders(id,restaurant_id,idempotency_key,request_hash,tracking_token_hash,customer_name,phone,service_type,timing,status,payment_status,payment_method,requested_at,total)
select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'demo-seed',encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex'),'Fictional demo guest','000000000','takeaway','now',state::public.order_state,case when n in (2,3,4,5) then 'verified'::public.payment_state else 'unpaid'::public.payment_state end,'cash',now()+interval '30 minutes',250
from (values(1,'pending'),(2,'accepted'),(3,'preparing'),(4,'ready'),(5,'completed'),(6,'rejected'),(7,'cancelled')) as samples(n,state) on conflict do nothing;
insert into public.order_items(restaurant_id,order_id,menu_item_id,name,quantity,unit_price)
select restaurant_id,id,'30000000-0000-4000-8000-000000000001','Benachin',1,250 from public.orders o where request_hash='demo-seed' and not exists(select 1 from public.order_items i where i.order_id=o.id);
insert into public.payments(restaurant_id,order_id,method,amount,status)
select restaurant_id,id,'cash',total,payment_status from public.orders where request_hash='demo-seed' on conflict do nothing;
insert into public.order_status_events(restaurant_id,order_id,status)
select restaurant_id,id,status from public.orders o where request_hash='demo-seed' and not exists(select 1 from public.order_status_events e where e.order_id=o.id);
