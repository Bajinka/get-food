import { signIn } from "./actions";
import { configured } from "@/lib/supabase/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <section className="card form">
      <span className="eyebrow">Restaurant team</span>
      <h1 style={{ fontSize: 36 }}>Welcome back.</h1>
      <p>Sign in with your assigned staff account.</p>
      {!configured() && (
        <p className="notice">
          Supabase is not configured. Follow the setup guide before signing in.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error === "configuration"
            ? "Authentication is not configured."
            : "Unable to sign in. Check your credentials and try again."}
        </p>
      )}
      <form action={signIn} className="stack">
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            required
          />
        </label>
        <button disabled={!configured()}>Sign in securely</button>
      </form>
    </section>
  );
}
