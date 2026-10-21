import Image from "next/image";
import Link from "next/link";
import { configured, supabase } from "@/lib/supabase/server";
import { loadMenu, restaurantId } from "@/lib/menu";
import { money } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function Home() {
  const menu = await loadMenu();
  let restaurant: {
    name: string;
    description: string;
    address: string;
    phone: string;
  } | null = null;
  let hours: { weekday: number; opens: string; closes: string }[] = [];
  if (configured()) {
    const client = await supabase();
    const [profile, schedule] = await Promise.all([
      client
        .from("restaurants")
        .select("name,description,address,phone")
        .eq("id", restaurantId)
        .single(),
      client
        .from("restaurant_hours")
        .select("weekday,opens,closes")
        .eq("restaurant_id", restaurantId)
        .order("weekday"),
    ]);
    restaurant = profile.data;
    hours = schedule.data || [];
  }

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Fresh flavours. Gambian hospitality.</div>
        <h1>
          A taste of home.
          <br />
          Made for you.
        </h1>
        <p>
          Welcome to GET-FOOD Demo Restaurant. Discover local favourites,
          freshly prepared and full of flavour.
        </p>
        <div
          className="row"
          style={{ justifyContent: "flex-start", marginTop: 28 }}
        >
          <Link className="button orange" href="/menu">
            Explore the menu ↗
          </Link>
          <Link href="/checkout?timing=scheduled">Plan a pre-order →</Link>
        </div>
      </section>
      {!configured() && (
        <p className="notice">
          Online ordering is currently unavailable. Please contact the
          restaurant.
        </p>
      )}
      {menu.items.length > 0 && (
        <section>
          <div className="row">
            <h2>Local favourites, freshly prepared.</h2>
            <Link href="/menu">See the full menu →</Link>
          </div>
          <div className="grid">
            {menu.items
              .filter((i) => i.available)
              .slice(0, 3)
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
                  <h2>{i.name}</h2>
                  <p>{i.description}</p>
                  <div className="row">
                    <span className="price">{money(i.price)}</span>
                    <Link className="button" href={"/menu/" + i.id}>
                      Choose your meal
                    </Link>
                  </div>
                </article>
              ))}
          </div>
          <nav aria-label="Food categories">
            {menu.categories.map((c) => (
              <Link key={c.id} href="/menu">
                {c.name}
              </Link>
            ))}
          </nav>
        </section>
      )}
      <div className="grid">
        <section className="card">
          <span className="eyebrow">01 / Discover</span>
          <h2>
            Your favourites,
            <br />a scan away.
          </h2>
          <p>Browse the menu from your phone or scan a restaurant QR code.</p>
        </section>
        <section className="card">
          <span className="eyebrow">02 / Choose</span>
          <h2>
            Dine in.
            <br />
            Or take it with you.
          </h2>
          <p>Choose your meal, customize it, and select your service time.</p>
        </section>
        <section className="card">
          <span className="eyebrow">03 / Enjoy</span>
          <h2>
            Good food.
            <br />
            No guesswork.
          </h2>
          <p>
            Follow your order as the restaurant accepts and prepares your meal.
          </p>
        </section>
      </div>
      <section className="card">
        <h2>{restaurant?.name || "GET-FOOD Demo Restaurant"}</h2>
        <p>
          {restaurant?.description ||
            "A fictional demonstration restaurant in The Gambia."}{" "}
          Prices are in Gambian dalasi (GMD).
        </p>
        {restaurant?.address && <p>{restaurant.address}</p>}
        {restaurant?.phone && (
          <p>
            <a href={"tel:" + restaurant.phone}>Call {restaurant.phone}</a>
          </p>
        )}
        {hours.length > 0 && (
          <>
            <h3>Opening hours · The Gambia</h3>
            <ul>
              {hours.map((h) => (
                <li key={h.weekday}>
                  {
                    [
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ][h.weekday]
                  }
                  : {h.opens.slice(0, 5)}–{h.closes.slice(0, 5)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
