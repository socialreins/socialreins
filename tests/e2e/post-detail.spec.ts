import { expect, test, type Page } from "@playwright/test";

const team = { id: "t1", name: "Acme", code: "acme22", role: "owner", public_pages: false };
const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: team };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const acc = (id: string, provider: string, name: string) => ({ id, provider, external_id: id, handle: null, display_name: name, avatar_url: null, token_expires_at: null, set_ids: ["d"], created_at: "2026-10-20T10:00:00Z" });
const accounts = [acc("c1", "bluesky", "Alice"), acc("c2", "instagram", "Alice on Instagram")];
const target = (extra: Record<string, unknown> = {}) => ({ id: "tg1", social_account_id: "c1", status: "published", remote_id: "r1", remote_url: "https://bsky.app/p/1", error: null, published_at: "2026-11-03T08:00:00Z", parts: [], ...extra });
const post = (id: string, number: number, extra: Record<string, unknown> = {}) => ({
  id, number, social_set_id: "d", platform: "bluesky", body: "Launch day\nSecond line", media: [] as string[], thread: [], status: "published",
  scheduled_at: "2026-11-03T08:00:00Z", published_at: "2026-11-03T08:00:00Z", error: null, created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-03T08:01:00Z", targets: [target()], lists: [], group_id: "g1", ...extra,
});

// A post made for Bluesky (published, two images, one with alt text) and Instagram (failed, rate limited).
async function group(page: Page, instaError = "Instagram: too many requests (429).") {
  const posts = [
    post("p-b", 11, { media: ["https://example.com/a.jpg", "https://example.com/b.jpg"], media_alt: ["A red door", ""] }),
    post("p-i", 12, { platform: "instagram", status: "failed", published_at: null, error: instaError, targets: [target({ id: "tg2", social_account_id: "c2", status: "failed", remote_id: null, remote_url: null, published_at: null, error: instaError })] }),
  ];
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: accounts }));
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: [{ id: "u-me", name: "Maya", email: "me@example.com", role: "owner", joined_at: "2026-10-01T10:00:00Z" }] }));
  await page.route(/\/v1\/posts\/(p-b|11)$/, (route) => route.fulfill({ json: posts[0] }));
  await page.route(/\/v1\/posts\?group_id=g1$/, (route) => route.fulfill({ json: posts }));
  await page.route(/\/v1\/social-sets\/d\/queue$/, (route) => route.fulfill({ json: { time_zone: "America/New_York", slots: [], next: [] } }));
  await page.route("https://example.com/*.jpg", (route) => route.fulfill({ status: 404 }));
  return posts;
}

test("a post made for two networks is one post: status, author, tabs, a failure with what to do, media with alt text and a timeline", async ({ page }) => {
  await group(page);
  await page.goto("/posts/11");
  await expect(page.getByText("Partly published", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Post 11")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch day" })).toBeVisible();
  const details = page.getByRole("list", { name: "Details" });
  await expect(details).toContainText("All sets");
  await expect(details).toContainText("Maya");
  await expect(details).toContainText("America/New York");
  // Times are in the set's zone, tagged with it.
  await expect(page.getByText("Published on Nov 3, 2026, 3:00 AM EST.")).toBeVisible();
  // The failure is said at the top, and its tab is one click away.
  const attention = page.getByRole("group", { name: "Needs attention" });
  await expect(attention).toContainText("Did not go out on Instagram");
  await attention.getByRole("button", { name: "Show Instagram" }).click();
  const tabs = page.getByRole("tablist", { name: "Networks" });
  await expect(tabs.getByRole("tab", { selected: true })).toContainText("Instagram");
  const why = page.getByRole("group", { name: "What went wrong for Alice on Instagram" });
  await expect(why).toContainText("too many requests");
  await expect(why).toContainText("Wait a few minutes, then Retry.");
  // Media of the first tab keeps its alt text, and says when it has none.
  await tabs.getByRole("tab", { name: /Bluesky/ }).click();
  await expect(page.getByText("A red door")).toBeVisible();
  await expect(page.getByText("No alt text")).toBeVisible();
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByRole("listitem").filter({ hasText: "Created by Maya for 2 networks" })).toBeVisible();
  await expect(timeline.getByRole("listitem").filter({ hasText: "Published on Bluesky, Alice" })).toBeVisible();
  await expect(timeline.getByRole("listitem").filter({ hasText: "Failed on Instagram, Alice on Instagram" })).toBeVisible();
});

test("Retry sends the failed version again and the page says so", async ({ page }) => {
  await group(page);
  let retried = "";
  await page.route(/\/v1\/posts\/p-i\/retry$/, (route) => {
    retried = route.request().method();
    return route.fulfill({ status: 202, json: { ...post("p-i", 12, { platform: "instagram", status: "queued", targets: [target({ id: "tg2", social_account_id: "c2", status: "pending", remote_id: null, published_at: null })] }), skipped_targets: [] } });
  });
  await page.goto("/posts/11");
  await page.getByRole("tab", { name: /Instagram/ }).click();
  await page.getByRole("button", { name: "Retry Instagram" }).click();
  await expect(page.getByText("Retrying. This page updates by itself.")).toBeVisible();
  expect(retried).toBe("POST");
});

test("a failure that may already have posted offers Duplicate but no Retry", async ({ page }) => {
  await group(page, "Instagram: publishing stopped midway and it may have posted.");
  await page.goto("/posts/11");
  await page.getByRole("tab", { name: /Instagram/ }).click();
  const why = page.getByRole("group", { name: "What went wrong for Alice on Instagram" });
  await expect(why).toContainText("Check the account on the network first");
  await expect(why.getByRole("button", { name: /Retry/ })).toHaveCount(0);
  await expect(why.getByRole("link", { name: "Duplicate" })).toHaveAttribute("href", "/t/acme22/posts/new?from=12");
});

test("the network tabs are a keyboard tablist on a phone-sized screen too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await group(page);
  await page.goto("/posts/11");
  const first = page.getByRole("tab", { name: /Bluesky/ });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Instagram/ })).toBeFocused();
  await expect(page.getByRole("tab", { name: /Instagram/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  // Nothing sideways: the tabs scroll inside their own row.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
