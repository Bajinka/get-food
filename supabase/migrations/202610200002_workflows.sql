create table public.checkout_limits(bucket text primary key, attempts integer not null, expires_at timestamptz not null);
alter table public.checkout_limits enable row level security;
revoke all on public.checkout_limits from anon,authenticated;

create function public.place_order(payload jsonb, tracking_token text, client_bucket text) returns jsonb
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
 insert into public.orders(restaurant_id,idempotency_key,request_hash,tracking_token_hash,customer_name,phone,email,instructions,service_type,timing,table_id,payment_method,requested_at,payment_deadline,payment_status,total)
 values(tenant,(payload->>'idempotency_key')::uuid,request_digest,encode(extensions.digest(tracking_token,'sha256'),'hex'),btrim(payload->>'customer_name'),btrim(payload->>'phone'),nullif(payload->>'email',''),coalesce(payload->>'instructions',''),payload->>'service_type',payload->>'timing',table_ref,payload->>'payment_method',service_time,case when payload->>'payment_method'<>'cash' then case when payload->>'timing'='scheduled' then least(now()+make_interval(mins=>settings.payment_deadline_minutes),service_time-make_interval(mins=>prep)) else now()+make_interval(mins=>settings.payment_deadline_minutes) end end,case when payload->>'payment_method'='cash' then 'unpaid'::public.payment_state else 'pending_verification'::public.payment_state end,0) returning id into oid;
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
revoke all on function public.place_order(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.place_order(jsonb,text,text) to service_role;

create function public.track_order(token text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('number',o.number,'status',o.status,'payment_status',o.payment_status,'payment_method',o.payment_method,'total',o.total,'requested_at',o.requested_at,'confirmed_at',o.confirmed_at,'payment_deadline',o.payment_deadline,'service_type',o.service_type,'timing',o.timing,'created_at',o.created_at,
 'items',(select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit_price',i.unit_price)) from public.order_items i where i.order_id=o.id),
 'events',(select jsonb_agg(jsonb_build_object('status',e.status,'created_at',e.created_at) order by e.created_at) from public.order_status_events e where e.order_id=o.id))
 from public.orders o where length(token)=64 and o.tracking_token_hash=encode(extensions.digest(token,'sha256'),'hex');
$$;
revoke all on function public.track_order(text) from public;
grant execute on function public.track_order(text) to anon,authenticated;

create function public.resolve_qr(token text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('restaurant_id',q.restaurant_id,'table_number',t.number) from public.qr_codes q left join public.dining_tables t on t.id=q.table_id join public.restaurants r on r.id=q.restaurant_id where q.token_hash=encode(extensions.digest(token,'sha256'),'hex') and q.active and r.active and (q.table_id is null or t.active);
$$;
revoke all on function public.resolve_qr(text) from public;
grant execute on function public.resolve_qr(text) to anon,authenticated;

create function public.change_order(order_ref uuid, next_status public.order_state) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; permitted public.staff_role[];
begin
 select * into strict o from public.orders where id=order_ref for update;
 permitted:=case when next_status in ('preparing','ready') then array['owner','manager','kitchen']::public.staff_role[] when next_status='completed' then array['owner','manager','waiter']::public.staff_role[] else array['owner','manager']::public.staff_role[] end;
 if not public.has_role(o.restaurant_id,permitted) then raise exception 'Not authorized'; end if;
 if not ((o.status='pending' and next_status in ('accepted','rejected','cancelled')) or (o.status='accepted' and next_status in ('preparing','cancelled')) or (o.status='preparing' and next_status='ready') or (o.status='ready' and next_status='completed')) then raise exception 'Invalid order transition'; end if;
 if next_status in ('accepted','preparing') and o.payment_status in ('rejected','refunded') then raise exception 'Payment rejected or refunded; cancel this order'; end if;
 if next_status in ('accepted','preparing') and o.timing='scheduled' and o.payment_status<>'verified' then raise exception 'Verify advance payment first'; end if;
 if next_status='preparing' and o.timing='scheduled' and coalesce(o.confirmed_at,o.requested_at)>now()+make_interval(mins=>(select preparation_minutes from public.restaurant_settings where restaurant_id=o.restaurant_id)) then raise exception 'Pre-order is not due for preparation yet'; end if;
 if next_status='completed' and o.payment_status<>'verified' then raise exception 'Record payment before completing service'; end if;
 update public.orders set status=next_status,confirmed_at=case when next_status='accepted' then coalesce(confirmed_at,requested_at) else confirmed_at end where id=order_ref;
 insert into public.order_status_events(restaurant_id,order_id,status,actor_id) values(o.restaurant_id,o.id,next_status,auth.uid());
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id,details) values(o.restaurant_id,auth.uid(),'order.status',o.id,jsonb_build_object('from',o.status,'to',next_status));
end $$;
revoke all on function public.change_order(uuid,public.order_state) from public;
grant execute on function public.change_order(uuid,public.order_state) to authenticated;

create function public.review_payment(order_ref uuid, decision public.payment_state, reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 select * into strict o from public.orders where id=order_ref for update;
 if not public.has_role(o.restaurant_id,array['owner','manager','cashier']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 if decision not in ('verified','rejected','refunded') then raise exception 'Invalid payment decision'; end if;
 if o.status in ('cancelled','rejected') and decision='verified' then raise exception 'Order cancelled; handle refund instead'; end if;
 if decision='verified' and o.payment_method<>'cash' and o.payment_deadline<now() then raise exception 'Payment deadline expired; contact customer and handle refund'; end if;
 if decision='refunded' and o.payment_status<>'verified' and not (o.payment_status='pending_verification' and o.payment_deadline<now() and length(btrim(reason))>=3) then raise exception 'Refund requires a verified payment or an expired payment claim with a documented external refund'; end if;
 if decision='rejected' and (length(btrim(reason))<3 or o.payment_status='verified') then raise exception 'Supply rejection reason; verified payments require refund'; end if;
 if decision<>'verified' and o.status not in ('pending','cancelled','rejected') and not (decision='refunded' and o.status='completed') then raise exception 'Cancel order before rejecting/refunding payment'; end if;
 update public.payments set status=decision,verified_by=case when decision='verified' then auth.uid() else verified_by end,verified_at=case when decision='verified' then now() else verified_at end,rejection_reason=left(reason,500) where order_id=o.id;
 update public.orders set payment_status=decision where id=o.id;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id,details) values(o.restaurant_id,auth.uid(),'payment.'||decision,o.id,jsonb_build_object('reason',left(reason,500)));
end $$;
revoke all on function public.review_payment(uuid,public.payment_state,text) from public;
grant execute on function public.review_payment(uuid,public.payment_state,text) to authenticated;

create function public.issue_qr(tenant uuid, table_ref uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); qid uuid;
begin
 if not public.has_role(tenant,array['owner','manager']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 insert into public.qr_codes(restaurant_id,table_id,token_hash) values(tenant,table_ref,encode(extensions.digest(token,'sha256'),'hex')) returning id into qid;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id) values(tenant,auth.uid(),'qr.issue',qid);
 return token;
end $$;
create function public.revoke_qr(qr_ref uuid) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
 select restaurant_id into strict tenant from public.qr_codes where id=qr_ref;
 if not public.has_role(tenant,array['owner','manager']::public.staff_role[]) then raise exception 'Not authorized'; end if;
 update public.qr_codes set active=false where id=qr_ref;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id) values(tenant,auth.uid(),'qr.revoke',qr_ref);
end $$;
revoke all on function public.issue_qr(uuid,uuid),public.revoke_qr(uuid) from public;
grant execute on function public.issue_qr(uuid,uuid),public.revoke_qr(uuid) to authenticated;

create function public.set_staff(tenant uuid, member uuid, assigned_role public.staff_role) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,0));
 if not public.has_role(tenant,array['owner']::public.staff_role[]) then raise exception 'Only owners can assign staff'; end if;
 if exists(select 1 from public.staff_memberships where restaurant_id=tenant and user_id=member and role='owner') and assigned_role<>'owner' and (select count(*) from public.staff_memberships where restaurant_id=tenant and role='owner')<=1 then raise exception 'Cannot remove the last owner'; end if;
 insert into public.staff_memberships(restaurant_id,user_id,role) values(tenant,member,assigned_role) on conflict(restaurant_id,user_id) do update set role=excluded.role;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id,details) values(tenant,auth.uid(),'staff.assign',member,jsonb_build_object('role',assigned_role));
end $$;
revoke all on function public.set_staff(uuid,uuid,public.staff_role) from public;
grant execute on function public.set_staff(uuid,uuid,public.staff_role) to authenticated;

-- Only authorized staff can subscribe to row changes. Guest tracking uses token-protected reads.
alter publication supabase_realtime add table public.orders;
