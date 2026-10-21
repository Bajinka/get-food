import { notFound } from "next/navigation";
import { supabase, configured } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import Refresh from "./refresh";
export const dynamic = "force-dynamic";
export const metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function Tracking({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  if (!configured())
    return <p className="notice">Order tracking is temporarily unavailable.</p>;
  const client = await supabase();
  const { data, error } = await client.rpc("track_order", { token });
  if (error)
    return <p className="notice">Unable to load tracking. Please try again.</p>;
  if (!data) notFound();
  return (
    <section className="card">
      <span className="eyebrow">Keep this private tracking link</span>
      <h1 style={{ fontSize: 48 }}>Order #{data.number}</h1>
      <Refresh token={token} />
      <p className="pill">{data.status}</p>
      <h2>Payment: {data.payment_status.replaceAll("_", " ")}</h2>
      <p>
        {data.payment_method} · {money(data.total)}
      </p>
      <p>
        Requested:{" "}
        {new Date(data.requested_at).toLocaleString("en-GB", {
          timeZone: "Africa/Banjul",
        })}{" "}
        (The Gambia)
      </p>
      <p>
        Confirmed service time:{" "}
        {data.confirmed_at
          ? new Date(data.confirmed_at).toLocaleString("en-GB", {
              timeZone: "Africa/Banjul",
            })
          : "Awaiting restaurant acceptance"}
      </p>
      {data.timing === "scheduled" && (
        <p className="notice">
          Preparation starts only after advance payment verification and
          restaurant acceptance.
        </p>
      )}
      <ul>
        {data.items?.map(
          (
            i: { name: string; quantity: number; unit_price: number },
            n: number,
          ) => (
            <li key={n}>
              {i.quantity} × {i.name} · {money(i.quantity * i.unit_price)}
            </li>
          ),
        )}
      </ul>
      <h2>Order progress</h2>
      <ol>
        {data.events?.map(
          (e: { status: string; created_at: string }, n: number) => (
            <li key={n}>
              {e.status} ·{" "}
              {new Date(e.created_at).toLocaleTimeString("en-GB", {
                timeZone: "Africa/Banjul",
              })}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
