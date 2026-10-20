# GET-FOOD

Mobile-first restaurant ordering demo for GET-FOOD Demo Restaurant in The Gambia.
Built with Next.js 15, TypeScript, and Supabase.

## Current status

The public customer ordering experience is still a browser-only prototype: carts,
checkout, payments, and tracking are not persisted or verified by a backend. Phase 1
now adds Supabase SSR clients, staff sign-in/session protection, the database
foundation, demo seed data, and a local-only reset command. Do not accept real orders
or payments with this demo.

## Requirements

- Node.js 20.9+
- npm
- A Supabase project for hosted development, or the Supabase CLI and Docker for local development

## Run the Next.js app on Windows

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
before using staff sign-in. The anon key is intended for browser use; never put a
service-role key in a `NEXT_PUBLIC_` variable.

## Local Supabase

Start the local Supabase stack and apply migrations/seed data:

```powershell
supabase start
supabase db reset
```

The reset command rebuilds the **local** Supabase database, including the demo
restaurant, six dishes, options, ten tables, QR token hashes, and sample orders and
payments. To repeat this explicitly through the guarded helper:

```powershell
$env:ALLOW_DEMO_RESET = 'true'
.\scripts\reset-demo.ps1
```

The helper calls `supabase db reset --local` only and refuses to run when
`NODE_ENV=production`. Never use its sample QR or tracking tokens in a live deployment.

For a hosted Supabase project, apply `supabase/migrations/0001_initial.sql` followed
by `supabase/migrations/0002_application_foundation.sql` using the Supabase SQL
editor, then run `supabase/seed.sql` only in a dedicated development project.

## Staff sign-in

Create a staff account through Supabase Authentication, then assign that account to
the demo restaurant by adding its Auth user ID to `public.staff_memberships` with an
appropriate role. For example, replace the UUID with the new Auth user's ID:

```sql
insert into public.staff_memberships (restaurant_id, user_id, role)
select id, '00000000-0000-4000-8000-000000000000'::uuid, 'owner'
from public.restaurants
where slug = 'get-food-demo';
```

Staff routes require a valid Supabase session, and database reads and writes remain
subject to Row Level Security. The restaurant dashboard currently confirms staff
identity and role; the operational dashboard modules are not yet implemented.

## Build

```powershell
npm.cmd run build
```

## Demo QR URLs

- General QR simulation: `http://localhost:3000/?qr=general`
- Table 05 simulation: `http://localhost:3000/?qr=table&table=05`

These query strings are prototype entry modes, not signed/revocable production QR
links. Database QR records contain hashed demo tokens; secure QR resolution will be
implemented with the customer ordering backend.
