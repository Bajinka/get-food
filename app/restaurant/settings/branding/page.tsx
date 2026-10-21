import { staff } from "@/lib/staff";
import { restaurantId } from "@/lib/menu";
import Form from "../../form";
export const dynamic = "force-dynamic";
export default async function Branding() {
  const { client } = await staff(["owner", "manager"]);
  const { data, error } = await client
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .single();
  if (error) throw new Error("Could not load restaurant profile");
  return (
    <section className="card">
      <h1 style={{ fontSize: 40 }}>Restaurant profile</h1>
      <Form action="branding">
        {["name", "description", "address", "phone"].map((k) => (
          <label key={k}>
            {k[0].toUpperCase() + k.slice(1)}
            <input
              name={k}
              defaultValue={data[k]}
              maxLength={
                k === "name"
                  ? 100
                  : k === "phone"
                    ? 30
                    : k === "address"
                      ? 500
                      : 1000
              }
              required={k === "name"}
            />
          </label>
        ))}
      </Form>
      <p>Currency: Gambian dalasi (GMD). Time zone: Africa/Banjul.</p>
    </section>
  );
}
