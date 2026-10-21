import Link from "next/link";
import KitchenBoard from "../kitchen-board";
import type { KitchenOrder } from "@/lib/kitchen";
import { notFound } from "next/navigation";
import { staff } from "@/lib/staff";
import { restaurantId } from "@/lib/menu";
import { money } from "@/lib/money";
import Form from "../form";
import Live from "../live";
export const dynamic = "force-dynamic";
type Row = Record<string, any>;
function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
export default async function Section({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ status?: string; date?: string; timing?: string }>;
}) {
  const { section } = await params;
  const filters = await searchParams;
  if (
    ![
      "orders",
      "kitchen",
      "menu",
      "tables",
      "payments",
      "reports",
      "staff",
      "settings",
    ].includes(section)
  )
    notFound();
  const roles =
    section === "payments"
      ? ["owner", "manager", "cashier"]
      : ["menu", "tables", "settings", "reports"].includes(section)
        ? ["owner", "manager"]
        : section === "staff"
          ? ["owner"]
          : undefined;
  let context;
  try {
    context = await staff(roles);
  } catch {
    return <p className="notice">You do not have access to this section.</p>;
  }
  const { client, role } = context;
  const get = async (table: string, select = "*") => {
    const { data, error } = await client
      .from(table)
      .select(select)
      .eq("restaurant_id", restaurantId);
    if (error) throw new Error("Could not load " + table);
    return (data ?? []) as Row[];
  };
  if (section === "orders" || section === "kitchen") {
    let query = client
      .from("orders")
      .select("*,dining_tables(number),order_items(*,order_item_options(*))")
      .eq("restaurant_id", restaurantId)
      .order("requested_at")
      .limit(100);
    if (section === "kitchen")
      query = query.in("status", ["accepted", "preparing", "ready"]);
    if (
      filters.status &&
      [
        "pending",
        "accepted",
        "preparing",
        "ready",
        "completed",
        "cancelled",
        "rejected",
      ].includes(filters.status)
    )
      query = query.eq("status", filters.status);
    if (filters.timing && ["now", "scheduled"].includes(filters.timing))
      query = query.eq("timing", filters.timing);
    if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
      query = query
        .gte("requested_at", filters.date + "T00:00:00Z")
        .lt(
          "requested_at",
          new Date(
            Date.parse(filters.date + "T00:00:00Z") + 86400000,
          ).toISOString(),
        );
    }
    const { data, error } = await query;
    if (error) throw new Error("Could not load orders");
    if (section === "kitchen")
      return (
        <KitchenBoard orders={(data ?? []) as unknown as KitchenOrder[]} />
      );
    return (
      <>
        <h1 style={{ fontSize: 44 }}>Order management</h1>
        <Live restaurant={restaurantId} />
        <form className="row">
          <label>
            Status
            <select name="status" defaultValue={filters.status}>
              <option value="">All</option>
              {[
                "pending",
                "accepted",
                "preparing",
                "ready",
                "completed",
                "cancelled",
                "rejected",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Timing
            <select name="timing" defaultValue={filters.timing}>
              <option value="">All</option>
              <option value="now">Immediate</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </label>
          <label>
            Service date
            <input name="date" type="date" defaultValue={filters.date} />
          </label>
          <button>Filter</button>
        </form>
        <p className="muted">
          Showing up to 100 orders, earliest service first. Scheduled orders
          require verified payment before acceptance.
        </p>
        <div className="grid">
          {data?.map((o) => (
            <article key={o.id} className="card stack">
              <div className="row">
                <h2>#{o.number}</h2>
                <span className="pill">
                  {o.timing} · {o.status}
                </span>
              </div>
              <p>
                {o.customer_name} · {o.service_type}{" "}
                {o.dining_tables?.number && `· Table ${o.dining_tables.number}`}
              </p>
              <strong>
                Due{" "}
                {new Date(o.confirmed_at || o.requested_at).toLocaleString(
                  "en-GB",
                  { timeZone: "Africa/Banjul" },
                )}
              </strong>
              <p>Payment: {o.payment_status}</p>
              <ul>
                {o.order_items?.map((i: Row) => (
                  <li key={i.id}>
                    <strong>
                      {i.quantity} × {i.name}
                    </strong>
                    {i.order_item_options?.map((x: Row) => (
                      <span key={x.id}> · {x.name}</span>
                    ))}
                    {i.instructions && <p>{i.instructions}</p>}
                  </li>
                ))}
              </ul>
              {o.instructions && <p>Note: {o.instructions}</p>}
              {o.table_id && (
                <p>
                  Table service:{" "}
                  {o.table_verified
                    ? "Verified by staff"
                    : "Verification needed"}
                </p>
              )}
              {o.table_id &&
                !o.table_verified &&
                ["owner", "manager", "waiter"].includes(role) && (
                  <Form action="verify-table">
                    <Hidden name="id" value={o.id} />
                    <p>I have verified this table assignment in person.</p>
                  </Form>
                )}
              {["owner", "manager"].includes(role) &&
                ["pending", "accepted"].includes(o.status) && (
                  <Form action="service-time">
                    <Hidden name="id" value={o.id} />
                    <label>
                      Confirm service time (The Gambia / UTC)
                      <input
                        name="service_time"
                        type="datetime-local"
                        required
                      />
                    </label>
                  </Form>
                )}
              <Form action="order">
                <Hidden name="id" value={o.id} />
                <label>
                  Update status
                  <select name="status">
                    {(role === "kitchen"
                      ? ["preparing", "ready"]
                      : role === "waiter"
                        ? ["completed"]
                        : [
                            "accepted",
                            "preparing",
                            "ready",
                            "completed",
                            "rejected",
                            "cancelled",
                          ]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </Form>
            </article>
          ))}
        </div>
        {!data?.length && (
          <p className="notice">No orders match these filters.</p>
        )}
      </>
    );
  }
  if (section === "payments") {
    const records = await get(
      "payments",
      "*,orders(number,status,customer_name,payment_deadline)",
    );
    return (
      <>
        <h1 style={{ fontSize: 44 }}>Payment desk</h1>
        <p className="notice">
          Check actual receipt in the merchant account before verifying. A
          customer reference is not proof of payment. Refund records document an
          external refund; this app does not move funds.
        </p>
        <div className="grid">
          {records.map((p) => (
            <section key={p.id} className="card">
              <h2>Order #{p.orders?.number}</h2>
              <p>
                {p.orders?.customer_name} · {p.method} · {money(p.amount)}
              </p>
              <p>
                Reference: {p.reference || "Cash at restaurant"}
                <br />
                Status: {p.status}
              </p>
              <Form action="payment">
                <Hidden name="id" value={p.order_id} />
                <label>
                  Decision
                  <select name="status">
                    <option value="verified">Actual payment received</option>
                    <option value="rejected">Reject payment claim</option>
                    <option value="refunded">
                      Refund completed externally
                    </option>
                  </select>
                </label>
                <label>
                  Reason / notes
                  <textarea name="reason" maxLength={500} />
                </label>
              </Form>
            </section>
          ))}
        </div>
      </>
    );
  }
  if (section === "menu") {
    const [items, categories] = await Promise.all([
      get("menu_items"),
      get("menu_categories"),
    ]);
    return (
      <>
        <h1 style={{ fontSize: 44 }}>Menu studio</h1>
        <Link className="button" href="/restaurant/menu/options">
          Manage portions, proteins & extras
        </Link>
        <div className="grid">
          <section className="card">
            <h2>Add category</h2>
            <Form action="category">
              <label>
                Name
                <input name="name" maxLength={100} required />
              </label>
            </Form>
            {categories.map((c) => (
              <div className="card" key={c.id}>
                <h3>{c.name}</h3>
                <Form action="rename-category">
                  <Hidden name="id" value={c.id} />
                  <label>
                    Category name
                    <input
                      name="name"
                      defaultValue={c.name}
                      maxLength={100}
                      required
                    />
                  </label>
                </Form>
                <Form action="delete-category">
                  <Hidden name="id" value={c.id} />
                  <p>Remove empty category</p>
                </Form>
              </div>
            ))}
          </section>
          {[null, ...items].map((i: Row | null) => (
            <section className="card" key={i?.id || "new"}>
              <h2>{i ? "Edit " + i.name : "Add dish"}</h2>
              <Form action="menu">
                <Hidden name="id" value={i?.id || ""} />
                <Hidden name="image_url" value={i?.image_url || ""} />
                <label>
                  Name
                  <input
                    name="name"
                    defaultValue={i?.name}
                    required
                    maxLength={100}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={i?.description}
                    maxLength={1000}
                  />
                </label>
                <label>
                  Category
                  <select
                    name="category_id"
                    defaultValue={i?.category_id}
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Price (GMD)
                  <input
                    name="price"
                    type="number"
                    min="0"
                    max="9999999"
                    step="0.01"
                    defaultValue={i?.price || 0}
                    required
                  />
                </label>
                <label>
                  Preparation minutes
                  <input
                    name="preparation_minutes"
                    type="number"
                    min="1"
                    max="240"
                    defaultValue={i?.preparation_minutes || 30}
                    required
                  />
                </label>
                <label>
                  Photo (JPEG, PNG, WebP; max 2 MB)
                  <input
                    name="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                  />
                </label>
                <label style={{ display: "flex" }}>
                  <input
                    style={{ width: "auto" }}
                    name="available"
                    type="checkbox"
                    defaultChecked={i?.available ?? true}
                  />
                  Available
                </label>
              </Form>
            </section>
          ))}
        </div>
      </>
    );
  }
  if (section === "tables") {
    const [tables, qrs] = await Promise.all([
      get("dining_tables"),
      get("qr_codes"),
    ]);
    return (
      <>
        <h1 style={{ fontSize: 44 }}>Tables & QR codes</h1>
        <div className="grid">
          <section className="card">
            <h2>Add table</h2>
            <Form action="table">
              <label>
                Table number
                <input name="number" required maxLength={20} />
              </label>
            </Form>
          </section>
          <section className="card">
            <h2>Generate ordering QR</h2>
            <Form action="qr">
              <label>
                Entry point
                <select name="table_id">
                  <option value="">General restaurant QR</option>
                  {tables
                    .filter((t) => t.active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.number}
                      </option>
                    ))}
                </select>
              </label>
            </Form>
          </section>
          {tables.map((t) => (
            <section className="card" key={t.id}>
              <h2>Table {t.number}</h2>
              <Form action="rename-table">
                <Hidden name="id" value={t.id} />
                <label>
                  Table number
                  <input
                    name="number"
                    defaultValue={t.number}
                    maxLength={20}
                    required
                  />
                </label>
              </Form>
              <Form action="table-active">
                <Hidden name="id" value={t.id} />
                <label>
                  Status
                  <select name="active" defaultValue={String(t.active)}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </label>
              </Form>
            </section>
          ))}
        </div>
        <h2>Issued codes</h2>
        <div className="grid">
          {qrs.map((q) => (
            <section className="card" key={q.id}>
              <p>
                {q.table_id
                  ? "Table " + tables.find((t) => t.id === q.table_id)?.number
                  : "General QR"}{" "}
                · {q.active ? "Active" : "Revoked"}
              </p>
              <p className="muted">
                Created {new Date(q.created_at).toLocaleDateString()}
              </p>
              {q.active && (
                <Form action="revoke">
                  <Hidden name="id" value={q.id} />
                  <p>Revoke this code permanently</p>
                </Form>
              )}
            </section>
          ))}
        </div>
      </>
    );
  }
  if (section === "staff") {
    const memberships = await get("staff_memberships");
    return (
      <>
        <h1 style={{ fontSize: 44 }}>Staff access</h1>
        <section className="card">
          <p>
            Create an account in Supabase Authentication first, then assign its
            user ID here. Only owners can change staff roles.
          </p>
          <Form action="staff">
            <label>
              Auth user UUID
              <input name="user_id" required />
            </label>
            <label>
              Role
              <select name="role">
                {["owner", "manager", "cashier", "kitchen", "waiter"].map(
                  (r) => (
                    <option key={r}>{r}</option>
                  ),
                )}
              </select>
            </label>
          </Form>
        </section>
        <div className="grid">
          {memberships.map((m) => (
            <section className="card" key={m.id}>
              <p>{m.user_id}</p>
              <strong>{m.role}</strong>
              <Form action="remove-staff">
                <Hidden name="user_id" value={m.user_id} />
                <p>Remove this staff membership</p>
              </Form>
            </section>
          ))}
        </div>
      </>
    );
  }
  if (section === "settings") {
    const settings = (await get("restaurant_settings"))[0];
    const hours = await get("restaurant_hours");
    return (
      <>
        <h1 style={{ fontSize: 44 }}>Restaurant settings</h1>
        <p>
          <Link className="button" href="/restaurant/settings/branding">
            Restaurant profile & contact details
          </Link>
        </p>
        <section className="card">
          <Form action="settings">
            {[
              "preparation_minutes",
              "cutoff_minutes",
              "slot_capacity",
              "payment_deadline_minutes",
            ].map((k) => (
              <label key={k}>
                {k.replaceAll("_", " ")}
                <input
                  type="number"
                  name={k}
                  defaultValue={settings?.[k]}
                  required
                />
              </label>
            ))}
            {[
              "wave_instructions",
              "afrimoney_instructions",
              "cancellation_policy",
            ].map((k) => (
              <label key={k}>
                {k.replaceAll("_", " ")}
                <textarea
                  name={k}
                  defaultValue={settings?.[k]}
                  maxLength={2000}
                />
              </label>
            ))}
          </Form>
        </section>
        <h2>Opening hours · Africa/Banjul</h2>
        <div className="grid">
          {[
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ].map((day, n) => {
            const h = hours.find((x) => x.weekday === n);
            return (
              <section className="card" key={day}>
                <h3>{day}</h3>
                <Form action="hours">
                  <Hidden name="weekday" value={String(n)} />
                  <label>
                    Opens
                    <input
                      type="time"
                      name="opens"
                      defaultValue={h?.opens?.slice(0, 5) || "09:00"}
                    />
                  </label>
                  <label>
                    Closes
                    <input
                      type="time"
                      name="closes"
                      defaultValue={h?.closes?.slice(0, 5) || "22:00"}
                    />
                  </label>
                  <label style={{ display: "flex" }}>
                    <input
                      style={{ width: "auto" }}
                      name="closed"
                      type="checkbox"
                      defaultChecked={!h}
                    />
                    Closed
                  </label>
                </Form>
              </section>
            );
          })}
        </div>
      </>
    );
  }
  const { data: orders, error } = await client
    .from("orders")
    .select("*,order_items(name,quantity)")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error("Could not load reports");
  const verified = orders.filter((o) => o.payment_status === "verified");
  return (
    <>
      <h1 style={{ fontSize: 44 }}>Sales reports</h1>
      <Link className="button" href="/restaurant/reports/summary">
        Daily & monthly summaries
      </Link>
      <p>
        Latest 1,000 orders. Sales include verified payments only. Refunds are
        excluded.
      </p>
      <div className="grid">
        <section className="card">
          <h2>{money(verified.reduce((s, o) => s + Number(o.total), 0))}</h2>
          Verified sales
        </section>
        <section className="card">
          <h2>{orders.length}</h2>Orders
        </section>
        <section className="card">
          <h2>{orders.filter((o) => o.status === "cancelled").length}</h2>
          Cancelled
        </section>
      </div>
      <a className="button" href="/restaurant/reports/export" download>
        Export CSV
      </a>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Status</th>
              <th>Method</th>
              <th>Payment</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>#{o.number}</td>
                <td>{new Date(o.created_at).toLocaleDateString("en-GB")}</td>
                <td>{o.status}</td>
                <td>{o.payment_method}</td>
                <td>{o.payment_status}</td>
                <td>{money(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
