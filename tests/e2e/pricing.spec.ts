import { expect, test } from "@playwright/test";

test("the pricing page shows self-hosted as free and cloud with no price yet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Pricing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pricing", level: 1 })).toBeVisible();

  const self = page.getByRole("region", { name: "Self-hosted" });
  await expect(self).toContainText("Free");
  await expect(self).toContainText("Every feature. There is no paid tier in the code.");
  const guide = self.getByRole("link", { name: "Read the self-host guide" });
  await expect(guide).toHaveAttribute("href", "https://github.com/socialreins/socialreins#self-host");
  await expect(guide).toHaveAttribute("target", "_blank");

  const cloud = page.getByRole("region", { name: "Cloud" });
  await expect(cloud).toContainText("Price not set yet");
  // No amount is promised anywhere on the page.
  await expect(page.getByRole("main")).not.toContainText(/[$€£]\s?\d/);
  await cloud.getByRole("link", { name: "Join the waitlist" }).click();
  await expect(page).toHaveURL(/\/#waitlist$/);
});

test("the pricing page fits a phone without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pricing");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
