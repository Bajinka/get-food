import { preparationState, type KitchenOrder } from "@/lib/kitchen";
import Form from "./form";
import Live from "./live";
import { restaurantId } from "@/lib/menu";
const time = (value: number) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Banjul",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function KitchenBoard({ orders }: { orders: KitchenOrder[] }) {
  const now = Date.now();
  const sorted = [...orders].sort(
    (a, b) =>
      Date.parse(a.confirmed_at || a.requested_at) -
      Date.parse(b.confirmed_at || b.requested_at),
  );
  return (
    <>
      <span className="eyebrow">Restaurant kitchen</span>
      <h1 style={{ fontSize: 44 }}>Every meal, right on time.</h1>
      <Live restaurant={restaurantId} />
      <p>
        Service and preparation times are shown in The Gambia. Only accepted
        orders appear here; scheduled orders require verified advance payment.
      </p>
      {[
        { key: "now", label: "Immediate orders" },
        { key: "scheduled", label: "Scheduled pre-orders" },
      ].map((group) => (
        <section key={group.key}>
          <h2>{group.label}</h2>
          <div className="grid">
            {sorted
              .filter((o) => o.timing === group.key)
              .map((o) => {
                const priority = preparationState(o, now);
                return (
                  <article
                    key={o.id}
                    className={"card stack kitchen-ticket " + priority.kind}
                  >
                    <div className="row">
                      <h2>#{o.number}</h2>
                      <span className="pill">{priority.label}</span>
                    </div>
                    <strong>
                      {o.service_type === "dine_in" ? "Dine in" : "Takeaway"}
                      {o.dining_tables
                        ? ` · Table ${o.dining_tables.number}`
                        : ""}
                    </strong>
                    <div>
                      <p>
                        Service: <strong>{time(priority.due)}</strong>
                      </p>
                      {o.timing === "scheduled" && (
                        <p>Preparation starts: {time(priority.start)}</p>
                      )}
                    </div>
                    <ul>
                      {o.order_items.map((i) => (
                        <li key={i.id}>
                          <strong>
                            {i.quantity} × {i.name}
                          </strong>
                          {i.order_item_options.map((option) => (
                            <span key={option.id}> · {option.name}</span>
                          ))}
                          {i.instructions && (
                            <p className="notice">{i.instructions}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {o.instructions && (
                      <p className="notice">Order note: {o.instructions}</p>
                    )}
                    {o.status === "accepted" && (
                      <Form
                        action="order"
                        submitLabel="Start preparation"
                        disabled={!priority.canStart}
                      >
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="status" value="preparing" />
                      </Form>
                    )}
                    {o.status === "preparing" && (
                      <Form action="order" submitLabel="Mark ready">
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="status" value="ready" />
                      </Form>
                    )}
                    {o.status === "ready" && (
                      <p role="status">
                        Ready for the service team to collect.
                      </p>
                    )}
                  </article>
                );
              })}
          </div>
          {!sorted.some((o) => o.timing === group.key) && (
            <p className="notice">
              No{" "}
              {group.key === "now"
                ? "immediate orders"
                : "scheduled pre-orders"}{" "}
              in the kitchen queue.
            </p>
          )}
        </section>
      ))}
    </>
  );
}
