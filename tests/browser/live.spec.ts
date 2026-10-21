import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
const tenant = "10000000-0000-4000-8000-000000000001";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const accounts: Record<string, { email: string; password: string }> = {};
test.beforeAll(async () => {
  expect(new URL(url).hostname).toBe("127.0.0.1");
  for (const role of ["owner", "kitchen"]) {
    const email = `browser-${role}-${randomUUID()}@example.test`,
      password = randomBytes(24).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    const membership = await admin
      .from("staff_memberships")
      .insert({ restaurant_id: tenant, user_id: data.user!.id, role });
    expect(membership.error).toBeNull();
    accounts[role] = { email, password };
  }
  const hours = await admin
    .from("restaurant_hours")
    .update({ opens: "00:00", closes: "23:59:59" })
    .eq("restaurant_id", tenant);
  expect(hours.error).toBeNull();
});
test.afterAll(async () => {
  await admin
    .from("restaurant_hours")
    .update({ opens: "09:00", closes: "22:00" })
    .eq("restaurant_id", tenant);
});
test("customer order, owner acceptance, cash receipt and kitchen service", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.goto("/menu");
  await page.getByRole("searchbox", { name: "Search dishes" }).fill("Benachin");
  await expect(
    page.getByRole("heading", { name: "Benachin", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View dish →" }).click();
  await page.getByRole("checkbox", { name: /Extra vegetables/ }).check();
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page).toHaveURL("/cart");
  await page.getByRole("link", { name: "Edit meal" }).click();
  await expect(page.getByRole("spinbutton", { name: "Quantity" })).toHaveValue(
    "2",
  );
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("3");
  await page.getByLabel("Special instructions").fill("No chilli");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Quantity" })).toHaveValue(
    "3",
  );
  await page.getByRole("link", { name: "Continue to checkout →" }).click();
  await page.getByLabel("Your name").fill("Browser test guest");
  await page.getByLabel("Phone", { exact: true }).fill("+2201234567");
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.getByRole("button", { name: "Submit order" }).click();
  await expect(page).toHaveURL(/\/order\/[a-f0-9]{64}$/);
  const heading = await page
    .getByRole("heading", { name: /Order #/ })
    .innerText();
  const number = Number(heading.match(/\d+/)![0]);
  const record = await admin
    .from("orders")
    .select("id,total,status")
    .eq("number", number)
    .single();
  expect(record.error).toBeNull();
  expect(Number(record.data!.total)).toBe(870);
  const id = record.data!.id;
  const status = async () => {
    const { data } = await admin
      .from("orders")
      .select("status")
      .eq("id", id)
      .single();
    return data?.status;
  };
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await owner.goto("/login");
  await owner.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await owner
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await owner.getByRole("button", { name: "Sign in securely" }).click();
  await expect(owner).toHaveURL("/restaurant/dashboard");
  await owner.goto("/restaurant/orders");
  const order = owner.locator("article").filter({
    has: owner.getByRole("heading", { name: `#${number}`, exact: true }),
  });
  await order.getByLabel("Update status").selectOption("accepted");
  await order
    .locator('form:has(select[name="status"])')
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect.poll(status).toBe("accepted");
  await owner.goto("/restaurant/payments");
  const payment = owner
    .locator("section")
    .filter({
      has: owner.getByRole("heading", {
        name: `Order #${number}`,
        exact: true,
      }),
    })
    .last();
  await payment.getByLabel("Decision").selectOption("verified");
  await payment.getByRole("button", { name: "Save", exact: true }).click();
  await expect(payment.getByRole("status")).toHaveText("Saved successfully.");
  const kitchenContext = await browser.newContext();
  const kitchen = await kitchenContext.newPage();
  await kitchen.goto("/login");
  await kitchen
    .getByLabel("Email", { exact: true })
    .fill(accounts.kitchen.email);
  await kitchen
    .getByLabel("Password", { exact: true })
    .fill(accounts.kitchen.password);
  await kitchen.getByRole("button", { name: "Sign in securely" }).click();
  await expect(kitchen).toHaveURL("/restaurant/dashboard");
  await kitchen.goto("/restaurant/kitchen");
  const ticket = kitchen.locator("article").filter({
    has: kitchen.getByRole("heading", { name: `#${number}`, exact: true }),
  });
  await expect(ticket.getByText("No chilli")).toBeVisible();
  await ticket
    .getByRole("button", { name: "Start preparation", exact: true })
    .click();
  await expect.poll(status).toBe("preparing");
  await ticket.getByRole("button", { name: "Mark ready", exact: true }).click();
  await expect.poll(status).toBe("ready");
  await kitchen.goto("/restaurant/payments");
  await expect(
    kitchen.getByText("You do not have access to this section."),
  ).toBeVisible();
  await owner.goto("/restaurant/orders");
  const ready = owner.locator("article").filter({
    has: owner.getByRole("heading", { name: `#${number}`, exact: true }),
  });
  await ready.getByLabel("Update status").selectOption("completed");
  await ready
    .locator('form:has(select[name="status"])')
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect.poll(status).toBe("completed");
  await page.reload();
  await expect(
    page.getByText("completed", { exact: true }).first(),
  ).toBeVisible();
  await ownerContext.close();
  await kitchenContext.close();
});
