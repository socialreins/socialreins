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

test("each network page says what works there beyond posting", async ({ page }) => {
  const cell = (row: string) => page.getByRole("row", { name: new RegExp(`^${row}`) }).getByRole("cell");
  await page.goto("/tiktok");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(cell("Bulk upload from a CSV file")).toContainText("No.");
  await expect(cell("Recurring posts")).toContainText("No.");
  await expect(cell("Posts from an RSS or Atom feed")).toContainText("No.");
  await expect(cell("Posts from an RSS or Atom feed")).toHaveText("No. Feeds are not offered for TikTok.");
  await expect(cell("Post analytics")).toHaveText("No.");
  await expect(cell("Inbox")).toHaveText("Not yet.");
  await page.goto("/youtube");
  await expect(cell("Posts from an RSS or Atom feed")).toContainText("No.");
  await expect(cell("Post analytics")).toHaveText("Yes: views, likes and comments for each post.");
  await expect(cell("Recurring posts")).toContainText("Yes");
  await page.goto("/instagram");
  await expect(cell("Inbox")).toHaveText("In testing.");
  await expect(cell("Automations")).toHaveText("In testing.");
  await expect(cell("Post analytics")).toHaveText("Yes: likes and comments for each post.");
  await expect(cell("Posts from an RSS or Atom feed")).toContainText("needs an image");
  await page.goto("/bluesky");
  await expect(cell("Post analytics")).toHaveText("Yes: likes, comments and shares for each post.");
  await expect(cell("Inbox")).toHaveText("Yes.");
  await expect(cell("Automations")).toHaveText("Yes.");
  for (const slug of ["x", "linkedin", "threads"]) {
    await page.goto(`/${slug}`);
    await expect(cell("Post analytics")).toHaveText("No.");
    await expect(cell("Bulk upload from a CSV file")).toHaveText("Yes.");
  }
  await page.goto("/post-types");
  await expect(page.getByRole("main")).toContainText("Bulk upload from a CSV file and recurring posts work on every network except TikTok");
});
