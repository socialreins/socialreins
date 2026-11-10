import { expect, test } from "@playwright/test";

test("post types page shows the table with every network", async ({ page }) => {
  await page.goto("/post-types");
  await expect(page.getByRole("heading", { name: "What you can post where", level: 1 })).toBeVisible();
  const table = page.getByRole("table");
  for (const name of ["Bluesky", "Threads", "LinkedIn", "Facebook Page", "Instagram", "YouTube", "X", "TikTok"]) {
    await expect(table.getByRole("columnheader", { name, exact: true })).toBeVisible();
  }
  await expect(table.getByRole("rowheader", { name: "Several videos or photos mixed in one post" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Post types" })).toHaveAttribute("href", "/post-types");
});

test("on a phone the post types table says it scrolls sideways, and the page does not", async ({ page }) => {
  const hint = page.getByText("Scroll the table sideways to see all eight networks.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/post-types");
  await expect(hint).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(hint).toBeHidden();
});
