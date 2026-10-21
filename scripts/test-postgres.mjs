import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
const name = `get-food-policy-test-${process.pid}`;
function run(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Docker command failed");
  return result;
}
try {
  run([
    "run",
    "-d",
    "--name",
    name,
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=get_food_test",
    "postgres:15-alpine",
  ]);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (
      spawnSync("docker", [
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
      ]).status === 0
    ) {
      ready = true;
      break;
    }
    await setTimeout(500);
  }
  if (!ready) throw new Error("PostgreSQL did not become ready");
  const sql = [
    "tests/platform-fixture.sql",
    ...readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => "supabase/migrations/" + f),
    "supabase/seed.sql",
    "supabase/seed.sql",
    "tests/policies.sql",
    "tests/availability.sql",
    "tests/preparation.sql",
  ]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const result = run(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-h",
      "127.0.0.1",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "get_food_test",
    ],
    sql,
  );
  const lines = result.stderr.split("\n").filter((l) => l.includes("PASS:"));
  lines.forEach((l) => console.log(l.replace(/^NOTICE:\s*/, "")));
  console.log(
    `${lines.length} PostgreSQL assertions passed. Auth/Storage/Realtime interfaces use explicit test fixtures; real-service tests are separate.`,
  );
} finally {
  spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}
