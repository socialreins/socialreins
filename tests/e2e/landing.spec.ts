import { expect, test } from "@playwright/test";

test("landing page renders and the waitlist form joins", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  // Turnstile is on for other forms, but the waitlist form never asks for it.
  await page.route("**/auth/providers", (route) => route.fulfill({ json: { google: false, turnstile_site_key: "0xSITE" } }));
  let count = 1;
  await page.route("**/v1/waitlist/count", (route) => route.fulfill({ json: { count: count } }));
  let sent: unknown;
  await page.route("**/v1/waitlist", (route) => {
    sent = route.request().postDataJSON();
    count = 1234;
    return route.fulfill({ status: 200, body: "{}" });
  });
  await page.goto("/");
  await expect(page.getByText("1 person on the waitlist")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Self-hosting works today; Cloud is not open yet, and the page says so.
  await expect(page.getByRole("heading", { name: "Run it yourself today, or wait for Cloud" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Cloud not open yet");
  await expect(page.getByRole("main").getByRole("link", { name: "Read the install guide" })).toHaveAttribute("href", "/docs/self-hosted");
  await expect(page.getByRole("main").getByRole("link", { name: "pricing" })).toHaveAttribute("href", "/pricing");
  await expect(page.getByRole("link", { name: "SocialReins", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: /Star on GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/socialreins/socialreins",
  );
  await page.getByLabel("Email for the hosted version waitlist").fill("someone@example.com");
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByRole("status")).toHaveText(/Check your email for a link to confirm your spot/);
  expect(sent).toEqual({ email: "someone@example.com", source: "landing" });
  await expect(page.getByText("1,234 people on the waitlist")).toBeVisible();
});

test("the waitlist count shows nothing when brain can't say", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.route("**/v1/waitlist/count", (route) => route.fulfill({ status: 500, json: { error: "internal" } }));
  await page.goto("/");
  await expect(page.getByLabel("Email for the hosted version waitlist")).toBeVisible();
  await expect(page.getByText(/on the waitlist$/)).toHaveCount(0);
});

test("the waitlist verify page confirms only on a click, then moves focus to the result", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/v1/waitlist/verify", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: "verified" } });
  });
  await page.goto("/waitlist/verify?token=ab12");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm your spot on the SocialReins waitlist");
  await page.waitForLoadState("networkidle");
  expect(sent).toEqual([]);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  const done = page.getByRole("heading", { level: 1, name: "Your spot is confirmed" });
  await expect(done).toBeFocused();
  await expect(page.getByRole("link", { name: "Back to the home page" })).toHaveAttribute("href", "/");
  expect(sent).toEqual([{ token: "ab12" }]);
});

test("the waitlist verify page explains a bad link, a missing token and other failures", async ({ page }) => {
  let answer = { status: 422, json: { error: "invalid_link" } };
  await page.route("**/v1/waitlist/verify", (route) => route.fulfill(answer));
  await page.goto("/waitlist/verify?token=bad");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("That link didn't work");
  await expect(page.getByRole("alert").filter({ hasText: "Join again from the home page." })).toBeVisible();
  await expect(page.getByRole("link", { name: "home page" })).toHaveAttribute("href", "/");

  let asked = false;
  await page.unroute("**/v1/waitlist/verify");
  await page.route("**/v1/waitlist/verify", (route) => ((asked = true), route.fulfill(answer)));
  await page.goto("/waitlist/verify");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("That link didn't work");
  expect(asked).toBe(false);

  answer = { status: 429, json: { error: "rate_limited" } };
  await page.goto("/waitlist/verify?token=ab12");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Wait a minute, then try again/ })).toBeVisible();
  answer = { status: 500, json: { error: "internal" } };
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("status").filter({ hasText: /couldn't be confirmed. Try again/ })).toBeVisible();
});

test("the header GitHub menu shows the GitHub mark and lists the main repo and the brain", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/");
  const banner = page.getByRole("banner");
  const menu = banner.locator("summary", { hasText: "GitHub" });
  await expect(menu.locator("svg").first()).toBeVisible();
  await expect(banner.getByRole("link", { name: /Brain/ })).toBeHidden();
  await menu.click();
  // Every GitHub link opens a new tab, so the landing page stays open.
  for (const [name, repo] of [["SocialReins", "socialreins"], ["Brain", "brain"]]) {
    const link = banner.getByRole("link", { name: new RegExp(`^${name}`) }).last();
    await expect(link).toHaveAttribute("href", `https://github.com/socialreins/${repo}`);
    await expect(link).toHaveAttribute("target", "_blank");
  }
  await page.keyboard.press("Escape");
  await expect(banner.getByRole("link", { name: /Brain/ })).toBeHidden();
  await expect(page.getByRole("main").getByRole("link", { name: /Star on GitHub/ })).toHaveAttribute("target", "_blank");
});

test("the GitHub menu and the Star button show the same org-wide star total", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/");
  // The count comes from GitHub at build time, so it may be absent (rate limit), but never differs.
  const header = await page.getByRole("banner").locator("summary", { hasText: "GitHub" }).locator(".sr-only").allTextContents();
  const hero = page.getByRole("main").getByRole("link", { name: /Star on GitHub/ });
  expect(await hero.locator(".sr-only").allTextContents()).toEqual(header);
});

test("the web app manifest lists the home-screen icons", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.map((i: { src: string }) => i.src)).toContain("/icon-512.png");
  for (const src of ["/icon-192.png", "/icon-512.png"]) {
    const res = await request.get(src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
});

test("on a phone the header fits and the page never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Signed out, the header shows the Get started link, its widest form.
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header.getByRole("link", { name: "SocialReins" })).toBeVisible();
  const open = header.getByRole("link", { name: "Get started" });
  await expect(open).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the home page lists the seven feature groups and links each to its page", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "What it does" });
  for (const name of ["Publish", "Plan and schedule", "Engage", "Automate", "Team", "Measure", "Build on it"]) {
    await expect(section.getByRole("term").filter({ hasText: name })).toBeVisible();
  }
  await expect(section.getByRole("link", { name: "Engage: learn more" })).toHaveAttribute("href", "/features/inboxes");
  await expect(section.getByRole("link", { name: "Automate: learn more" })).toHaveAttribute("href", "/features/automations");
  await expect(section.getByRole("link", { name: "Publish: learn more" })).toHaveAttribute("href", "/socials");
  await expect(section.getByRole("link", { name: "Plan and schedule: learn more" })).toHaveAttribute("href", "/features#plan");
  await expect(section.getByRole("link", { name: "Every feature: learn more" })).toHaveAttribute("href", "/features");
  // The inbox and automations are not live on every network, so neither card may say "Live now".
  await expect(section.getByText("Live on Bluesky")).toHaveCount(2);
  // The old undersold claims are gone: approvals and analytics exist, and nothing is promised beyond them.
  await expect(section).toContainText("approval step");
  await expect(section).toContainText("shares on Bluesky and Facebook, and views on YouTube");
  await expect(page.getByRole("main")).not.toContainText(/AI writer|WhatsApp|mobile app/i);
});

test("the features page groups every feature and marks what is in testing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Features", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Features", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  for (const name of ["Publish", "Plan and schedule", "Engage", "Automate", "Team", "Measure", "Build on it"]) {
    await expect(page.getByRole("region", { name, exact: true }).getByRole("term").first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Feature groups" }).getByRole("link", { name, exact: true })).toBeVisible();
  }
  for (const name of ["Engage", "Automate"]) {
    await expect(page.getByRole("region", { name, exact: true })).toContainText("Facebook Pages and Instagram are in testing.");
  }
  const measure = page.getByRole("region", { name: "Measure", exact: true });
  await expect(measure).toContainText("Bluesky, Facebook, Instagram and YouTube");
  await expect(measure).toContainText("no reach, audience or follower reports yet");
  await expect(page.getByRole("region", { name: "Plan and schedule" })).toContainText("Not for TikTok or YouTube");
  await expect(page.getByRole("region", { name: "Build on it" })).toContainText("SocialReins does not write posts for you.");
  // No price and no em dash anywhere on the page.
  await expect(page.getByRole("main")).not.toContainText(/[$€£]\s?\d|\u2014/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
