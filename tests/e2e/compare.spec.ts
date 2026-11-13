import { expect, test } from "@playwright/test";

const rivals = { postsyncer: "PostSyncer", manychat: "Manychat", buffer: "Buffer", hootsuite: "Hootsuite", later: "Later", postiz: "Postiz" };

test("the compare page lists every tool, and each has its own page with a table, sources and a date", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Compare SocialReins", level: 1 })).toBeVisible();
  for (const [slug, name] of Object.entries(rivals)) {
    await expect(page.getByRole("link", { name: new RegExp(`^SocialReins vs ${name}`) })).toHaveAttribute("href", `/compare/${slug}`);
  }
  for (const [slug, name] of Object.entries(rivals)) {
    await page.goto(`/compare/${slug}`);
    await expect(page.getByRole("heading", { name: `SocialReins vs ${name}`, level: 1 })).toBeVisible();
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "SocialReins", exact: true })).toBeVisible();
    await expect(table.getByRole("columnheader", { name, exact: true })).toBeVisible();
    await expect(page.getByText(`comes from its own website, checked on 13 November 2026`)).toBeVisible();
    await expect(page.getByRole("heading", { name: `Pick ${name} if` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Other comparisons" }).getByRole("link")).toHaveCount(5);
  }
  // Outside links open in a new tab and pass no ranking.
  const source = page.locator('a[href="https://postiz.com/pricing"]');
  await expect(source).toHaveAttribute("rel", /nofollow/);
  await expect(source).toHaveAttribute("target", "_blank");
});

test("a compare page fits a phone: the table scrolls, the page does not", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/compare/buffer");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/compare");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
