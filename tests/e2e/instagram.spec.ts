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

const pages = { bluesky: "Bluesky", threads: "Threads", linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", x: "X", tiktok: "TikTok" };

test("every network has its own page, linked from the post types page and from each other", async ({ page }) => {
  await page.goto("/post-types");
  for (const [slug, name] of Object.entries(pages)) {
    await expect(page.getByRole("link", { name: `What you can post to ${name}`, exact: true })).toHaveAttribute("href", `/${slug}`);
  }
  for (const [slug, name] of Object.entries(pages)) {
    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { name: `What you can post to ${name}`, level: 1 })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: `On ${name}`, exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Other networks" }).getByRole("link")).toHaveCount(7);
  }
  await page.goto("/x");
  await expect(page.getByRole("row", { name: /Thread/ })).toContainText("up to 25 replies");
});

test("a one-segment path that is not a network is still a 404", async ({ page }) => {
  expect((await page.goto("/myspace"))?.status()).toBe(404);
});

test("the Instagram page fits a phone without sideways page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/instagram");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the home page header has a Socials menu that lists every network and links to its page", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Site" });
  await expect(nav.getByRole("link", { name: "TikTok" })).toBeHidden();
  await nav.getByText("Socials", { exact: true }).click();
  for (const [slug, name] of Object.entries(pages)) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", `/${slug}`);
  }
  await expect(nav.getByRole("link", { name: "Compare all networks" })).toHaveAttribute("href", "/post-types");
  // The strip of networks below links to the same pages.
  await expect(page.getByRole("region", { name: "Works with" }).getByRole("link", { name: "Bluesky" })).toHaveAttribute("href", "/bluesky");
  // Escape and a click elsewhere both close it.
  await page.keyboard.press("Escape");
  await expect(nav.getByRole("link", { name: "TikTok" })).toBeHidden();
  await nav.getByText("Socials", { exact: true }).click();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(nav.getByRole("link", { name: "TikTok" })).toBeHidden();
  await nav.getByText("Socials", { exact: true }).click();
  await nav.getByRole("link", { name: "YouTube", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What you can post to YouTube", level: 1 })).toBeVisible();
});

test("on a phone the open Socials menu stays inside the screen", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `header fits at ${width}`).toBe(true);
  }
  await page.getByRole("navigation", { name: "Site" }).getByText("Socials", { exact: true }).click();
  const box = await page.getByRole("link", { name: "Compare all networks" }).boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a network page has the Socials menu, and choosing a network closes it", async ({ page }) => {
  await page.goto("/instagram");
  const nav = page.getByRole("navigation", { name: "Site" });
  await nav.getByText("Socials", { exact: true }).click();
  await nav.getByRole("link", { name: "YouTube", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What you can post to YouTube", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "TikTok" })).toBeHidden();
});

test("every public page has the same menu bar", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  for (const path of ["/", "/x", "/post-types", "/pricing", "/compare", "/compare/buffer", "/privacy", "/contact"]) {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Site" });
    await expect(nav.getByText("Socials", { exact: true }), path).toBeVisible();
    await expect(nav.getByRole("link", { name: "Get started" }), path).toHaveAttribute("href", "/signup");
    await expect(nav.locator("summary", { hasText: "GitHub" }), path).toBeVisible();
  }
});
