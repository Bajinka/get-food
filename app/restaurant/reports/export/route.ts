import { staff } from "@/lib/staff";
import { restaurantId } from "@/lib/menu";
export async function GET() {
  const { client } = await staff(["owner", "manager"]);
  const { data, error } = await client
    .from("orders")
    .select("number,created_at,status,payment_method,payment_status,total")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return new Response("Report unavailable", { status: 503 });
  const escape = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const csv = [
    "Order,Date,Status,Method,Payment,Total",
    ...data.map((o) =>
      [
        o.number,
        o.created_at,
        o.status,
        o.payment_method,
        o.payment_status,
        o.total,
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="get-food-orders.csv"',
      "Cache-Control": "no-store",
    },
  });
}
