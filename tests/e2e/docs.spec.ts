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
  await page.goto("/docs/self-hosted");
  await expect(page.getByRole("article")).toContainText("docker compose up -d");
  await expect(page.getByRole("article")).toContainText("ENCRYPTION_KEY");
  // Long setting names wrap, so even the narrowest phone has no sideways scroll.
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `fits at ${width}`).toBe(true);
  }
  // The header still fits with the Docs link in it.
  await expect(page.locator("header").first().getByRole("link", { name: "Get started" })).toBeInViewport({ ratio: 1 });
});

test("the use guide has a how-to for each part of the app, in both versions", async ({ page }) => {
  const parts = { queue: "Set up the queue", csv: "Upload posts from a CSV file", recurring: "Repeat a post", feeds: "Post from an RSS or Atom feed", approvals: "Approve posts before they go out", library: "Keep media and text in the library", inbox: "Answer comments and DMs in the inbox", automations: "Build an automation or a flow", broadcasts: "Send a broadcast", newsletters: "Send a newsletter", analytics: "Read your analytics", "team-address": "Give your team its own address" };
  for (const mode of ["self-hosted", "cloud"]) {
    await page.goto(`/docs/${mode}/use`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const article = page.getByRole("article");
    for (const [id, name] of Object.entries(parts)) {
      await expect(article.getByRole("heading", { level: 2, name })).toHaveAttribute("id", id);
      await expect(article.getByRole("navigation", { name: "How to" }).locator(`a[href="#${id}"]`)).toBeVisible();
    }
  }
  const article = page.getByRole("article");
  // The words are the app's own: the button, the columns, the rules and the networks.
  await expect(article).toContainText("Add to queue");
  await expect(article).toContainText("text,networks,media,time,first_comment");
  await expect(article).toContainText('Anyone who replies "stop" is opted out');
  await expect(article).toContainText("Send a test to your own email");
  await expect(article).toContainText("read on Bluesky, Facebook, Instagram and YouTube");
  await expect(article).toContainText("Facebook Pages and Instagram are in testing");
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
