import { supabase, configured } from "@/lib/supabase/server";
import Scan from "./scan";
export const dynamic = "force-dynamic";
export const metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function ScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token) || !configured())
    return (
      <p className="notice">This QR code is unavailable or has been revoked.</p>
    );
  const client = await supabase();
  const { data, error } = await client.rpc("resolve_qr", { token });
  if (error || !data)
    return (
      <p className="notice">
        This QR code is unavailable or has been revoked. Ask restaurant staff
        for a new code.
      </p>
    );
  return <Scan token={token} table={data.table_number} />;
}
