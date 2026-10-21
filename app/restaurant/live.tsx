"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
export default function Live({ restaurant }: { restaurant: string }) {
  const router = useRouter();
  useEffect(() => {
    const client = browserClient();
    const channel = client
      .channel("staff-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurant}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    const timer = setInterval(() => router.refresh(), 30000);
    return () => {
      clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [restaurant, router]);
  return (
    <p className="muted">
      Live order updates · automatic refresh fallback enabled.
    </p>
  );
}
