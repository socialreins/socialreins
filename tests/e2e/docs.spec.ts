import { expect, test } from "@playwright/test";

test("the docs index lists every guide for both versions and says Cloud is not open", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Docs" }).click();
  await expect(page.getByRole("heading", { name: "Docs", level: 1 })).toBeVisible();
  const self = page.getByRole("region", { name: "Self-hosted" });
  await expect(self).toContainText("Works today");
  await expect(self.getByRole("link", { name: "Install" })).toHaveAttribute("href", "/docs/self-hosted");
  await expect(self.getByRole("link", { name: "AI setup" })).toHaveAttribute("href", "/docs/self-hosted/ai");
  const cloud = page.getByRole("region", { name: "Cloud" });
  await expect(cloud).toContainText("Not open yet");
  await expect(cloud.getByRole("link", { name: "AI setup" })).toHaveAttribute("href", "/docs/cloud/ai");
});

test("the version switcher keeps the same guide and swaps the addresses", async ({ page }) => {
  await page.goto("/docs/self-hosted/ai");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connect an AI assistant to your own SocialReins");
  await expect(page.getByRole("article")).toContainText("https://api.example.com/mcp");
  await expect(page.getByRole("article")).not.toContainText("not open yet");
  const versions = page.getByRole("navigation", { name: "Version" });
  await expect(versions.getByRole("link", { name: "Self-hosted" })).toHaveAttribute("aria-current", "page");
  await versions.getByRole("link", { name: "Cloud" }).click();
  await expect(page).toHaveURL(/\/docs\/cloud\/ai$/);
  await expect(page.getByRole("article")).toContainText("https://brain.socialreins.com/mcp");
  // Every cloud guide says plainly that Cloud cannot be used yet.
  await expect(page.getByRole("article")).toContainText("SocialReins Cloud is not open yet.");
  await page.getByRole("navigation", { name: "Docs" }).getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/docs\/cloud$/);
});

test("the install guide has the commands, and a docs page fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/self-hosted");
  await expect(page.getByRole("article")).toContainText("docker compose up -d");
  await expect(page.getByRole("article")).toContainText("ENCRYPTION_KEY");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The header still fits with the Docs link in it.
  await expect(page.locator("header").first().getByRole("link", { name: "Get started" })).toBeInViewport({ ratio: 1 });
});
