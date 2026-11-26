import { expect, test, type Page } from "@playwright/test";

// Google Analytics loads only after Accept. Every other test starts with Reject already chosen (playwright.config.ts).
test.use({ storageState: { cookies: [], origins: [] } });

const google = /googletagmanager\.com|google-analytics\.com/;

// Answers Google's hosts with an empty script and records each address asked for.
async function watchGoogle(page: Page) {
  const hits: string[] = [];
  await page.route(google, (route) => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  return hits;
}

const banner = (page: Page) => page.getByRole("region", { name: "Cookie choice" });
const consentCookie = async (page: Page) => (await page.context().cookies()).find((c) => c.name === "sr_consent");

test("nothing is loaded from Google before a choice, and the banner asks with equal buttons", async ({ page }) => {
  const hits = await watchGoogle(page);
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  const [reject, accept] = [banner(page).getByRole("button", { name: "Reject" }), banner(page).getByRole("button", { name: "Accept" })];
  const [a, b] = [await reject.boundingBox(), await accept.boundingBox()];
  expect(a!.width).toBeCloseTo(b!.width, 0);
  expect(a!.height).toBeCloseTo(b!.height, 0);
  await page.goto("/privacy");
  await page.waitForLoadState("networkidle");
  expect(hits).toEqual([]);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
});

test("Accept loads Google Analytics, hides the banner, and the choice lasts 6 months", async ({ page }) => {
  const hits = await watchGoogle(page);
  await page.goto("/");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect.poll(() => hits.some((u) => u.includes("/gtag/js?id=G-E2ETEST01"))).toBe(true);
  const cookie = await consentCookie(page);
  expect(cookie?.value).toBe("accepted");
  const days = (cookie!.expires - Date.now() / 1000) / 86400;
  expect(days).toBeGreaterThan(180);
  expect(days).toBeLessThan(185);

  hits.length = 0;
  await page.reload();
  await expect(banner(page)).toHaveCount(0);
  await expect.poll(() => hits.some((u) => u.includes("/gtag/js?id=G-E2ETEST01"))).toBe(true);
});

test("Reject loads nothing, hides the banner and is remembered", async ({ page }) => {
  const hits = await watchGoogle(page);
  await page.goto("/");
  await banner(page).getByRole("button", { name: "Reject" }).click();
  await expect(banner(page)).toHaveCount(0);
  expect((await consentCookie(page))?.value).toBe("rejected");
  await page.reload();
  await page.goto("/features");
  await page.waitForLoadState("networkidle");
  await expect(banner(page)).toHaveCount(0);
  expect(hits).toEqual([]);
});

test("Cookie settings in the footer asks again, and rejecting after accepting clears Google's cookies", async ({ page, context }) => {
  const hits = await watchGoogle(page);
  await page.goto("/");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => hits.length).toBeGreaterThan(0);
  await context.addCookies([{ name: "_ga", value: "GA1.1.1.1", url: "http://localhost:3000" }, { name: "_ga_E2ETEST01", value: "GS2.1.s1", url: "http://localhost:3000" }]);

  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(banner(page)).toBeFocused();
  await banner(page).getByRole("button", { name: "Reject" }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cookie settings" })).toBeFocused();
  expect((await consentCookie(page))?.value).toBe("rejected");
  await expect.poll(async () => (await context.cookies()).filter((c) => c.name.startsWith("_ga")).length).toBe(0);
});

test("the signed-in app never shows the banner or loads Google", async ({ page }) => {
  const hits = await watchGoogle(page);
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  await expect(banner(page)).toHaveCount(0);
  expect(hits).toEqual([]);
});

test("the banner fits a phone and the privacy page can reopen it", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/privacy");
  await expect(banner(page)).toBeVisible();
  const box = (await banner(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  await banner(page).getByRole("button", { name: "Reject" }).click();
  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(banner(page)).toBeVisible();
});
