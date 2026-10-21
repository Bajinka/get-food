import { supabase } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return new NextResponse("Forbidden", { status: 403 });
  const client = await supabase();
  await client.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
