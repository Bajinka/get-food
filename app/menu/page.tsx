import { loadMenu } from "@/lib/menu";
import Menu from "./menu";
export const dynamic = "force-dynamic";
export default async function MenuPage() {
  const data = await loadMenu();
  return (
    <>
      <span className="eyebrow">Made fresh, made with care</span>
      <h1 style={{ fontSize: 48 }}>Find your next favourite.</h1>
      {data.error ? (
        <p className="notice">{data.error}</p>
      ) : (
        <Menu items={data.items} categories={data.categories} />
      )}
    </>
  );
}
