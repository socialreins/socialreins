import { expect, test } from "@playwright/test";

test("the pricing page shows the two cloud plans with yearly prices first, and self-hosted as free", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Pricing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pricing", level: 1 })).toBeVisible();

  // Cloud is the standard choice, so its plans come first; self-hosting is the free one.
  await expect(page.getByRole("region").first()).toHaveAccessibleName("Scheduler");
  const scheduler = page.getByRole("region", { name: "Scheduler", exact: true });
  await expect(scheduler).toContainText("$190 a year");
  await expect(scheduler).toContainText("Or $19 a month. Starts with a 7-day free trial.");
  await expect(scheduler).toContainText("Cloud, not open yet");
  const automation = page.getByRole("region", { name: "Scheduler and Automation" });
  await expect(automation).toContainText("$490 a year");
  await expect(automation).toContainText("Or $49 a month.");

  const self = page.getByRole("region", { name: "Self-hosted" });
  await expect(self).toContainText("Works today");
  await expect(self).toContainText("Free");
  await expect(self).toContainText("Every feature. There is no paid tier in the code.");
  await expect(self.getByRole("link", { name: "Read the install guide" })).toHaveAttribute("href", "/docs/self-hosted");

  // X credits and the refund rule are answered on the page.
  await expect(page.getByText("100 posts for $5 or 500 for $20")).toBeVisible();
  await expect(page.getByText("Payments and credit packs are not refunded", { exact: false })).toBeVisible();

  // Cloud is invitation-only until sign-up opens: the button is still the waitlist.
  await scheduler.getByRole("link", { name: "Join the waitlist" }).click();
  await expect(page).toHaveURL(/\/#waitlist$/);
});

test("the pricing page fits a phone without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pricing");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
