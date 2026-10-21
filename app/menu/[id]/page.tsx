import { notFound } from "next/navigation";
import { loadMenu } from "@/lib/menu";
import Customize from "./customize";
export const dynamic = "force-dynamic";
export default async function Details({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const data = await loadMenu();
  if (data.error) return <p className="notice">{data.error}</p>;
  const dish = data.items.find((i) => i.id === id);
  if (!dish) notFound();
  const { edit } = await searchParams;
  return <Customize dish={dish} editKey={edit} />;
}
