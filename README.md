# GET-FOOD

**Scan. Order. Enjoy.** Developed by **GET-PC TECHNICAL SOLUTION**.

Next.js App Router, TypeScript, Tailwind CSS and Supabase PostgreSQL, Authentication, Realtime and Storage. The fictional GET-FOOD Demo Restaurant uses Gambian dalasi (GMD) and Africa/Banjul. Tenant IDs, composite foreign keys and RLS prepare the database for additional restaurants; the current UI explicitly selects the demo restaurant.

The original repository contained only manifests and documentation. This implementation adds customer browsing/customization, a persistent cart, atomic server-validated checkout, private guest tracking, revocable QR codes, staff authentication, and restaurant management. See [VALIDATION.md](VALIDATION.md) before interpreting features as production ready.

## Install and run

Requires Node.js 22 or 24, npm, and a dedicated development Supabase project (or Docker plus the pinned Supabase CLI for the normal local stack). In Windows PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Edit .env.local with your development project configuration.
npm.cmd run dev
```

On Linux/macOS use `npm` and `cp` instead of `npm.cmd` and `Copy-Item`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key, subject to RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only**, for trusted checkout RPCs. Never prefix with NEXT_PUBLIC_. |

Never commit credentials or `.env.local`. The service key is never sent to the browser. Without configuration the application builds and shows unavailable states; checkout is disabled.

## Hosted development database

In a new **development** Supabase project's SQL editor, apply `supabase/migrations/*.sql` in filename order. Then run `supabase/seed.sql` in that development project only. Forward migrations must not be repeatedly pasted into an already-migrated database. The seed is repeatable: one restaurant, six dishes, customization options, ten tables, eleven inactive demo QR codes, and fictional sample orders/payments. Public demo QR tokens are intentionally inactive: issue new random tokens from the table dashboard.

Create the first staff account in Supabase Authentication, then bootstrap its owner membership as a database administrator:

```sql
insert into public.staff_memberships (restaurant_id, user_id, role)
select id, 'REPLACE-WITH-AUTH-USER-UUID'::uuid, 'owner'
from public.restaurants where slug = 'get-food-demo';
```

Sign in at `/login`. Owners assign existing Auth users in `/restaurant/staff`; managers cannot promote staff. The last owner cannot be removed or demoted. Account invitations and recovery remain in the Supabase dashboard.

Configure opening hours, lead times, capacity and payment instructions at `/restaurant/settings`. Upload licensed food photography at `/restaurant/menu`: validated JPEG/PNG/WebP files, maximum 2 MB. The public `menu-images` bucket restricts uploads by restaurant role. No stock photograph is claimed to depict a seeded dish.

## Normal local Supabase setup

```powershell
npx.cmd supabase start
npx.cmd supabase db reset --local
```

After a successful local start, `node scripts/use-local-supabase.mjs` can create ignored `.env.local` without printing keys; it refuses to overwrite an existing file. Alternatively copy the local URL/keys from `npx.cmd supabase status` into `.env.local`. That command prints local credentials; do not publish its output. For the guarded reset helper:

```powershell
$env:ALLOW_DEMO_RESET = 'true'
npm.cmd run demo:reset
Remove-Item Env:ALLOW_DEMO_RESET
```

The helper requires explicit opt-in, always invokes `db reset --local`, and refuses `NODE_ENV=production`. There is no hosted reset mode. Full Supabase database images exceeded this onboarding machine's disk capacity, so **full local-stack startup is unverified here**. Do not retry the oversized pulls unchanged; use hosted development Supabase on this machine.

## Ordering and security behavior

- Menu data comes from Supabase. Cart prices are estimates. PostgreSQL computes final prices and preserves item/option snapshots.
- Pre-order checkout lists available service times in The Gambia, accounting for cart preparation time, cut-off rules, opening hours and capacity. Checkout rechecks opening hours, preparation/cut-off times, a 30-day advance horizon and 30-minute slot capacity. A tenant lock serializes competing capacity checks.
- A session idempotency key and random tracking token survive retries. A completed key cannot be reused with a different payload. Order, items, options, initial event and payment are created atomically.
- Pre-orders reject cash. A mobile-money reference enters `pending_verification`. Cashiers/managers/owners must check actual receipt. Kitchen staff cannot verify payments or edit prices. Unverified pre-orders cannot be accepted or prepared; future pre-orders cannot prepare early. Each order retains the longest required preparation time, so later menu edits do not change its kitchen schedule.
- Cash receipts must be recorded before completion. SQL checks status transitions. Cancel/reject an order before adjusting verified payments. Refund entries record refunds performed externally; the app does not transfer money.
- Tracking tokens are random 256-bit capabilities stored as hashes. Tracking responses omit phone/email. Keep links private. Guest Realtime broadcasts carry no sensitive data: the client re-reads via its token. Staff updates use RLS-protected Realtime. Both have refresh fallbacks.
- QR tokens are random, hashed, and permanently revocable. Download/print at issuance; raw tokens cannot be recovered later. Reissue to create a new active code. Dine-in table assignment comes from the token; staff can verify it in person.
- Business tables have RLS. Direct guest writes and direct staff writes to orders/payments/staff/QR/audit records are denied. Narrow SQL functions authorize sensitive changes; changes are audited.
- Checkout attempt budgets persist in PostgreSQL. Vercel uses its trusted client-IP header; other environments share a conservative development bucket. Other production hosts need a trusted proxy/IP integration.

Public routes: `/`, `/menu`, `/menu/[id]`, `/cart`, `/checkout`, `/order/[token]`, `/scan/[token]`. Staff routes under `/restaurant/`: dashboard, orders, kitchen, menu, tables, payments, reports, staff and settings.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:sql
npm.cmd run test:kitchen
npx.cmd playwright install chromium
npm.cmd run test:e2e
# Requires a real local Supabase stack configured in .env.local:
npm.cmd run test:db
```

`test:sql` uses disposable `postgres:15-alpine`, applies migrations/seed, and checks real SQL/RLS with explicit minimal Auth/Storage/Realtime interface fixtures. It **does not test those Supabase services** and removes its container afterward. `test:db` runs only against `127.0.0.1` Supabase and creates development accounts/data; reset afterward. Never target production. Browser smoke tests cover public/disconnected behavior. For the provided live browser workflow, set `GET_FOOD_INTEGRATION=1` and run `node --env-file=.env.local node_modules/@playwright/test/cli.js test` against local Supabase. That live workflow remains unrun here. This machine can use `CI_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` for its installed browser.

## Build and Vercel deployment

```powershell
npm.cmd run build
npm.cmd run start
```

Push reviewed changes to GitHub, import the repository into Vercel, choose Next.js, and configure all three variables in Vercel settings. Apply migrations to a separate production Supabase project through a reviewed migration process. **Never run the demo seed in production.** Configure the Vercel origin in Supabase Auth site/redirect URLs, review auth/email limits, and rebuild when changing public variables. Use HTTPS; configure merchant instructions, policies, contact details and opening hours before accepting orders.

Deployment, actual payment receipt, email delivery, backups/restores, concurrency under load, and real Supabase Auth/Storage/Realtime integration remain deployment gates. No deployment was performed.
