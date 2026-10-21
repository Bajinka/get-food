import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { configured, supabase } from "@/lib/supabase/server";
import { restaurantId } from "@/lib/menu";
export const dynamic = "force-dynamic";
const querySchema = z.object({
  date: z.iso.date(),
  items: z.array(z.uuid()).min(1).max(30),
});
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const raw = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    date: raw.get("date"),
    items: (raw.get("items") || "").split(","),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a valid date and cart." },
      { status: 400, headers },
    );
  if (!configured())
    return NextResponse.json(
      { error: "Service times are temporarily unavailable." },
      { status: 503, headers },
    );
  try {
    const client = await supabase();
    const { data, error } = await client.rpc("available_service_times", {
      tenant: restaurantId,
      service_day: parsed.data.date,
      item_ids: parsed.data.items,
    });
    if (error)
      return NextResponse.json(
        { error: "Service times are temporarily unavailable." },
        { status: 503, headers },
      );
    return NextResponse.json(
      {
        slots: (data ?? []).map(
          (row: { service_time: string }) => row.service_time,
        ),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Service times are temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
