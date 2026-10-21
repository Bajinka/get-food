import { staff } from "@/lib/staff";
import type { Option } from "@/lib/menu";
import { restaurantId } from "@/lib/menu";
import { money } from "@/lib/money";
import Form from "../../form";
export const dynamic = "force-dynamic";
export default async function Options() {
  const { client } = await staff(["owner", "manager"]);
  const { data: items, error } = await client
    .from("menu_items")
    .select("id,name,menu_option_groups(*,menu_options(*))")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (error) throw new Error("Could not load customization options");
  return (
    <>
      <h1 style={{ fontSize: 44 }}>Meal customization</h1>
      <p>
        Use option groups for portions, proteins and extras. Minimum choices
        make an option mandatory. Historical order snapshots remain unchanged
        when options are disabled.
      </p>
      <div className="grid">
        {items.map((i) => (
          <section className="card" key={i.id}>
            <h2>{i.name}</h2>
            <h3>Add option group</h3>
            <Form action="group">
              <input name="menu_item_id" type="hidden" value={i.id} />
              <label>
                Name
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="Portion, Protein, Extras…"
                />
              </label>
              <label>
                Minimum choices
                <input
                  name="min_choices"
                  type="number"
                  min="0"
                  max="30"
                  defaultValue={0}
                  required
                />
              </label>
              <label>
                Maximum choices
                <input
                  name="max_choices"
                  type="number"
                  min="1"
                  max="30"
                  defaultValue={1}
                  required
                />
              </label>
            </Form>
            {i.menu_option_groups.map((g) => (
              <section className="card" key={g.id}>
                <h3>{g.name}</h3>
                <p>
                  Choose {g.min_choices}–{g.max_choices}
                </p>
                {g.menu_options.map((o: Option) => (
                  <div key={o.id}>
                    <p>
                      {o.name} · {money(o.price)} ·{" "}
                      {o.available ? "Available" : "Disabled"}
                    </p>
                    {o.available && (
                      <Form action="delete-option">
                        <input name="id" type="hidden" value={o.id} />
                        <p>Disable option</p>
                      </Form>
                    )}
                  </div>
                ))}
                <h3>Add option</h3>
                <Form action="option">
                  <input name="group_id" type="hidden" value={g.id} />
                  <label>
                    Name
                    <input name="name" required maxLength={100} />
                  </label>
                  <label>
                    Additional price (GMD)
                    <input
                      name="price"
                      type="number"
                      min="0"
                      max="9999999"
                      step=".01"
                      defaultValue={0}
                      required
                    />
                  </label>
                </Form>
              </section>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
