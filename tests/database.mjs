import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert(
  url && new URL(url).hostname === "127.0.0.1",
  "Database tests run against local Supabase only.",
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const anon = createClient(
  url,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  options,
);
const tenant = "10000000-0000-4000-8000-000000000001";
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS", name);
}
async function ok(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
const staff = {};
for (const role of ["owner", "manager", "cashier", "kitchen", "waiter"]) {
  const email = `test-${role}-${randomUUID()}@example.test`,
    password = randomBytes(24).toString("base64url");
  const user = await ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  await ok(
    await admin
      .from("staff_memberships")
      .insert({ restaurant_id: tenant, user_id: user.user.id, role }),
  );
  const client = createClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    options,
  );
  await ok(await client.auth.signInWithPassword({ email, password }));
  staff[role] = { client, id: user.user.id };
}
const token = () => randomBytes(32).toString("hex");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const payload = () => ({
  restaurant_id: tenant,
  idempotency_key: randomUUID(),
  customer_name: "Test guest",
  phone: "+2201234567",
  email: "",
  instructions: "",
  timing: "now",
  service_type: "takeaway",
  payment_method: "cash",
  reference: "",
  requested_at: "",
  qr_token: "",
  items: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      quantity: 2,
      options: [],
      instructions: "",
    },
  ],
});
const place = (p, t = token()) =>
  admin.rpc("place_order", {
    payload: p,
    tracking_token: t,
    client_bucket: digest(randomUUID()),
  });
// Make the clock deterministic with respect to restaurant hours, not machine date.
await ok(
  await admin
    .from("restaurant_hours")
    .update({ opens: "00:00", closes: "23:59:59" })
    .eq("restaurant_id", tenant),
);
let order,
  tracking = token();
const request = payload();
await check(
  "public menu readable; guest order/payment rows denied",
  async () => {
    const menu = await ok(await anon.from("menu_items").select("id"));
    assert.equal(menu.length, 6);
    assert((await anon.from("orders").select("*")).error);
    assert((await anon.from("payments").select("*")).error);
  },
);
await check("public clients cannot bypass server checkout", async () => {
  assert(
    (
      await anon.rpc("place_order", {
        payload: request,
        tracking_token: tracking,
        client_bucket: digest("test"),
      })
    ).error,
  );
});
await check("atomic checkout uses database prices and snapshots", async () => {
  order = await ok(await place({ ...request, total: 1 }, tracking));
  // Save the exact payload for retry: client totals never influence the server.
  request.total = 1;
  const row = await ok(
    await admin.from("orders").select("total").eq("id", order.id).single(),
  );
  assert.equal(Number(row.total), 500);
  const rows = await ok(
    await admin.from("order_items").select("*").eq("order_id", order.id),
  );
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].unit_price), 250);
});
await check(
  "idempotent retry returns same order; changed request rejected",
  async () => {
    const retry = await ok(await place(request, tracking));
    assert.equal(retry.id, order.id);
    assert((await place({ ...request, phone: "+2207654321" }, tracking)).error);
  },
);
await check(
  "tracking requires unguessable capability and omits PII",
  async () => {
    const data = await ok(await anon.rpc("track_order", { token: tracking }));
    assert.equal(data.number, order.number);
    assert(!("phone" in data));
    assert.equal(
      await ok(await anon.rpc("track_order", { token: token() })),
      null,
    );
  },
);
await check("invalid options roll back order and items", async () => {
  const p = payload();
  p.items[0].options = [randomUUID()];
  assert((await place(p)).error);
  const rows = await ok(
    await admin
      .from("orders")
      .select("id")
      .eq("idempotency_key", p.idempotency_key),
  );
  assert.equal(rows.length, 0);
});
await check("cash pre-orders and closed-hour orders rejected", async () => {
  assert(
    (
      await place({
        ...payload(),
        timing: "scheduled",
        requested_at: new Date(Date.now() + 7200000).toISOString(),
      })
    ).error,
  );
  await ok(
    await admin.from("restaurant_hours").delete().eq("restaurant_id", tenant),
  );
  assert((await place(payload())).error);
  await ok(
    await admin.from("restaurant_hours").insert(
      Array.from({ length: 7 }, (_, weekday) => ({
        restaurant_id: tenant,
        weekday,
        opens: "00:00",
        closes: "23:59:59",
      })),
    ),
  );
});
await check("QR capability resolves, assigns table, and revokes", async () => {
  const qr = await ok(
    await staff.owner.client.rpc("issue_qr", {
      tenant,
      table_ref: "60000000-0000-4000-8000-000000000001",
    }),
  );
  const info = await ok(await anon.rpc("resolve_qr", { token: qr }));
  assert.equal(info.table_number, "01");
  const p = { ...payload(), service_type: "dine_in", qr_token: qr };
  const created = await ok(await place(p));
  const row = await ok(
    await admin
      .from("orders")
      .select("table_id,table_verified")
      .eq("id", created.id)
      .single(),
  );
  assert(row.table_id);
  assert.equal(row.table_verified, false);
  assert(
    (await staff.kitchen.client.rpc("verify_table", { order_ref: created.id }))
      .error,
  );
  await ok(
    await staff.waiter.client.rpc("verify_table", { order_ref: created.id }),
  );
  const code = await ok(
    await admin
      .from("qr_codes")
      .select("id")
      .eq("token_hash", digest(qr))
      .single(),
  );
  await ok(await staff.owner.client.rpc("revoke_qr", { qr_ref: code.id }));
  assert.equal(await ok(await anon.rpc("resolve_qr", { token: qr })), null);
  assert((await place({ ...payload(), qr_token: qr })).error);
});
let scheduled;
await check(
  "mobile payment stays pending; duplicate references rejected",
  async () => {
    const reference = "TEST-" + randomUUID();
    const p = {
      ...payload(),
      timing: "scheduled",
      requested_at: new Date(Date.now() + 86400000).toISOString(),
      payment_method: "wave",
      reference,
    };
    scheduled = await ok(await place(p));
    const row = await ok(
      await admin
        .from("orders")
        .select("payment_status,status")
        .eq("id", scheduled.id)
        .single(),
    );
    assert.equal(row.payment_status, "pending_verification");
    assert.equal(row.status, "pending");
    assert((await place({ ...p, idempotency_key: randomUUID() })).error);
    assert(
      (
        await staff.owner.client.rpc("change_order", {
          order_ref: scheduled.id,
          next_status: "accepted",
        })
      ).error,
    );
  },
);
await check(
  "kitchen cannot verify payments, alter prices, or see unverified pre-orders",
  async () => {
    assert(
      (
        await staff.kitchen.client.rpc("review_payment", {
          order_ref: scheduled.id,
          decision: "verified",
          reason: "",
        })
      ).error,
    );
    const changed = await staff.kitchen.client
      .from("menu_items")
      .update({ price: 1 })
      .eq("id", request.items[0].id)
      .select();
    assert(changed.error || changed.data.length === 0);
    const rows = await ok(
      await staff.kitchen.client
        .from("orders")
        .select("id")
        .eq("id", scheduled.id),
    );
    assert.equal(rows.length, 0);
  },
);
await check(
  "cashier verification precedes acceptance; future kitchen preparation blocked",
  async () => {
    await ok(
      await staff.cashier.client.rpc("review_payment", {
        order_ref: scheduled.id,
        decision: "verified",
        reason: "",
      }),
    );
    await ok(
      await staff.owner.client.rpc("change_order", {
        order_ref: scheduled.id,
        next_status: "accepted",
      }),
    );
    assert(
      (
        await staff.kitchen.client.rpc("change_order", {
          order_ref: scheduled.id,
          next_status: "preparing",
        })
      ).error,
    );
  },
);
await check("order transitions and cash receipt gate completion", async () => {
  assert(
    (
      await staff.kitchen.client.rpc("change_order", {
        order_ref: order.id,
        next_status: "ready",
      })
    ).error,
  );
  await ok(
    await staff.manager.client.rpc("change_order", {
      order_ref: order.id,
      next_status: "accepted",
    }),
  );
  await ok(
    await staff.kitchen.client.rpc("change_order", {
      order_ref: order.id,
      next_status: "preparing",
    }),
  );
  await ok(
    await staff.kitchen.client.rpc("change_order", {
      order_ref: order.id,
      next_status: "ready",
    }),
  );
  assert(
    (
      await staff.waiter.client.rpc("change_order", {
        order_ref: order.id,
        next_status: "completed",
      })
    ).error,
  );
  await ok(
    await staff.cashier.client.rpc("review_payment", {
      order_ref: order.id,
      decision: "verified",
      reason: "",
    }),
  );
  await ok(
    await staff.waiter.client.rpc("change_order", {
      order_ref: order.id,
      next_status: "completed",
    }),
  );
});
await check("tenant isolation and last-owner protection", async () => {
  const other = await ok(
    await admin
      .from("restaurants")
      .insert({ slug: "test-" + randomUUID(), name: "Other tenant" })
      .select()
      .single(),
  );
  await ok(
    await admin.from("restaurant_settings").insert({ restaurant_id: other.id }),
  );
  const result = await staff.owner.client
    .from("restaurant_settings")
    .update({ slot_capacity: 1 })
    .eq("restaurant_id", other.id)
    .select();
  assert(result.error || result.data.length === 0);
  assert(
    (
      await staff.owner.client.rpc("remove_staff", {
        tenant,
        member: staff.owner.id,
      })
    ).error,
  );
  assert(
    (
      await staff.manager.client.rpc("set_staff", {
        tenant,
        member: staff.kitchen.id,
        assigned_role: "owner",
      })
    ).error,
  );
});
await check("sensitive changes recorded in audit log", async () => {
  const rows = await ok(
    await staff.owner.client
      .from("audit_logs")
      .select("action")
      .eq("entity_id", order.id),
  );
  assert(rows.some((x) => x.action === "payment.verified"));
  assert(rows.filter((x) => x.action === "order.status").length >= 4);
});
await check("distributed checkout budget persists across calls", async () => {
  const client_bucket = digest(randomUUID());
  for (let i = 0; i < 20; i++)
    assert.equal(
      await ok(await admin.rpc("checkout_budget", { client_bucket })),
      true,
    );
  assert.equal(
    await ok(await admin.rpc("checkout_budget", { client_bucket })),
    false,
  );
});
await ok(
  await admin
    .from("restaurant_hours")
    .update({ opens: "09:00", closes: "22:00" })
    .eq("restaurant_id", tenant),
);
console.log(`${passed} database integration checks passed.`);
