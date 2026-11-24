import { expect, test, type Page } from "@playwright/test";

// The month the list asks for starts at local midnight: pin the zone so it is the same everywhere.
test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Mira", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const alice = { id: "c1", provider: "bluesky", external_id: "did:plc:alice", handle: "alice.bsky.social", display_name: "Alice", avatar_url: null, token_expires_at: null, set_ids: ["d"], created_at: "2026-10-20T10:00:00Z" };
const metrics = (likes: number | null, comments: number | null, shares: number | null, views: number | null, fetched_at = "2026-11-10T10:00:00Z") => ({ likes, comments, shares, views, fetched_at });
const target = (extra: Record<string, unknown> = {}) => ({
  id: "tg1", social_account_id: "c1", status: "published", remote_id: "r1", remote_url: "https://bsky.app/profile/alice.bsky.social/post/1",
  error: null, published_at: "2026-11-08T08:00:00Z", parts: [], metrics: null, ...extra,
});
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id, social_set_id: "d", platform: "bluesky", body: `Body of ${id}`, media: [], thread: [], status: "published",
  scheduled_at: "2026-11-08T08:00:00Z", published_at: "2026-11-08T08:00:00Z", error: null, created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", targets: [target()], lists: [], group_id: null, ...extra,
});
const zero = { posts: 0, likes: 0, comments: 0, shares: 0, views: 0 };
const report = {
  supported: ["bluesky", "facebook", "instagram", "youtube"],
  totals: { posts: 4, likes: 1234, comments: 56, shares: 7, views: 8900 },
  by_platform: [
    { platform: "bluesky", posts: 2, likes: 1200, comments: 50, shares: 7, views: null, supported: true },
    { platform: "youtube", posts: 1, likes: 34, comments: 6, shares: null, views: 8900, supported: true },
    { platform: "linkedin", ...zero, posts: 1, supported: false },
  ],
  by_day: [
    { date: "2026-11-08", posts: 3, likes: 1200, comments: 50, shares: 7, views: 0 },
    { date: "2026-11-09", ...zero },
    { date: "2026-11-10", posts: 1, likes: 34, comments: 6, shares: 0, views: 8900 },
  ],
  top_posts: [
    post("p-top", { body: "The big launch", targets: [target({ metrics: metrics(1200, 50, 7, null) })] }),
    post("p-vid", { platform: "youtube", body: "Our video", targets: [target({ metrics: metrics(34, 6, null, 8900) })] }),
  ],
};

// A mock brain; `queries` holds every /v1/analytics request, in whatever order they came.
async function brain(page: Page, answer: unknown = report) {
  const queries: URLSearchParams[] = [];
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00Z"));
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (r) => r.fulfill({ json: sets }));
  await page.route("**/v1/connections", (r) => r.fulfill({ json: [alice] }));
  await page.route(/\/v1\/analytics(\?.*)?$/, (r) => {
    queries.push(new URL(r.request().url()).searchParams);
    return r.fulfill({ json: answer });
  });
  return queries;
}
const asked = (queries: URLSearchParams[], from: string) => queries.some((q) => q.get("from") === from && q.get("to") === "2026-11-10" && q.get("social_set_id") === "d");

test("the sidebar links to Analytics at the end of Publish", async ({ page }) => {
  await brain(page);
  await page.route(/\/v1\/posts(\?.*)?$/, (r) => r.fulfill({ json: [] }));
  await page.goto("/posts");
  const links = page.getByRole("navigation", { name: "App" }).getByRole("link");
  await expect(links.nth(6)).toHaveText("Feeds");
  await expect(links.nth(7)).toHaveText("Analytics");
  await links.nth(7).click();
  await expect(page).toHaveURL("/t/acme22/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  await expect(links.nth(7)).toHaveAttribute("aria-current", "page");
});

test("analytics shows totals, the chart with its table, networks and top posts", async ({ page }) => {
  const queries = await brain(page);
  await page.goto("/analytics");
  const totals = page.getByLabel("Totals");
  await expect(totals).toContainText("Posts4");
  await expect(totals).toContainText("Likes1.2K");
  await expect(totals).toContainText("Comments56");
  await expect(totals).toContainText("Shares7");
  await expect(totals).toContainText("Views8.9K");
  await expect.poll(() => asked(queries, "2026-10-12")).toBe(true);
  await expect(page.locator("[data-stats-note]")).toHaveText(
    "Stats come from Bluesky, Facebook, Instagram and YouTube. Threads, LinkedIn, X and TikTok are not available yet. Numbers refresh about every hour for two days after a post goes out, then twice a day, for 30 days.",
  );

  const days = page.getByRole("region", { name: "Engagement by day" });
  await expect(days.getByRole("img", { name: /Engagement by day, last 30 days/ })).toBeVisible();
  await expect(days.locator("svg rect")).toHaveCount(3);
  await expect(days).toContainText("The tallest bar is 1,257.");
  await days.getByText("Show as a table").click();
  const dayRows = days.getByRole("table", { name: "Engagement by day" }).getByRole("row");
  await expect(dayRows).toHaveCount(4);
  await expect(dayRows.nth(1).getByRole("cell")).toHaveText(["3", "1,200", "50", "7"]);
  await expect(dayRows.nth(2).getByRole("cell")).toHaveText(["0", "0", "0", "0"]);

  const networks = page.getByRole("region", { name: "By network" });
  await expect(networks.getByRole("row", { name: /Bluesky/ }).getByRole("cell")).toHaveText(["2", "1,200", "50", "7", /not given/]);
  await expect(networks.getByRole("row", { name: /YouTube/ }).getByRole("cell")).toHaveText(["1", "34", "6", /not given/, "8,900"]);
  await expect(networks.getByRole("row", { name: /LinkedIn/ }).getByRole("cell")).toHaveText(["1", "Not available yet"]);

  const top = page.getByRole("region", { name: "Top posts" }).getByRole("link");
  await expect(top).toHaveCount(2);
  await expect(top.nth(0)).toContainText("The big launch");
  await expect(top.nth(0)).toContainText("1.2K likes, 50 comments, 7 shares");
  await expect(top.nth(0)).toHaveAttribute("href", "/t/acme22/posts/p-top");
  await expect(top.nth(1)).toContainText("YouTube: Our video");
  await expect(top.nth(1)).toContainText("34 likes, 6 comments, 8.9K views");

  // On a phone the wide table scrolls inside its card, not the page.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(networks).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("a range chip changes the address and what is asked", async ({ page }) => {
  const queries = await brain(page);
  await page.goto("/analytics");
  const chip = (days: number) => page.getByRole("list", { name: "Range" }).getByRole("link", { name: `${days} days` });
  await expect(chip(30)).toHaveAttribute("aria-current", "true");
  await chip(7).click();
  await expect(page).toHaveURL("/t/acme22/analytics?range=7");
  await expect(chip(7)).toHaveAttribute("aria-current", "true");
  await expect(chip(30)).not.toHaveAttribute("aria-current", "true");
  await expect.poll(() => asked(queries, "2026-11-04")).toBe(true);
  await expect(page.getByRole("img", { name: /last 7 days/ })).toBeVisible();

  await page.goto("/analytics?range=90");
  await expect(chip(90)).toHaveAttribute("aria-current", "true");
  await expect.poll(() => asked(queries, "2026-08-13")).toBe(true);
});

test("analytics says so when nothing was published, or brain fails", async ({ page }) => {
  await brain(page, { ...report, totals: zero, by_platform: [], by_day: [], top_posts: [] });
  await page.goto("/analytics?range=7");
  await expect(page.getByText("No posts were published in the last 7 days.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Write a post" })).toHaveAttribute("href", "/t/acme22/posts/new");
  await expect(page.getByLabel("Totals")).toHaveCount(0);

  await page.route(/\/v1\/analytics(\?.*)?$/, (r) => r.fulfill({ status: 422, json: { error: "invalid_range" } }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "The analytics couldn't be loaded. That range isn't valid." })).toBeVisible();
});

test("a published post shows each account's numbers and refreshes them", async ({ page }) => {
  await brain(page);
  const first = post("p1", { targets: [target({ metrics: metrics(12, 1, 0, null, "2026-11-10T11:55:00Z") })] });
  await page.route("**/v1/posts/p1", (r) => r.fulfill({ json: first }));
  await page.route("**/v1/posts/p1/page", (r) => r.fulfill({ json: { enabled: false, details: "", code: null, live: false } }));
  let refuse = false;
  const calls: string[] = [];
  await page.route("**/v1/posts/p1/metrics/refresh", (r) => {
    calls.push(r.request().method());
    if (refuse) return r.fulfill({ status: 429, json: { error: "refreshed_recently" } });
    return r.fulfill({ json: { ...first, targets: [target({ metrics: metrics(1500, 2, 3, null, "2026-11-10T12:00:00Z") })] } });
  });
  await page.goto("/posts/p1");
  const stats = page.locator("[data-stats]");
  await expect(stats).toHaveText("12 likes, 1 comment, 0 shares, as of 5 minutes ago.");
  await page.getByRole("button", { name: "Refresh stats" }).click();
  await expect(stats).toHaveText("1.5K likes, 2 comments, 3 shares, as of now.");
  await expect(page.getByRole("status").filter({ hasText: "The stats are up to date." })).toBeVisible();
  expect(calls).toEqual(["POST"]);

  refuse = true;
  await page.getByRole("button", { name: "Refresh stats" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The stats were refreshed less than a minute ago. Wait a minute, then try again." })).toBeVisible();
  await expect(stats).toHaveText("1.5K likes, 2 comments, 3 shares, as of now.");
});

test("a post on a network without stats says so, and one not read yet has no numbers", async ({ page }) => {
  await brain(page);
  await page.route("**/v1/posts/*/page", (r) => r.fulfill({ json: { enabled: false, details: "", code: null, live: false } }));
  await page.route("**/v1/posts/p2", (r) => r.fulfill({ json: post("p2", { platform: "linkedin" }) }));
  await page.route("**/v1/posts/p3", (r) => r.fulfill({ json: post("p3") }));
  await page.goto("/posts/p2");
  await expect(page.locator("[data-stats]")).toHaveText("Stats are not available for LinkedIn yet.");
  await expect(page.getByRole("button", { name: "Refresh stats" })).toHaveCount(0);
  await page.goto("/posts/p3");
  await expect(page.locator("[data-stats]")).toHaveText("No stats read yet.");
  await expect(page.getByRole("button", { name: "Refresh stats" })).toBeVisible();
});

test("a published row of the posts list shows its likes and comments", async ({ page }) => {
  await brain(page);
  await page.route(/\/v1\/posts(\?.*)?$/, (r) => {
    const q = new URL(r.request().url()).searchParams;
    if (q.get("status") === "draft" || !q.get("from")?.startsWith("2026-10-30")) return r.fulfill({ json: [] });
    return r.fulfill({
      json: [
        post("p-a", { body: "With numbers", group_id: "g1", targets: [target({ metrics: metrics(1200, 4, 1, null) })] }),
        post("p-b", { body: "With numbers", group_id: "g1", platform: "youtube", targets: [target({ id: "tg2", metrics: metrics(34, 1, null, 900) })] }),
        post("p-c", { body: "Not read yet", scheduled_at: "2026-11-07T08:00:00Z", published_at: "2026-11-07T08:00:00Z" }),
      ],
    });
  });
  await page.goto("/posts");
  // Earlier days of the month are folded.
  await page.getByText("Earlier this month (2 posts)").click();
  // The last match is the row itself, inside its day's item.
  const row = (text: string) => page.getByRole("listitem").filter({ hasText: text }).last();
  await expect(row("With numbers").locator("[data-row-stats]")).toHaveText("1.2K likes, 5 comments");
  await expect(row("Not read yet")).toBeVisible();
  await expect(row("Not read yet").locator("[data-row-stats]")).toHaveCount(0);
});
