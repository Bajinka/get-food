# GET-FOOD development starter

Read [README.md](README.md) for setup and [VALIDATION.md](VALIDATION.md) for tested behavior and limitations.

1. Install Node.js 22 or 24 and run `npm.cmd ci` in PowerShell.
2. Copy `.env.example` to `.env.local` and configure a dedicated development Supabase project.
3. Apply SQL files in `supabase/migrations` in filename order, then load `supabase/seed.sql` in development only.
4. Create a Supabase Auth user and assign the initial owner membership using the SQL in the README.
5. Run `npm.cmd run dev`.

Checkout is disabled without backend configuration. Customer payment references never count as verified payments. Configure genuine development merchant instructions before mobile-money testing; do not send real money to test this application.
