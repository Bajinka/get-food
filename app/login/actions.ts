"use server";
import { redirect } from "next/navigation";
import { supabase, configured } from "@/lib/supabase/server";
export async function signIn(form: FormData) {
  if (!configured()) redirect("/login?error=configuration");
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!email || !password || email.length > 254 || password.length > 1024)
    redirect("/login?error=credentials");
  const client = await supabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=credentials");
  redirect("/restaurant/dashboard");
}
