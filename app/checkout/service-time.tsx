"use client";
import { useEffect, useState } from "react";
export default function ServiceTime({
  itemIds,
  onReady,
}: {
  itemIds: string[];
  onReady: (ready: boolean) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const ids = [...new Set(itemIds)].sort().join(",");
  useEffect(() => {
    const controller = new AbortController();
    setSelected("");
    setSlots([]);
    setError("");
    onReady(false);
    if (!day || !ids) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    void (async () => {
      try {
        const query = new URLSearchParams({ date: day, items: ids });
        const response = await fetch("/api/availability?" + query, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Availability unavailable");
        const result = await response.json();
        if (
          !Array.isArray(result.slots) ||
          !result.slots.every(
            (v: unknown) =>
              typeof v === "string" && Number.isFinite(Date.parse(v)),
          )
        )
          throw new Error("Invalid availability");
        if (!controller.signal.aborted) setSlots(result.slots);
      } catch {
        if (!controller.signal.aborted)
          setError("Unable to load service times. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [day, ids, refresh, onReady]);
  return (
    <div className="stack">
      <label>
        Service date (The Gambia)
        <input
          type="date"
          min={today}
          max={maxDate}
          value={day}
          required
          onChange={(e) => {
            setDay(e.target.value);
            setSelected("");
            onReady(false);
          }}
        />
      </label>
      <label>
        Available service time
        <select
          name="requested_at"
          value={selected}
          required
          disabled={loading || !!error || slots.length === 0}
          onChange={(e) => {
            setSelected(e.target.value);
            onReady(slots.includes(e.target.value));
          }}
        >
          <option value="">
            {loading ? "Loading available times…" : "Choose a service time"}
          </option>
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {new Date(slot).toLocaleTimeString("en-GB", {
                timeZone: "Africa/Banjul",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </option>
          ))}
        </select>
      </label>
      {loading && <p role="status">Checking available times…</p>}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !loading && day && ids && slots.length === 0 ? (
        <p role="status">
          No service times are available on this date. Please choose another
          day.
        </p>
      ) : null}
      <button
        type="button"
        disabled={loading}
        onClick={() => setRefresh((n) => n + 1)}
      >
        Refresh service times
      </button>
      <small>
        All times are in The Gambia. Availability includes your meals’
        preparation time. Your place is reserved only when the order is
        submitted.
      </small>
    </div>
  );
}
