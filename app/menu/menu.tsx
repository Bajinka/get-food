"use client";
import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import type { Dish } from "@/lib/menu";
import { money } from "@/lib/money";
export default function Menu({
  items,
  categories,
}: {
  items: Dish[];
  categories: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  return (
    <>
      <div className="row">
        <label style={{ flex: 1 }}>
          Search dishes
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="What are you craving?"
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All dishes</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid">
        {items
          .filter(
            (i) =>
              (!category || i.category_id === category) &&
              `${i.name} ${i.description}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .map((i) => (
            <article className="card" key={i.id}>
              {i.image_url && (
                <Image
                  width={640}
                  height={400}
                  sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                  src={i.image_url}
                  alt={i.name}
                  loading="lazy"
                />
              )}
              <span className="pill">
                {i.available ? "Freshly prepared" : "Currently unavailable"}
              </span>
              <h2>{i.name}</h2>
              <p className="muted">{i.description}</p>
              <div className="row">
                <span className="price">{money(i.price)}</span>
                <Link className="button" href={"/menu/" + i.id}>
                  View dish →
                </Link>
              </div>
            </article>
          ))}
      </div>
      {items.length === 0 && (
        <p className="notice">The restaurant has not added any dishes yet.</p>
      )}
    </>
  );
}
