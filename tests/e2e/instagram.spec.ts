import { expect, test } from "@playwright/test";

test("the Instagram page states the Motion Carousel and its 20-slide limit, and links both ways", async ({ page }) => {
  await page.goto("/instagram");
  await expect(page.getByRole("heading", { name: "What you can post to Instagram", level: 1 })).toBeVisible();
  const row = page.getByRole("row", { name: /Motion Carousel/ });
  await expect(row).toContainText("Yes, 2 to 20 slides. Any slide can be a video.");
  await expect(page.getByText("Up to 20 slides in one carousel.")).toBeVisible();
  await page.getByRole("link", { name: "What you can post where" }).click();
  await expect(page).toHaveURL(/\/post-types$/);
  await expect(page.getByRole("link", { name: "What you can post to Instagram" })).toHaveAttribute("href", "/instagram");
});

test("the Instagram page fits a phone without sideways page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/instagram");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
