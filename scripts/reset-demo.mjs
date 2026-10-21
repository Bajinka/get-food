import { spawnSync } from "node:child_process";
if (
  process.env.ALLOW_DEMO_RESET !== "true" ||
  process.env.NODE_ENV === "production" ||
  !process.argv.includes("--local")
) {
  console.error(
    "Refusing reset. Local development only: set ALLOW_DEMO_RESET=true and pass --local.",
  );
  process.exit(1);
}
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["supabase", "db", "reset", "--local"], {
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
