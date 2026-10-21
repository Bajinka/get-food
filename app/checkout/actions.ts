"use server";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { restaurantId } from "@/lib/menu";
const schema = z.object({
  idempotency_key: z.uuid(),
  tracking_token: z.string().regex(/^[a-f0-9]{64}$/),
  customer_name: z.string().trim().min(1).max(100),
  phone: z.string().regex(/^\+?[0-9 ()-]{7,30}$/),
  email: z.union([z.email(), z.literal("")]),
  instructions: z.string().max(1000),
  service_type: z.enum(["dine_in", "takeaway"]),
  timing: z.enum(["now", "scheduled"]),
  requested_at: z.string().max(50),
  payment_method: z.enum(["cash", "wave", "afrimoney"]),
  reference: z.string().trim().max(100),
  qr_token: z.string().max(64),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        quantity: z.number().int().min(1).max(50),
        options: z.array(z.uuid()).max(30),
        instructions: z.string().max(500),
      }),
    )
    .min(1)
    .max(30),
});
export async function checkout(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tracking_token, ...payload } = parsed.data;
  if (
    payload.timing === "scheduled" &&
    (payload.payment_method === "cash" ||
      !Number.isFinite(Date.parse(payload.requested_at)))
  )
    return {
      ok: false,
      error:
        "Pre-orders need a valid future time and advance mobile-money payment.",
    };
  try {
    const h = await headers();
    // Vercel overwrites x-vercel-forwarded-for; elsewhere use a shared conservative bucket.
    const ip = process.env.VERCEL
      ? h.get("x-vercel-forwarded-for") || "unknown"
      : "local-development";
    const bucket = createHash("sha256").update(ip).digest("hex");
    const service = admin();
    const budget = await service.rpc("checkout_budget", {
      client_bucket: bucket,
    });
    if (budget.error || !budget.data)
      return {
        ok: false,
        error: "Too many checkout attempts. Please try again in 10 minutes.",
      };
    const { error } = await service.rpc("place_order", {
      payload: { ...payload, restaurant_id: restaurantId },
      tracking_token,
      client_bucket: bucket,
    });
    if (error) {
      if (error.code === "23505")
        return {
          ok: false,
          error: "This payment reference has already been submitted.",
        };
      return {
        ok: false,
        error: ["P0001", "P0002"].includes(error.code)
          ? error.message
          : "We could not submit the order. Check availability and try again.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Ordering is unavailable. Please contact the restaurant.",
    };
  }
}
