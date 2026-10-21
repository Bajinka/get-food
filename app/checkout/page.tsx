import { supabase, configured } from "@/lib/supabase/server";
import { restaurantId } from "@/lib/menu";
import Checkout from "./checkout";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return (
      <p className="notice">
        Online ordering is not configured. Please contact restaurant staff.
      </p>
    );
  const client = await supabase();
  const { data, error } = await client
    .from("restaurant_settings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .single();
  if (error)
    return (
      <p className="notice">
        Restaurant settings could not be loaded. Please try again.
      </p>
    );
  return <Checkout settings={data} />;
}
