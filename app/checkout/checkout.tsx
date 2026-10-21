"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { readCart, saveCart, type CartItem } from "@/lib/cart";
import { money } from "@/lib/money";
import { checkout } from "./actions";
import ServiceTime from "./service-time";
type Settings = {
  wave_instructions: string;
  afrimoney_instructions: string;
  preparation_minutes: number;
  cutoff_minutes: number;
  cancellation_policy: string;
};
export default function Checkout({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [timing, setTiming] = useState("now");
  const [payment, setPayment] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scheduleReady, setScheduleReady] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    setItems(readCart());
    if (new URLSearchParams(location.search).get("timing") === "scheduled") {
      setTiming("scheduled");
      setPayment("wave");
    }
  }, []);
  return (
    <>
      <h1 style={{ fontSize: 48 }}>Make it a meal.</h1>
      <p>
        Pre-orders require verified advance payment and restaurant acceptance. A
        transaction reference alone is not proof of payment.
      </p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          let identity;
          try {
            identity = JSON.parse(
              sessionStorage.getItem("get-food-checkout") || "null",
            );
            if (!identity) {
              identity = {
                idempotency_key: crypto.randomUUID(),
                tracking_token: Array.from(
                  crypto.getRandomValues(new Uint8Array(32)),
                  (b) => b.toString(16).padStart(2, "0"),
                ).join(""),
              };
              sessionStorage.setItem(
                "get-food-checkout",
                JSON.stringify(identity),
              );
            }
            const result = await checkout({
              ...Object.fromEntries(f),
              ...identity,
              requested_at: f.get("requested_at")
                ? new Date(String(f.get("requested_at"))).toISOString()
                : "",
              qr_token: sessionStorage.getItem("get-food-qr") || "",
              items: items.map(({ id, quantity, options, instructions }) => ({
                id,
                quantity,
                options,
                instructions,
              })),
            });
            if (result.ok) {
              saveCart([]);
              sessionStorage.removeItem("get-food-checkout");
              router.push("/order/" + identity.tracking_token);
            } else setError(result.error || "Please try again.");
          } catch {
            setError(
              "Unable to submit. Check your connection and browser storage, then try again.",
            );
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <div className="grid">
          <section className="card stack">
            <h2>Service details</h2>
            <label>
              When?
              <select
                name="timing"
                value={timing}
                onChange={(e) => {
                  setTiming(e.target.value);
                  setScheduleReady(false);
                  if (e.target.value === "scheduled") setPayment("wave");
                }}
              >
                <option value="now">Order now</option>
                <option value="scheduled">Pre-order</option>
              </select>
            </label>
            {timing === "scheduled" && (
              <ServiceTime
                itemIds={items.map((i) => i.id)}
                onReady={setScheduleReady}
              />
            )}
            <label>
              Service
              <select name="service_type">
                <option value="takeaway">Takeaway / Pickup</option>
                <option value="dine_in">Dine in</option>
              </select>
            </label>
            <p className="muted">
              A scanned table QR is applied automatically for dine-in. Staff
              will verify your table.
            </p>
            <label>
              Your name
              <input
                name="customer_name"
                maxLength={100}
                autoComplete="name"
                required
              />
            </label>
            <label>
              Phone
              <input
                name="phone"
                type="tel"
                minLength={7}
                maxLength={30}
                autoComplete="tel"
                required
              />
            </label>
            <label>
              Email (optional)
              <input
                name="email"
                type="email"
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <label>
              Instructions
              <textarea name="instructions" maxLength={1000} />
            </label>
          </section>
          <section className="card stack">
            <h2>Payment & summary</h2>
            {items.map((i) => (
              <div key={i.key} className="row">
                <span>
                  {i.quantity} × {i.name}
                </span>
                <strong>{money(i.quantity * i.unitPrice)}</strong>
              </div>
            ))}
            <strong>
              Estimated total{" "}
              {money(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}
            </strong>
            <label>
              Payment method
              <select
                name="payment_method"
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              >
                {timing === "now" && (
                  <option value="cash">Cash at restaurant</option>
                )}
                <option value="wave">Wave</option>
                <option value="afrimoney">Afrimoney</option>
              </select>
            </label>
            {payment !== "cash" ? (
              <>
                <p className="notice">
                  {payment === "wave"
                    ? settings.wave_instructions
                    : settings.afrimoney_instructions}
                </p>
                <label>
                  Transaction reference
                  <input
                    name="reference"
                    minLength={4}
                    maxLength={100}
                    required
                  />
                </label>
                <p>
                  Staff must check actual receipt. Payment approval is never
                  automatic.
                </p>
              </>
            ) : (
              <input name="reference" type="hidden" value="" />
            )}
            <p>{settings.cancellation_policy}</p>
            <label style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <input style={{ width: "auto" }} type="checkbox" required />I
              agree to the cancellation policy and understand service time is
              subject to acceptance.
            </label>
            <button
              disabled={
                busy ||
                items.length === 0 ||
                (timing === "scheduled" && !scheduleReady)
              }
            >
              {busy ? "Submitting…" : "Submit order"}
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      </form>
    </>
  );
}
