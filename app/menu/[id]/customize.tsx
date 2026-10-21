"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dish } from "@/lib/menu";
import { currentPrice, readCart, saveCart } from "@/lib/cart";
import { money } from "@/lib/money";
export default function Customize({
  dish,
  editKey,
}: {
  dish: Dish;
  editKey?: string;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (editKey) {
      const item = readCart().find(
        (i) => i.key === editKey && i.id === dish.id,
      );
      if (item) {
        setOptions(item.options);
        setQuantity(item.quantity);
        setInstructions(item.instructions);
      }
    }
  }, [editKey, dish.id]);
  return (
    <div className="card">
      <span className="eyebrow">Your meal, your way</span>
      <h1 style={{ fontSize: 48 }}>{dish.name}</h1>
      <p>{dish.description}</p>
      {dish.image_url && (
        <Image
          width={960}
          height={640}
          sizes="(max-width:600px) 100vw, 480px"
          style={{ maxWidth: 480, width: "100%", borderRadius: 20 }}
          src={dish.image_url}
          alt={dish.name}
        />
      )}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          for (const g of dish.menu_option_groups) {
            const n = g.menu_options.filter((o) =>
              options.includes(o.id),
            ).length;
            if (n < g.min_choices || n > g.max_choices) {
              setError(
                `Choose ${g.min_choices}–${g.max_choices} options for ${g.name}.`,
              );
              return;
            }
          }
          try {
            const cart = readCart();
            const editing = cart.some(
              (i) => i.key === editKey && i.id === dish.id,
            );
            const item = {
              key: editing ? editKey! : crypto.randomUUID(),
              id: dish.id,
              name: dish.name,
              quantity,
              options,
              instructions,
              unitPrice: currentPrice(dish, options),
            };
            saveCart(
              editing
                ? cart.map((i) => (i.key === editKey ? item : i))
                : [...cart, item],
            );
            router.push("/cart");
          } catch {
            setError(
              "Your browser could not save the cart. Enable local storage and try again.",
            );
          }
        }}
      >
        {dish.menu_option_groups.map((g) => (
          <fieldset key={g.id} className="card">
            <legend>
              {g.name} · choose {g.min_choices}–{g.max_choices}
            </legend>
            {g.menu_options
              .filter((o) => o.available)
              .map((o) => (
                <label
                  key={o.id}
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <input
                    style={{ width: "auto" }}
                    type="checkbox"
                    checked={options.includes(o.id)}
                    onChange={(e) =>
                      setOptions(
                        e.target.checked
                          ? [...options, o.id]
                          : options.filter((x) => x !== o.id),
                      )
                    }
                  />
                  {o.name} +{money(o.price)}
                </label>
              ))}
          </fieldset>
        ))}
        <label>
          Quantity
          <input
            type="number"
            min="1"
            max="50"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
          />
        </label>
        <label>
          Special instructions
          <textarea
            maxLength={500}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={!dish.available}>
          {dish.available
            ? `Add to cart · ${money(currentPrice(dish, options) * quantity)}`
            : "Currently unavailable"}
        </button>
      </form>
    </div>
  );
}
