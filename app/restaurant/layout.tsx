import { redirect } from "next/navigation";
import Link from "next/link";
import { configured, supabase } from "@/lib/supabase/server";
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!configured()) redirect("/login?error=configuration");
  const client = await supabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships, error } = await client
    .from("staff_memberships")
    .select("restaurant_id,role")
    .eq("user_id", user.id);
  if (error)
    return (
      <p className="notice">
        Unable to load staff access. Check database migrations and connectivity.
      </p>
    );
  if (!memberships?.length)
    return (
      <section className="card">
        <h2>Staff access required</h2>
        <p>
          Your account has no restaurant assignment. Ask the owner to assign a
          staff membership.
        </p>
        <form action="/auth/signout" method="post">
          <button>Sign out</button>
        </form>
      </section>
    );
  return (
    <>
      <div className="row">
        <p className="pill">Staff workspace · {memberships[0].role}</p>
        <form action="/auth/signout" method="post">
          <button>Sign out</button>
        </form>
      </div>
      <nav className="staff-nav" aria-label="Restaurant navigation">
        {[
          "dashboard",
          "orders",
          "kitchen",
          "menu",
          "tables",
          "payments",
          "reports",
          "staff",
          "settings",
        ].map((p) => (
          <Link key={p} href={"/restaurant/" + p}>
            {p[0].toUpperCase() + p.slice(1)}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
