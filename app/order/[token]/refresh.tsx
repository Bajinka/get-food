"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
export default function Refresh({ token }: { token: string }) {
  const router = useRouter();
  useEffect(() => {
    const client = browserClient();
    let channel: ReturnType<typeof client.channel> | undefined;
    let stopped = false;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    void crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(token))
      .then((hash) => {
        if (stopped) return;
        const topic = Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        channel = client
          .channel("guest:" + topic)
          .on("broadcast", { event: "order_changed" }, () => router.refresh())
          .subscribe();
      });
    return () => {
      stopped = true;
      clearInterval(id);
      if (channel) void client.removeChannel(channel);
    };
  }, [router, token]);
  return (
    <p className="muted" role="status">
      Live tracking enabled · refreshes every 15 seconds if disconnected.
    </p>
  );
}
