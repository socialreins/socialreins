import { expect, test } from "@playwright/test";

// The root layout streams (it reads the nonce from headers), so next/font's font preloads used to be
// injected after hydration, by which time the render-blocking stylesheet's @font-face rules had already
// started the same font loads, and production consoles flagged both woff2 preloads as unused. Fonts load
// through the stylesheet now, so a page may preload only what it really uses.
const publicPages = ["/login", "/"];

test("public pages preload only resources the page uses", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.route("**/auth/providers", (route) => route.fulfill({ json: { google: true } }));

  for (const path of publicPages) {
    await page.goto(path);
    // No font preloads: the stylesheet's @font-face rules load the fonts, and a late preload only
    // duplicated those requests.
    await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(0);

    // Everything the page still preloads must be a resource it fetched.
    const preloads = await page
      .locator('link[rel="preload"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")).filter((h): h is string => h !== null));
    expect(preloads.length).toBeGreaterThan(0);
    const fetched = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname));
    for (const href of preloads) expect(fetched).toContain(new URL(href, "http://localhost:3000").pathname);
  }
});
