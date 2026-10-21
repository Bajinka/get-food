import { test, expect } from "@playwright/test";
test("availability API validates dates and cart identifiers", async ({
  request,
}) => {
  const invalidDate = await request.get(
    "/api/availability?date=2026-02-30&items=30000000-0000-4000-8000-000000000001",
  );
  expect(invalidDate.status()).toBe(400);
  const invalidCart = await request.get(
    "/api/availability?date=2026-10-22&items=not-a-uuid",
  );
  expect(invalidCart.status()).toBe(400);
  const oversizedCart = await request.get(
    "/api/availability?" +
      new URLSearchParams({
        date: "2026-10-22",
        items: Array(31).fill("30000000-0000-4000-8000-000000000001").join(","),
      }),
  );
  expect(oversizedCart.status()).toBe(400);
  expect(oversizedCart.headers()["cache-control"]).toBe("no-store");
});
test("cart quantities, persistence, and removal", async ({ page }) => {
  await page.goto("/cart");
  await page.evaluate(() =>
    localStorage.setItem(
      "get-food-cart",
      JSON.stringify([
        {
          key: "fixture-line",
          id: "30000000-0000-4000-8000-000000000001",
          name: "Benachin",
          quantity: 1,
          options: [],
          instructions: "No chilli",
          unitPrice: 250,
        },
      ]),
    ),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Benachin" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("3");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("get-food-cart") || "[]")[0].quantity,
    ),
  ).toBe(3);
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Quantity" })).toHaveValue(
    "3",
  );
  await page.getByRole("button", { name: "Remove Benachin" }).click();
  await expect(page.getByText("Your basket is empty.")).toBeVisible();
});
test("homepage, keyboard navigation, and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A taste of home/ }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: /GET.*FOOD/ }).first(),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Explore the menu ↗" }).click();
  await expect(
    page.getByRole("heading", { name: "Find your next favourite." }),
  ).toBeVisible();
});
test("empty cart is honest and links to menu", async ({ page }) => {
  await page.goto("/cart");
  await expect(page.getByText("Your basket is empty.")).toBeVisible();
  await page
    .getByRole("link", { name: "Explore the menu", exact: true })
    .click();
  await expect(page).toHaveURL("/menu");
});
test("staff route requires authentication", async ({ page }) => {
  await page.goto("/restaurant/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("invalid QR and tracking capabilities fail safely", async ({ page }) => {
  await page.goto("/scan/invalid");
  await expect(page.getByText(/unavailable or has been revoked/)).toBeVisible();
  const response = await page.goto("/order/invalid");
  expect(response?.status()).toBe(404);
});
test("server rejects cross-origin signout", async ({ request }) => {
  const result = await request.post("/auth/signout", {
    headers: { origin: "https://untrusted.example" },
  });
  expect(result.status()).toBe(403);
});
