export function money(amount: number | string) {
  return new Intl.NumberFormat("en-GM", {
    style: "currency",
    currency: "GMD",
  }).format(Number(amount));
}
