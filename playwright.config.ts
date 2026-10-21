import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch:
    process.env.GET_FOOD_INTEGRATION === "1"
      ? "**/live.spec.ts"
      : "**/public.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    launchOptions: process.env.CI_CHROMIUM_PATH
      ? { executablePath: process.env.CI_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
