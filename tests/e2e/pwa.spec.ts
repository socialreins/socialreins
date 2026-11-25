import { expect, test } from "@playwright/test";

// The service worker is blocked in the other specs (playwright.config.ts); these turn it on.
test.use({ serviceWorkers: "allow" });

test("the manifest and its icons are served and make the app installable", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const m = await res.json();
  expect(m).toMatchObject({ id: "/", name: "SocialReins", short_name: "SocialReins", start_url: "/home", scope: "/", display: "standalone" });
  expect(m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  expect(m.shortcuts.map((s: { name: string }) => s.name)).toEqual(["Compose", "Calendar", "Inbox"]);
  for (const src of [...m.icons, ...m.shortcuts.flatMap((s: { icons: unknown[] }) => s.icons)].map((i: { src: string }) => i.src)) {
    const icon = await request.get(src);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()["content-type"]).toBe("image/png");
  }
  expect((await request.get("/apple-icon.png")).status()).toBe(200);

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);

  // Chrome's own installability check (the same one that decides whether the install button shows).
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
});

test("the service worker controls the page and answers an offline page load with the offline page", async ({ page, context }) => {
  await page.goto("/pricing");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // clients.claim() in the worker's activate step takes control without a reload.
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Playwright's offline switch does not reach a worker's own requests, so make the worker's fetch fail the way a lost connection does.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => {
    self.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  });
  for (const path of ["/pricing", "/home", "/t/abc123/posts"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  }
});

test("the service worker caches only the offline page and the icons, never a page, the app or an API answer", async ({ page }) => {
  await page.route("http://localhost:8080/**", (route) => route.fulfill({ json: { user: null }, status: 401 }));
  for (const path of ["/", "/pricing", "/login", "/t/abc123/posts"]) await page.goto(path);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const cached = await page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });
  expect(cached).toEqual({ "sr-shell-v1": ["/offline.html", "/icon-192.png", "/icon-512.png"] });
});

test("the worker and the offline page keep the site's security headers", async ({ request }) => {
  for (const path of ["/sw.js", "/offline.html"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-security-policy"], path).toContain("default-src 'self'");
    expect(res.headers()["x-content-type-options"], path).toBe("nosniff");
  }
  expect((await request.get("/sw.js")).headers()["content-type"]).toMatch(/javascript/);
});

test("the account menu offers Install app only once the browser offers it, and runs the browser's prompt", async ({ page }) => {
  const team = { id: "t1", name: "Acme", code: "acme22", role: "owner" };
  await page.route("**/auth/me", (route) => route.fulfill({ json: { id: "u1", email: "me@example.com", name: "Mira", username: null, current_team: team } }));
  await page.route("**/auth/passkeys", (route) => route.fulfill({ json: [{ id: "k1", name: "Phone", created_at: "2026-10-01T10:00:00Z", last_used_at: null }] }));
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [team] }));
  await page.route(/\/v1\/(posts|social-sets|lists|connections)(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto("/posts");
  const account = page.locator("aside button[data-account]:visible");
  await account.click();
  const menu = page.locator(".account-menu");
  await expect(menu.getByRole("link", { name: "Profile" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Install app" })).toHaveCount(0);
  await account.click();

  // Chrome and Edge fire this event when the app can be installed.
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(e, { prompt: async () => ((window as unknown as { prompted: boolean }).prompted = true) });
    dispatchEvent(e);
  });
  await account.click();
  await menu.getByRole("button", { name: "Install app" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  // The offer works once, so the item goes away.
  await expect(menu.getByRole("button", { name: "Install app" })).toHaveCount(0);
});
