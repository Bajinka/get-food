insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-images','menu-images',true,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy menu_photo_read on storage.objects for select using(bucket_id='menu-images');
create policy menu_photo_insert on storage.objects for insert to authenticated with check(
 bucket_id='menu-images' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.has_role(((storage.foldername(name))[1])::uuid,array['owner','manager']::public.staff_role[])
);
create policy menu_photo_delete on storage.objects for delete to authenticated using(
 bucket_id='menu-images' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.has_role(((storage.foldername(name))[1])::uuid,array['owner','manager']::public.staff_role[])
);
create function public.audit_management() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; tenant uuid;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 tenant:=(row_data->>'restaurant_id')::uuid;
 insert into public.audit_logs(restaurant_id,actor_id,action,entity_id,details)
 values(tenant,auth.uid(),tg_table_name||'.'||lower(tg_op),coalesce((row_data->>'id')::uuid,tenant),jsonb_build_object('operation',tg_op));
 return coalesce(new,old);
end $$;
do $$ declare t text;begin
 foreach t in array array['menu_categories','menu_items','menu_option_groups','menu_options','restaurant_settings','restaurant_hours','dining_tables'] loop
 execute format('create trigger management_audit after insert or update or delete on public.%I for each row execute function public.audit_management()',t);
 end loop;
end $$;
revoke all on function public.audit_management() from public;
