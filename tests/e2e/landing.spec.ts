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
  await expect(page.getByRole("link", { name: "SocialReins", exact: true })).toHaveAttribute("href", "/");
  const menu = page.locator("details").filter({ hasText: "Follow on GitHub" });
  await menu.getByText("Follow on GitHub").click();
  await expect(menu.getByRole("link", { name: /socialreins\/web/ })).toHaveAttribute(
    "href",
    "https://github.com/socialreins/web",
  );
  await expect(menu.getByRole("link", { name: /socialreins\/web/ })).toContainText("main");
  await expect(menu.getByRole("link", { name: /socialreins\/brain/ })).toHaveAttribute(
    "href",
    "https://github.com/socialreins/brain",
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

test("the waitlist verified page confirms the spot or explains a bad link", async ({ page }) => {
  await page.goto("/waitlist/verified");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your spot is confirmed");
  await expect(page.getByRole("link", { name: "Back to the home page" })).toHaveAttribute("href", "/");
  await page.goto("/waitlist/verified?error=invalid_link");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("That link didn't work");
  await expect(page.getByText(/Join the waitlist again/)).toBeVisible();
  await expect(page.getByRole("link", { name: "home page" })).toHaveAttribute("href", "/");
});

test("the header GitHub menu shows the GitHub mark", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/");
  const summary = page.getByRole("banner").locator("summary");
  await expect(summary).toContainText("GitHub");
  await expect(summary.locator("svg")).toHaveCount(1);
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
