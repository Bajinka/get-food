import type { Dish } from "./menu";
export type CartItem = {
  key: string;
  id: string;
  name: string;
  quantity: number;
  options: string[];
  instructions: string;
  unitPrice: number;
};
export function readCart(): CartItem[] {
  try {
    const value = JSON.parse(localStorage.getItem("get-food-cart") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
export function saveCart(items: CartItem[]) {
  localStorage.setItem("get-food-cart", JSON.stringify(items));
}
export function currentPrice(dish: Dish, options: string[]) {
  return (
    Number(dish.price) +
    dish.menu_option_groups
      .flatMap((g) => g.menu_options)
      .filter((o) => options.includes(o.id))
      .reduce((sum, o) => sum + Number(o.price), 0)
  );
}
