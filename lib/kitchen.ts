export type KitchenOrder = {
  id: string;
  number: number;
  status: string;
  timing: string;
  service_type: string;
  requested_at: string;
  confirmed_at: string | null;
  preparation_minutes: number;
  instructions: string;
  payment_status: string;
  dining_tables: { number: string } | null;
  order_items: {
    id: string;
    name: string;
    quantity: number;
    instructions: string;
    order_item_options: { id: string; name: string }[];
  }[];
};
export function preparationState(
  order: Pick<
    KitchenOrder,
    "requested_at" | "confirmed_at" | "preparation_minutes" | "status"
  >,
  now = Date.now(),
) {
  const due = Date.parse(order.confirmed_at || order.requested_at);
  const start = due - order.preparation_minutes * 60000;
  if (order.status === "ready")
    return {
      kind: "ready",
      label: "Ready for service",
      canStart: false,
      start,
      due,
    };
  if (now >= due)
    return {
      kind: "overdue",
      label: "Service time overdue",
      canStart: order.status === "accepted",
      start,
      due,
    };
  if (now >= start)
    return {
      kind: "due",
      label:
        order.status === "preparing"
          ? "In preparation"
          : "Start preparation now",
      canStart: order.status === "accepted",
      start,
      due,
    };
  return {
    kind: "scheduled",
    label: "Scheduled for later",
    canStart: false,
    start,
    due,
  };
}
