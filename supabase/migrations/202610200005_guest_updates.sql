-- Broadcasts carry no order data. The random tracking capability is hashed into
-- the topic; clients always re-read status via the token-protected RPC.
create function public.notify_guest_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send(jsonb_build_object('changed',true),'order_changed','guest:'||new.tracking_token_hash,false);
 return new;
end $$;
revoke all on function public.notify_guest_order() from public;
create trigger guest_order_update after update on public.orders for each row execute function public.notify_guest_order();

do $$ declare t text;begin
 foreach t in array array['order_items','order_item_options','order_status_events'] loop
  execute format('drop policy staff_read on public.%I',t);
 end loop;
end $$;
create policy operational_items on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy operational_options on public.order_item_options for select to authenticated using(exists(select 1 from public.order_items i where i.id=order_item_id));
create policy operational_events on public.order_status_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
