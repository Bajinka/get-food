"use client";
import Link from "next/link";
import { useEffect } from "react";
export default function Scan({
  token,
  table,
}: {
  token: string;
  table: string | null;
}) {
  useEffect(() => {
    sessionStorage.setItem("get-food-qr", token);
  }, [token]);
  return (
    <section className="card">
      <h1 style={{ fontSize: 40 }}>Welcome to GET-FOOD.</h1>
      <p>
        {table
          ? `Table ${table} recognized. Staff will verify table service.`
          : "Order for dine-in or takeaway."}
      </p>
      <Link className="button" href="/menu">
        Browse the menu
      </Link>
    </section>
  );
}
