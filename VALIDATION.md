# GET-FOOD validation — 21 October 2026

## Implemented source

- Next.js App Router shell, responsive green/orange/white layout, dynamic homepage, menu search/categories, dish customization, cart persistence and editing, and checkout forms.
- Supabase SSR clients, session refresh middleware, staff sign-in/signout, protected layouts and per-operation server authorization.
- Eight ordered PostgreSQL migrations: all requested business tables, tenant-safe relationships, monetary snapshots, constraints/indexes, RLS, transactional checkout, payment/order transitions, hashed QR/tracking capabilities, reporting, storage policies and audit records.
- Restaurant overview, order/kitchen queues, category/dish/customization management, table/QR controls, payment desk, staff membership controls, settings/profile, daily/monthly summaries and CSV export.
- Development-only seed data, guarded local reset, Windows instructions, and Vercel deployment instructions.

## Executed checks

| Check | Result and scope |
| --- | --- |
| Frozen install (`npm ci`) | Passed using the committed lockfile and workspace npm cache. |
| Production build / startup | Passed. Production HTTP requests verified homepage, menu-unavailable state, cart, checkout-unavailable state, staff redirect, malformed-token 404, and security headers. |
| TypeScript | Passed; production build also checks types. |
| ESLint | Passed with zero warnings after switching food imagery to Next Image. |
| Production dependency audit | Zero reported vulnerabilities with `npm audit --omit=dev`; this is not a complete security audit. |
| SQL migrations and seed | Passed in disposable PostgreSQL 15; seed applied twice to verify repeatability. |
| Database assertions | 77 passed. Real PostgreSQL RLS/functions; explicit minimal fixtures replace Auth/Storage/Realtime interfaces. |
| Kitchen timing tests | 6 passed: long preparation, future scheduling, confirmed times, overdue tickets, ready tickets and repeated starts. |
| Browser smoke tests | 7 passed in installed Chromium: availability API input validation, cart quantities/persistence/removal, mobile width and keyboard navigation, empty cart, protected-route redirect, malformed capabilities and cross-origin signout rejection. |
| Reset refusal checks | Missing opt-in, production mode and missing local flag correctly refuse execution. |

The SQL checks cover atomic price calculation and option snapshots; idempotency; cash pre-order denial; duplicate payment references; private tracking; kitchen/payment permissions; payment-before-acceptance and preparation-time gates; cash receipt before completion; refunds and original-verifier preservation; late-payment reconciliation; last-owner protection; QR issuance/revocation; audit records; persistent rate budgets; invalid-option rollback; capacity/opening-hour boundaries; and cross-tenant write isolation.

## Scheduling increment — 21 October 2026

Pre-order checkout now offers database-derived service times instead of a free-text date/time. The anonymous API returns time slots only, checks cart item identifiers, and disables caching. The SQL query uses opening hours, the longest meal preparation time, cut-off lead time, the 30-day horizon, current capacity, staff-confirmed times and expired unverified claims. Checkout still rechecks availability under its transaction lock; listing a slot does not reserve it. A partial index supports active service-time lookups.

Fifteen additional real-PostgreSQL assertions cover the availability query. Browser coverage validates API date/cart limits and cache headers. The connected time-picker interaction remains pending live Supabase configuration.

## Kitchen increment — 21 October 2026

The kitchen now separates immediate orders from scheduled pre-orders, highlights due/overdue tickets, shows preparation start times, and provides large Start preparation / Mark ready buttons. Preparation time is retained on each order from the longest meal requirement and restaurant default. Subsequent menu changes cannot shorten an existing order's preparation window, and staff service-time changes must allow that retained time. PostgreSQL enforces these rules independently of the display.

Five additional database assertions and six pure kitchen-priority tests cover retained preparation timing and action availability. The connected kitchen screen still needs live Supabase verification.

## Not yet verified / remaining limitations

**This is not a production-readiness claim or a completed live deployment.** No development Supabase project is configured in this machine. Full Supabase images repeatedly exhausted its disk; those pulls were stopped. Isolated PostgreSQL checks do not establish Auth sign-in/session refresh, real Storage uploads, Realtime subscriptions/broadcasts, or the complete browser-to-Supabase checkout flow. `npm run test:db` and the live browser workflow in `tests/browser/live.spec.ts` are provided for a real local Supabase stack but remain unrun here. A final clean pull after recovering 26 GB of free disk still failed with `no space left on device`. Hosted testing requires a dedicated project URL, public key and server-only service-role binding supplied securely through settings.

- Public browser tests use unavailable/disconnected service states. The cart-state test uses an explicit local-storage fixture; no backend is mocked or represented as working.
- Upload your licensed food photography. Stock photography was not bundled; the external image source was blocked by network policy. Image optimization restricts remote sources to the configured Supabase Storage bucket.
- UI selects the demo restaurant and GMD/Africa-Banjul. Currency/time-zone selection and tenant switching are future work; database tenant isolation already exists.
- Staff accounts and recovery are created through Supabase Auth administration. Owners assign/remove memberships; managers cannot grant privileges.
- Revenue summaries include verified payments and exclude refunds, grouped by order creation date. Detail/CSV views contain the latest 1,000 orders; date-range aggregate summaries cover all matching orders for at most one year. These are operational reports, not settlement/accounting statements.
- Revoked QR tokens stay revoked. Create a new code to reactivate an entry point. Existing raw tokens cannot be recovered from their hashes.
- A non-Vercel production deployment needs trusted client-IP configuration for checkout budgeting. Development uses a conservative shared bucket. Supabase authentication limits also need project configuration.
- Payment verification/refunds are manual records of checks performed outside the app. No funds are moved. Merchant instructions and refund/cancellation policies must be configured and reviewed before launch.
- Scheduled preparation is operator-driven and SQL-gated, not a background worker or external notification service. Customer tracking uses Realtime plus refresh fallbacks; actual delivery remains unverified.
- Concurrent load, full role-by-role browser workflows, upload abuse tests, email delivery, backup/restore drills, accessibility audit, and deployed Vercel validation remain required before a real launch.

No live credentials were written to source and no hosted database was reset or seeded. The application source was committed and pushed to the separate GitHub branch `codex/get-food-app` on 21 October 2026; `main` was preserved. Environment draft saves do not publish the application or environment.
