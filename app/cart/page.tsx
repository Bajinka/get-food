"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { readCart, saveCart, type CartItem } from "@/lib/cart";
import { money } from "@/lib/money";
export default function Cart() {
  const [items, setItems] = useState<CartItem[] | null>(null);
  useEffect(() => setItems(readCart()), []);
  function update(next: CartItem[]) {
    saveCart(next);
    setItems(next);
  }
  return (
    <>
      <h1 style={{ fontSize: 48 }}>Your basket.</h1>
      {items === null ? (
        <p role="status">Loading your basket…</p>
      ) : items.length === 0 ? (
        <section className="card">
          <p>Your basket is empty.</p>
          <Link className="button" href="/menu">
            Explore the menu
          </Link>
        </section>
      ) : (
        <>
          <div className="stack">
            {items.map((i) => (
              <article className="card row" key={i.key}>
                <div>
                  <h2>{i.name}</h2>
                  <p>{i.instructions}</p>
                  <span>{money(i.unitPrice)} each</span>
                </div>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={i.quantity}
                    onChange={(e) =>
                      update(
                        items.map((x) =>
                          x.key === i.key
                            ? {
                                ...x,
                                quantity: Math.max(
                                  1,
                                  Math.min(50, Number(e.target.value)),
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <strong>{money(i.unitPrice * i.quantity)}</strong>
                <button
                  onClick={() => update(items.filter((x) => x.key !== i.key))}
                >
                  Remove {i.name}
                </button>
                <Link
                  href={"/menu/" + i.id + "?edit=" + encodeURIComponent(i.key)}
                >
                  Edit meal
                </Link>
              </article>
            ))}
          </div>
          <div className="card row" style={{ marginTop: 24 }}>
            <div>
              <h2>
                Total{" "}
                {money(
                  items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
                )}
              </h2>
              <p className="muted">
                Prices and availability are checked at checkout.
              </p>
            </div>
            <Link className="button orange" href="/checkout">
              Continue to checkout →
            </Link>
          </div>
        </>
      )}
    </>
  );
}
