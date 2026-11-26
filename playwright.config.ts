import { defineConfig, devices } from "@playwright/test";

// Serves the production build; run `npm run build` first.
export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  // The service worker is off unless a test turns it on (tests/e2e/pwa.spec.ts): it would route page loads past page.route mocks.
  // Every test starts with the cookie banner already answered (Reject), so it never covers the page; tests/e2e/consent.spec.ts starts clean.
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    serviceWorkers: "block",
    storageState: { cookies: [{ name: "sr_consent", value: "rejected", domain: "localhost", path: "/", expires: 4102444800, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] },
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { BRAIN_URL: "http://localhost:8080", INDEXNOW_KEY: "e2e-indexnow-key", GA_MEASUREMENT_ID: "G-E2ETEST01" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
