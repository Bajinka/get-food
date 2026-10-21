# Publish GET-FOOD on Vercel

The application source is on `codex/get-food-app` in `Bajinka/get-food`. This is a deployment candidate, not a live website. See VALIDATION.md for verification limits.

1. Open https://github.com/Bajinka/get-food/pull/new/codex/get-food-app and review/create a pull request. Merge it into main when satisfied; main currently contains the original incomplete starter.
2. Open https://vercel.com/new and sign in with GitHub. Import Bajinka/get-food after merging the application branch. Keep the Next.js preset, repository-root directory, and npm build defaults.
3. Set NEXT_PUBLIC_SUPABASE_URL to https://hjgjbzmkhlxoevrqncwi.supabase.co.
4. Set NEXT_PUBLIC_SUPABASE_ANON_KEY to the public Supabase key and SUPABASE_SERVICE_ROLE_KEY to the server-only service-role key in Vercel environment settings. These settings are separate from Codex environment settings. Do not paste keys into chat or source.
5. Apply the ordered migrations to your dedicated development Supabase project and load the development seed only there, following README.md. Assign the initial owner account. Do not seed a production database.
6. Deploy. Vercel supplies the actual website address. Configure that origin in Supabase Auth settings, then validate sign-in, menu loading, a test checkout, payment permissions, kitchen updates and tracking before accepting real orders.

Without the public key, backend pages display unavailable states. No Vercel login was connected during preparation, so no deployment or public site URL has been claimed.
