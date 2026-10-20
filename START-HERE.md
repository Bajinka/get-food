# GET-FOOD — development starter

## Implemented

- Next.js 15 customer-side restaurant UI prototype.
- Supabase server/browser SSR clients with environment validation.
- Staff sign-in and session refresh for protected `/restaurant/*` routes.
- A staff dashboard landing page that verifies a signed-in account's restaurant membership.
- Additive PostgreSQL migration for restaurant settings/hours, menu options, order option
  snapshots, audit logs, role helpers, RLS policies, and operational indexes.
- Development seed data and a guarded local Supabase database reset script.

## Important limitations

Customer checkout is still simulated in the browser and does not create persisted
orders. Wave/Afrimoney references are not verified; QR links are not yet secure or
revocable. Do not use this prototype for real payments or claim orders are live.
Operational staff, kitchen, payment verification, and reporting modules remain to be
implemented.

## Start on Windows in VS Code

```powershell
npm.cmd install
Copy-Item .env.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
npm.cmd run dev
```

For local Supabase, install the Supabase CLI and Docker, then run:

```powershell
supabase start
supabase db reset
```

The reset rebuilds only the local Supabase database and loads the sample restaurant,
menu, tables, and demonstration orders. The optional helper requires a second explicit
confirmation:

```powershell
$env:ALLOW_DEMO_RESET = 'true'
.\scripts\reset-demo.ps1
```

For a hosted development project, apply migrations in filename order and run
`supabase/seed.sql` only against a dedicated non-production project. Sample QR and
tracking token material is public demo material and must not be used live.

## Build and start

```powershell
npm.cmd run build
npm.cmd run start
```
