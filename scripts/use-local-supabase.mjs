// Writes only ignored local configuration. Never prints keys or replaces user files.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env.local"))
  throw new Error(
    ".env.local already exists; preserve it and configure local Supabase manually.",
  );
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["supabase", "status", "-o", "json"],
  { encoding: "utf8", shell: false },
);
if (result.status !== 0)
  throw new Error(
    "Local Supabase is not ready; status output was withheld to protect credentials.",
  );
const status = JSON.parse(result.stdout);
const url = status.API_URL;
if (!url || new URL(url).hostname !== "127.0.0.1")
  throw new Error("Expected a loopback local Supabase URL.");
const anon = status.ANON_KEY,
  service = status.SERVICE_ROLE_KEY;
if (!anon || !service)
  throw new Error("Local Supabase did not provide the required key bindings.");
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Created ignored .env.local for local Supabase. Credential values were not printed.",
);
