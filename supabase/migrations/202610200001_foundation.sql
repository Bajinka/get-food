-- Tenant-scoped foundation. Customer writes must use validated server operations.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create type public.staff_role as enum ('owner','manager','cashier','kitchen','waiter');
create type public.order_state as enum ('pending','accepted','preparing','ready','completed','rejected','cancelled');
create type public.payment_state as enum ('unpaid','pending_verification','verified','rejected','refunded');

create table public.restaurants (
 id uuid primary key default gen_random_uuid(), slug text not null unique,
 name text not null, description text not null default '', phone text not null default '',
 address text not null default '', currency text not null default 'GMD' check(currency ~ '^[A-Z]{3}$'),
 timezone text not null default 'Africa/Banjul', active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.restaurant_settings (
 restaurant_id uuid primary key references public.restaurants on delete cascade,
 preparation_minutes integer not null default 30 check(preparation_minutes between 5 and 240),
 cutoff_minutes integer not null default 60 check(cutoff_minutes between 15 and 1440),
 slot_capacity integer not null default 20 check(slot_capacity between 1 and 500),
 payment_deadline_minutes integer not null default 30 check(payment_deadline_minutes between 5 and 1440),
 wave_instructions text not null default '', afrimoney_instructions text not null default '',
 cancellation_policy text not null default 'Contact the restaurant to request cancellation. Refunds require staff review.',
 updated_at timestamptz not null default now()
);
create table public.restaurant_hours (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade,
 weekday integer not null check(weekday between 0 and 6), opens time not null, closes time not null,
 check(opens < closes), unique(restaurant_id,weekday)
);
create table public.staff_memberships (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade,
 user_id uuid not null references auth.users on delete cascade, role public.staff_role not null,
 created_at timestamptz not null default now(), unique(restaurant_id,user_id)
);
create table public.menu_categories (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade,
 name text not null check(length(name) between 1 and 100), position integer not null default 0,
 unique(id,restaurant_id)
);
create table public.menu_items (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade,
 category_id uuid not null, name text not null check(length(name) between 1 and 100), description text not null default '',
 price numeric(12,2) not null check(price >= 0), image_url text,
 available boolean not null default true, preparation_minutes integer not null default 30 check(preparation_minutes between 1 and 240),
 created_at timestamptz not null default now(), unique(id,restaurant_id),
 foreign key(category_id,restaurant_id) references public.menu_categories(id,restaurant_id)
);
create table public.menu_option_groups (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade,
 menu_item_id uuid not null, name text not null, min_choices integer not null default 0 check(min_choices>=0),
 max_choices integer not null default 1 check(max_choices>=1), check(min_choices<=max_choices),
 unique(id,restaurant_id), foreign key(menu_item_id,restaurant_id) references public.menu_items(id,restaurant_id) on delete cascade
);
create table public.menu_options (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade,
 group_id uuid not null, name text not null, price numeric(12,2) not null default 0 check(price>=0),
 available boolean not null default true, unique(id,restaurant_id),
 foreign key(group_id,restaurant_id) references public.menu_option_groups(id,restaurant_id) on delete cascade
);
create table public.dining_tables (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade,
 number text not null, active boolean not null default true, unique(restaurant_id,number), unique(id,restaurant_id)
);
create table public.qr_codes (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants on delete cascade,
 table_id uuid, token_hash text not null unique check(length(token_hash)=64),
 active boolean not null default true, created_at timestamptz not null default now(),
 foreign key(table_id,restaurant_id) references public.dining_tables(id,restaurant_id)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants,
 number bigint generated always as identity unique, idempotency_key uuid not null unique,
 request_hash text not null, tracking_token_hash text not null unique,
 customer_name text not null check(length(customer_name) between 1 and 100),
 phone text not null check(length(phone) between 7 and 30), email text,
 instructions text not null default '' check(length(instructions)<=1000),
 service_type text not null check(service_type in ('dine_in','takeaway')),
 timing text not null check(timing in ('now','scheduled')), table_id uuid,
 table_verified boolean not null default false,
 status public.order_state not null default 'pending',
 payment_status public.payment_state not null default 'unpaid',
 payment_method text not null check(payment_method in ('cash','wave','afrimoney')),
 requested_at timestamptz not null, confirmed_at timestamptz,
 payment_deadline timestamptz, total numeric(12,2) not null check(total>=0),
 created_at timestamptz not null default now(), unique(id,restaurant_id),
 check(timing <> 'scheduled' or payment_method <> 'cash'),
 check(timing <> 'scheduled' or status not in ('accepted','preparing','ready','completed') or payment_status='verified' or (status='completed' and payment_status='refunded')),
 check(service_type='dine_in' or table_id is null),
 foreign key(table_id,restaurant_id) references public.dining_tables(id,restaurant_id)
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null,
 order_id uuid not null, menu_item_id uuid not null, name text not null,
 quantity integer not null check(quantity between 1 and 50), unit_price numeric(12,2) not null check(unit_price>=0),
 instructions text not null default '', unique(id,restaurant_id),
 foreign key(order_id,restaurant_id) references public.orders(id,restaurant_id) on delete cascade,
 foreign key(menu_item_id,restaurant_id) references public.menu_items(id,restaurant_id)
);
create table public.order_item_options (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, order_item_id uuid not null,
 option_id uuid not null, name text not null, price numeric(12,2) not null check(price>=0),
 foreign key(order_item_id,restaurant_id) references public.order_items(id,restaurant_id) on delete cascade,
 foreign key(option_id,restaurant_id) references public.menu_options(id,restaurant_id)
);
create table public.order_status_events (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, order_id uuid not null,
 status public.order_state not null, actor_id uuid references auth.users, created_at timestamptz not null default now(),
 foreign key(order_id,restaurant_id) references public.orders(id,restaurant_id) on delete cascade
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, order_id uuid not null unique,
 method text not null check(method in ('cash','wave','afrimoney')), amount numeric(12,2) not null check(amount>=0),
 reference text check(reference is null or length(reference) between 4 and 100),
 status public.payment_state not null default 'unpaid', verified_by uuid references auth.users,
 verified_at timestamptz, rejection_reason text, created_at timestamptz not null default now(),
 foreign key(order_id,restaurant_id) references public.orders(id,restaurant_id)
);
create unique index payment_reference_unique on public.payments(restaurant_id,method,lower(btrim(reference))) where reference is not null;
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants,
 actor_id uuid references auth.users, action text not null, entity_id uuid,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);

create index membership_user on public.staff_memberships(user_id);
create index orders_queue on public.orders(restaurant_id,status,requested_at);
create index orders_created on public.orders(restaurant_id,created_at);
create index payments_queue on public.payments(restaurant_id,status);
create index order_items_order on public.order_items(order_id);
create index status_events_order on public.order_status_events(order_id,created_at);
create index audit_restaurant on public.audit_logs(restaurant_id,created_at);
create index menu_restaurant on public.menu_items(restaurant_id,available);

-- SECURITY DEFINER prevents recursive membership policies. No caller-supplied user ID.
create function public.has_role(tenant uuid, roles public.staff_role[]) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_memberships where restaurant_id=tenant and user_id=auth.uid() and role=any(roles));
$$;
revoke all on function public.has_role(uuid,public.staff_role[]) from public;
grant execute on function public.has_role(uuid,public.staff_role[]) to authenticated;

do $$ declare t text; begin
 foreach t in array array['restaurants','restaurant_settings','restaurant_hours','staff_memberships','menu_categories','menu_items','menu_option_groups','menu_options','dining_tables','qr_codes','orders','order_items','order_item_options','order_status_events','payments','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;

-- Public menu data is intentionally readable; guest PII and tokens are never public.
grant select on public.restaurants,public.restaurant_settings,public.restaurant_hours,public.menu_categories,public.menu_items,public.menu_option_groups,public.menu_options to anon,authenticated;
create policy public_restaurants on public.restaurants for select using(active or public.has_role(id,array['owner','manager','cashier','kitchen','waiter']::public.staff_role[]));
do $$ declare t text; begin
 foreach t in array array['restaurant_settings','restaurant_hours','menu_categories','menu_items','menu_option_groups','menu_options'] loop
  execute format('create policy public_menu on public.%I for select using(exists(select 1 from public.restaurants r where r.id=restaurant_id and r.active))',t);
 end loop;
end $$;
-- Anonymous menu policies may invoke has_role through restaurants.
grant execute on function public.has_role(uuid,public.staff_role[]) to anon;
grant select on public.staff_memberships,public.dining_tables,public.qr_codes,public.orders,public.order_items,public.order_item_options,public.order_status_events,public.payments,public.audit_logs to authenticated;
create policy own_membership on public.staff_memberships for select to authenticated using(user_id=auth.uid() or public.has_role(restaurant_id,array['owner']::public.staff_role[]));
do $$ declare t text; begin
 foreach t in array array['dining_tables','qr_codes','orders','order_items','order_item_options','order_status_events'] loop
  execute format('create policy staff_read on public.%I for select to authenticated using(public.has_role(restaurant_id,array[''owner'',''manager'',''cashier'',''kitchen'',''waiter'']::public.staff_role[]))',t);
 end loop;
end $$;
create policy payment_read on public.payments for select to authenticated using(public.has_role(restaurant_id,array['owner','manager','cashier']::public.staff_role[]));
create policy audit_read on public.audit_logs for select to authenticated using(public.has_role(restaurant_id,array['owner','manager']::public.staff_role[]));
-- Menu/settings edits are tenant-authorized in the database as well as the server.
do $$ declare t text; begin
 foreach t in array array['restaurant_settings','restaurant_hours','menu_categories','menu_items','menu_option_groups','menu_options','dining_tables'] loop
  execute format('grant insert,update,delete on public.%I to authenticated',t);
  execute format('create policy management_write on public.%I for all to authenticated using(public.has_role(restaurant_id,array[''owner'',''manager'']::public.staff_role[])) with check(public.has_role(restaurant_id,array[''owner'',''manager'']::public.staff_role[]))',t);
 end loop;
end $$;
-- Direct modifications of staff, orders, payments, QR tokens and audit records are denied.
-- Later workflow migrations expose narrow transactional functions instead.
