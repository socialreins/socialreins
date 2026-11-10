import { defineConfig, devices } from "@playwright/test";

// Serves the production build; run `npm run build` first.
export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { BRAIN_URL: "http://localhost:8080", INDEXNOW_KEY: "e2e-indexnow-key" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
