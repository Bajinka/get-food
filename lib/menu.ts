import { configured, supabase } from "./supabase/server";
export const restaurantId = "10000000-0000-4000-8000-000000000001";
export type Option = {
  id: string;
  name: string;
  price: number;
  available: boolean;
};
export type Group = {
  id: string;
  name: string;
  min_choices: number;
  max_choices: number;
  menu_options: Option[];
};
export type Dish = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  available: boolean;
  category_id: string;
  menu_option_groups: Group[];
};
export async function loadMenu() {
  if (!configured())
    return {
      items: [] as Dish[],
      categories: [] as { id: string; name: string }[],
      error:
        "The menu is temporarily unavailable. Please contact the restaurant.",
    };
  const client = await supabase();
  const [items, categories] = await Promise.all([
    client
      .from("menu_items")
      .select("*,menu_option_groups(*,menu_options(*))")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    client
      .from("menu_categories")
      .select("id,name")
      .eq("restaurant_id", restaurantId)
      .order("position"),
  ]);
  return {
    items: (items.data ?? []) as Dish[],
    categories: categories.data ?? [],
    error:
      items.error || categories.error
        ? "The menu is temporarily unavailable. Please try again."
        : null,
  };
}
