-- Retain preparation requirements when menu/settings are changed later.
alter table public.orders add column preparation_minutes integer not null default 30
 check(preparation_minutes between 1 and 240);
update public.orders o set preparation_minutes=greatest(
 coalesce((select s.preparation_minutes from public.restaurant_settings s where s.restaurant_id=o.restaurant_id),30),
 coalesce((select max(m.preparation_minutes) from public.order_items i join public.menu_items m on m.id=i.menu_item_id where i.order_id=o.id),0)
);

create or replace function public.place_order(payload jsonb, tracking_token text, client_bucket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 tenant uuid := (payload->>'restaurant_id')::uuid; settings public.restaurant_settings;
 item jsonb; opt uuid; dish public.menu_items; choice public.menu_options;
 existing public.orders; oid uuid; iid uuid; amount numeric(12,2):=0; unit numeric(12,2);
 qty integer; service_time timestamptz; local_time timestamp; prep integer; request_digest text;
 attempts integer; selected uuid[]; grp record; table_ref uuid; qr public.qr_codes;
begin
 if length(payload::text)>25000 or length(tracking_token)<>64 or tracking_token !~ '^[0-9a-f]+$' then raise exception 'Invalid request'; end if;
 request_digest:=encode(extensions.digest(payload::text,'sha256'),'hex');
 -- Serializes duplicate keys before checking, ensuring retry-safe creation.
 perform pg_advisory_xact_lock(hashtextextended(payload->>'idempotency_key',0));
 select * into existing from public.orders where idempotency_key=(payload->>'idempotency_key')::uuid;
 if found then
  if existing.request_hash<>request_digest or existing.tracking_token_hash<>encode(extensions.digest(tracking_token,'sha256'),'hex') then raise exception 'Idempotency key already used'; end if;
  return jsonb_build_object('id',existing.id,'number',existing.number);
 end if;
 -- Bucket supplied only by trusted server; function execution is denied to public clients.
 insert into public.checkout_limits values(client_bucket,1,now()+interval '10 minutes')
 on conflict(bucket) do update set attempts=case when checkout_limits.expires_at<now() then 1 else checkout_limits.attempts+1 end,
 expires_at=case when checkout_limits.expires_at<now() then now()+interval '10 minutes' else checkout_limits.expires_at end
 returning checkout_limits.attempts into attempts;
 if attempts>10 then raise exception 'Too many orders. Please try again later.'; end if;
 -- Serialize tenant capacity checks and settings/menu writes within this transaction.
 perform 1 from public.restaurants where id=tenant and active for update;
 if not found then raise exception 'Restaurant unavailable'; end if;
 select * into strict settings from public.restaurant_settings where restaurant_id=tenant;
 if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items') not between 1 and 30 then raise exception 'Cart must contain 1 to 30 items'; end if;
 prep:=settings.preparation_minutes;
 for item in select * from jsonb_array_elements(payload->'items') loop
  select * into strict dish from public.menu_items where id=(item->>'id')::uuid and restaurant_id=tenant and available for share;
  prep:=greatest(prep,dish.preparation_minutes);
 end loop;
 if payload->>'timing'='scheduled' then
  service_time:=(payload->>'requested_at')::timestamptz;
  if service_time < now()+make_interval(mins=>greatest(prep,settings.cutoff_minutes)) or service_time>now()+interval '30 days' then raise exception 'Choose a time after the preparation/cut-off period and within 30 days'; end if;
  if payload->>'payment_method'='cash' then raise exception 'Pre-orders require advance mobile-money payment'; end if;
 else service_time:=now()+make_interval(mins=>prep);
 end if;
 select service_time at time zone timezone into local_time from public.restaurants where id=tenant;
 if not exists(select 1 from public.restaurant_hours where restaurant_id=tenant and weekday=extract(dow from local_time)::integer and local_time::time>=opens and local_time::time<closes) then raise exception 'Requested service time is outside opening hours'; end if;
 if (select count(*) from public.orders where restaurant_id=tenant and status not in ('cancelled','rejected','completed') and not (status='pending' and payment_method<>'cash' and payment_status<>'verified' and payment_deadline<now()) and coalesce(confirmed_at,requested_at)>=date_bin('30 minutes',service_time,'2000-01-01'::timestamptz) and coalesce(confirmed_at,requested_at)<date_bin('30 minutes',service_time,'2000-01-01'::timestamptz)+interval '30 minutes')>=settings.slot_capacity then raise exception 'This service slot is full'; end if;
 if nullif(payload->>'qr_token','') is not null then
  select * into strict qr from public.qr_codes where restaurant_id=tenant and active and token_hash=encode(extensions.digest(payload->>'qr_token','sha256'),'hex');
  if payload->>'service_type'='dine_in' then table_ref:=qr.table_id; end if;
  if table_ref is not null and not exists(select 1 from public.dining_tables where id=table_ref and active) then raise exception 'Table unavailable'; end if;
 end if;
 if payload->>'payment_method' in ('wave','afrimoney') and length(btrim(coalesce(payload->>'reference','')))<4 then raise exception 'Enter your payment transaction reference'; end if;
 insert into public.orders(restaurant_id,idempotency_key,request_hash,tracking_token_hash,customer_name,phone,email,instructions,service_type,timing,table_id,payment_method,requested_at,payment_deadline,payment_status,total,preparation_minutes)
 values(tenant,(payload->>'idempotency_key')::uuid,request_digest,encode(extensions.digest(tracking_token,'sha256'),'hex'),btrim(payload->>'customer_name'),btrim(payload->>'phone'),nullif(payload->>'email',''),coalesce(payload->>'instructions',''),payload->>'service_type',payload->>'timing',table_ref,payload->>'payment_method',service_time,case when payload->>'payment_method'<>'cash' then case when payload->>'timing'='scheduled' then least(now()+make_interval(mins=>settings.payment_deadline_minutes),service_time-make_interval(mins=>prep)) else now()+make_interval(mins=>settings.payment_deadline_minutes) end end,case when payload->>'payment_method'='cash' then 'unpaid'::public.payment_state else 'pending_verification'::public.payment_state end,0,prep) returning id into oid;
 for item in select * from jsonb_array_elements(payload->'items') loop
  select * into strict dish from public.menu_items where id=(item->>'id')::uuid and restaurant_id=tenant and available;
  qty:=(item->>'quantity')::integer;
  if qty not between 1 and 50 then raise exception 'Invalid quantity'; end if;
  selected:=array(select value::uuid from jsonb_array_elements_text(coalesce(item->'options','[]')));
  if cardinality(selected)<>(select count(distinct x) from unnest(selected)x) then raise exception 'Duplicate options'; end if;
  unit:=dish.price;
  for grp in select g.*, (select count(*) from public.menu_options o where o.group_id=g.id and o.id=any(selected)) as picked from public.menu_option_groups g where g.menu_item_id=dish.id for share of g loop
   if grp.picked<grp.min_choices or grp.picked>grp.max_choices then raise exception 'Invalid choices for %',grp.name; end if;
  end loop;
  foreach opt in array selected loop
   select o.* into strict choice from public.menu_options o join public.menu_option_groups g on g.id=o.group_id where o.id=opt and o.restaurant_id=tenant and g.menu_item_id=dish.id and o.available for share of o,g;
   unit:=unit+choice.price;
  end loop;
  insert into public.order_items(restaurant_id,order_id,menu_item_id,name,quantity,unit_price,instructions) values(tenant,oid,dish.id,dish.name,qty,unit,left(coalesce(item->>'instructions',''),500)) returning id into iid;
  insert into public.order_item_options(restaurant_id,order_item_id,option_id,name,price) select tenant,iid,id,name,price from public.menu_options where id=any(selected);
  amount:=amount+unit*qty;
 end loop;
 update public.orders set total=amount where id=oid;
 insert into public.payments(restaurant_id,order_id,method,amount,reference,status) values(tenant,oid,payload->>'payment_method',amount,case when payload->>'payment_method'='cash' then null else upper(btrim(payload->>'reference')) end,case when payload->>'payment_method'='cash' then 'unpaid'::public.payment_state else 'pending_verification'::public.payment_state end);
 insert into public.order_status_events(restaurant_id,order_id,status) values(tenant,oid,'pending');
 return (select jsonb_build_object('id',id,'number',number) from public.orders where id=oid);
end $$;

create or replace function public.change_order(order_ref uuid, next_status public.order_state) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; permitted public.staff_role[];
begin
 select * into strict o from public.orders where id=order_ref for update;
 permitted:=case when next_status in ('preparing','ready') then array['owner','manager','kitchen']::public.staff_role[] when next_status='completed' then array['owner','manager','waiter']::public.staff_role[] else array['owner','manager']::public.staff_role[] end;
 if not public.has_role(o.restaurant_id,permitted) then raise exception 'Not authorized'; end if;
 if not ((o.status='pending' and next_status in ('accepted','rejected','cancelled')) or (o.status='accepted' and next_status in ('preparing','cancelled')) or (o.status='preparing' and next_status='ready') or (o.status='ready' and next_status='completed')) then raise exception 'Invalid order transition'; end if;
 if next_status in ('accepted','preparing') and o.payment_status in ('rejected','refunded') then raise exception 'Payment rejected or refunded; cancel this order'; end if;
 if next_status in ('accepted','preparing') and o.timing='scheduled' and o.payment_status<>'verified' then raise exception 'Verify advance payment first'; end if;
 if next_status='preparing' and o.timing='scheduled' and coalesce(o.confirmed_at,o.requested_at)>now()+make_interval(mins=>o.preparation_minutes) then raise exception 'Pre-order is not due for preparation yet'; end if;
 if next_status='completed' and o.payment_status<>'verified' then raise exception 'Record payment before completing service'; end if;
 update public.orders set status=next_status,confirmed_at=case when next_status='accepted' then coalesce(confirmed_at,requested_at) else confirmed_at end where id=order_ref;
 insert into public.order_status_events(restaurant_id,order_id,status,actor_id) values(o.restaurant_id,o.id,next_status,auth.uid());
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id,details) values(o.restaurant_id,auth.uid(),'order.status',o.id,jsonb_build_object('from',o.status,'to',next_status));
end $$;

create or replace function public.confirm_service_time(order_ref uuid, service_time timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; local_time timestamp; s public.restaurant_settings;
begin
 select * into strict o from public.orders where id=order_ref for update;
 if not public.has_role(o.restaurant_id,array['owner','manager']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if o.status not in ('pending','accepted') then raise exception 'Service time can no longer be changed'; end if;
 perform 1 from public.restaurants where id=o.restaurant_id for update;
 select * into strict s from public.restaurant_settings where restaurant_id=o.restaurant_id;
 if service_time<now()+make_interval(mins=>greatest(s.preparation_minutes,o.preparation_minutes)) or service_time>now()+interval '30 days' then raise exception 'Invalid service time'; end if;
 select service_time at time zone timezone into local_time from public.restaurants where id=o.restaurant_id;
 if not exists(select 1 from public.restaurant_hours where restaurant_id=o.restaurant_id and weekday=extract(dow from local_time)::integer and local_time::time>=opens and local_time::time<closes) then raise exception 'Restaurant closed at that time'; end if;
 if (select count(*) from public.orders where restaurant_id=o.restaurant_id and id<>o.id and status not in ('cancelled','rejected','completed') and not (status='pending' and payment_method<>'cash' and payment_status<>'verified' and payment_deadline<now()) and coalesce(confirmed_at,requested_at)>=date_bin('30 minutes',service_time,'2000-01-01'::timestamptz) and coalesce(confirmed_at,requested_at)<date_bin('30 minutes',service_time,'2000-01-01'::timestamptz)+interval '30 minutes')>=s.slot_capacity then raise exception 'Service slot is full'; end if;
 update public.orders set confirmed_at=service_time where id=o.id;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id,details) values(o.restaurant_id,auth.uid(),'order.service_time',o.id,jsonb_build_object('confirmed_at',service_time));
end $$;
