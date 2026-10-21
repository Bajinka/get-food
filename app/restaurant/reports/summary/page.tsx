import { staff } from "@/lib/staff";
import { restaurantId } from "@/lib/menu";
import { money } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function Summary({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { client } = await staff(["owner", "manager"]);
  const query = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const valid = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = valid(query.from) ? query.from! : today.slice(0, 7) + "-01",
    to = valid(query.to) ? query.to! : today;
  const { data, error } = await client.rpc("sales_summary", {
    tenant: restaurantId,
    from_date: from,
    to_date: to,
  });
  return (
    <>
      <h1 style={{ fontSize: 44 }}>Daily & monthly sales</h1>
      <form className="row">
        <label>
          From
          <input name="from" type="date" defaultValue={from} required />
        </label>
        <label>
          To
          <input name="to" type="date" defaultValue={to} required />
        </label>
        <button>Update report</button>
      </form>
      {error ? (
        <p className="notice">
          Unable to load report. Choose a valid range of up to one year.
        </p>
      ) : (
        <>
          <div className="grid">
            <section className="card">
              <h2>{money(data.verified_sales)}</h2>Verified sales
            </section>
            <section className="card">
              <h2>{data.total_orders}</h2>Total orders
            </section>
            <section className="card">
              <h2>{data.cancelled}</h2>Cancelled orders
            </section>
          </div>
          <div className="grid">
            <section className="card">
              <h2>Daily sales</h2>
              {data.daily.map(
                (d: { day: string; orders: number; sales: number }) => (
                  <p key={d.day}>
                    {d.day} · {d.orders} orders · {money(d.sales)}
                  </p>
                ),
              )}
            </section>
            <section className="card">
              <h2>Payment methods</h2>
              {data.methods.map(
                (m: { method: string; orders: number; sales: number }) => (
                  <p key={m.method}>
                    {m.method} · {m.orders} orders · {money(m.sales)}
                  </p>
                ),
              )}
            </section>
            <section className="card">
              <h2>Popular dishes</h2>
              {data.popular.map((p: { name: string; quantity: number }) => (
                <p key={p.name}>
                  {p.name} · {p.quantity} portions
                </p>
              ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}
