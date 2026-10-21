import { staff } from "@/lib/staff";
import { restaurantId } from "@/lib/menu";
import { money } from "@/lib/money";
import Link from "next/link";
import Live from "../live";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const { client, role } = await staff();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data: orders, error } = await client
    .from("orders")
    .select("id,status,payment_status,timing,total,table_id")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", start.toISOString());
  if (error) throw new Error("Could not load dashboard");
  const stats = [
    ["Today’s orders", orders.length],
    ["Pending orders", orders.filter((o) => o.status === "pending").length],
    [
      "Active tables",
      new Set(
        orders
          .filter(
            (o) =>
              o.table_id &&
              !["completed", "cancelled", "rejected"].includes(o.status),
          )
          .map((o) => o.table_id),
      ).size,
    ],
    [
      "Scheduled pre-orders",
      orders.filter(
        (o) =>
          o.timing === "scheduled" &&
          ["pending", "accepted"].includes(o.status),
      ).length,
    ],
    [
      "Payments awaiting review",
      orders.filter((o) => o.payment_status === "pending_verification").length,
    ],
  ];
  return (
    <>
      <span className="eyebrow">GET-FOOD Demo Restaurant · {role}</span>
      <h1 style={{ fontSize: 44 }}>A good day starts here.</h1>
      <Live restaurant={restaurantId} />
      <div className="grid">
        {stats.map(([label, value]) => (
          <section key={label} className="card">
            <span className="muted">{label}</span>
            <h2>{value}</h2>
          </section>
        ))}
        {["owner", "manager", "cashier"].includes(role) && (
          <section className="card">
            <span className="muted">Today’s verified sales</span>
            <h2>
              {money(
                orders
                  .filter((o) => o.payment_status === "verified")
                  .reduce((sum, o) => sum + Number(o.total), 0),
              )}
            </h2>
          </section>
        )}
      </div>
      <Link
        className="button"
        href={role === "kitchen" ? "/restaurant/kitchen" : "/restaurant/orders"}
      >
        Open {role === "kitchen" ? "kitchen board" : "orders"} →
      </Link>
    </>
  );
}
