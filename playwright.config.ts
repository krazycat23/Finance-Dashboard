import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/runtime", fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:4178", headless: true, actionTimeout: 10000 },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4178", url: "http://127.0.0.1:4178", reuseExistingServer: true },
});
