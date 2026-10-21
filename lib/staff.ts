import { redirect } from "next/navigation";
import { supabase, configured } from "./supabase/server";
import { restaurantId } from "./menu";
export async function staff(roles?: string[]) {
  if (!configured()) redirect("/login?error=configuration");
  const client = await supabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await client
    .from("staff_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .single();
  if (error || !data || (roles && !roles.includes(data.role)))
    throw new Error("You do not have permission to perform this action.");
  return { client, user, role: data.role };
}
