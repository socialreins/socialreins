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

test("a post's timeline shows the steps brain logged, newest first, with a link to the network", async ({ page }) => {
  await group(page);
  const event = (id: string, kind: string, detail: string | null, target: string | null, created: string) => ({ id, kind, detail, target_id: target, created_at: created });
  await page.route(/\/v1\/posts\/p-b\/events/, (route) =>
    route.fulfill({
      json: {
        events: [
          event("e1", "published", "at://r1", "tg1", "2026-11-03T08:00:30Z"),
          event("e2", "attempt_started", "1", "tg1", "2026-11-03T08:00:00Z"),
          event("e3", "target_claimed", null, "tg1", "2026-11-03T07:59:58Z"),
        ],
        next_cursor: null,
      },
    }),
  );
  await page.route(/\/v1\/posts\/p-i\/events/, (route) =>
    route.fulfill({
      json: {
        events: [
          event("e4", "failed", "Instagram: too many requests (429).", "tg2", "2026-11-03T08:01:00Z"),
          event("e5", "retry_scheduled", "2026-11-03T08:06:00Z", "tg2", "2026-11-03T08:01:01Z"),
        ],
        next_cursor: null,
      },
    }),
  );
  await page.goto("/posts/11");
  const timeline = page.getByRole("region", { name: "Timeline" });
  const lines = timeline.getByRole("listitem");
  await expect(lines.first()).toContainText("Automatic retry on Instagram, Alice on Instagram for Nov 3, 2026, 3:06 AM EST");
  await expect(lines.nth(1)).toContainText("Failed on Instagram, Alice on Instagram: Instagram: too many requests (429).");
  await expect(lines.nth(2)).toContainText("Published on Bluesky, Alice");
  await expect(lines.last()).toContainText("Picked up to publish on Bluesky, Alice");
  await expect(timeline.getByText("Each step brain took, newest first.")).toBeVisible();
  await expect(timeline.getByRole("link", { name: /View on Bluesky/ })).toHaveAttribute("href", "https://bsky.app/p/1");
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

test("a failed account with no error text still says so and offers Duplicate", async ({ page }) => {
  await group(page, "");
  await page.goto("/posts/11");
  await page.getByRole("tab", { name: /Instagram/ }).click();
  const why = page.getByRole("group", { name: "What went wrong for Alice on Instagram" });
  await expect(why).toContainText("No reason was given.");
  await expect(why.getByRole("link", { name: "Duplicate" })).toBeVisible();
});

test("a version's take down is asked on its tab, goes away with the tab and says what it did", async ({ page }) => {
  const posts = await group(page);
  posts[1] = { ...posts[1], status: "published", error: null, targets: [target({ id: "tg2", social_account_id: "c2" })] } as never;
  let deleted = 0;
  await page.route(/\/v1\/posts\/p-b$/, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: posts[0] });
    deleted++;
    return route.fulfill({ json: { ...posts[0], status: "deleted", targets: [target({ status: "deleted" })] } });
  });
  await page.goto("/posts/11");
  await page.getByRole("button", { name: "Take down Bluesky" }).click();
  await expect(page.getByRole("button", { name: "Yes, take it down" })).toBeFocused();
  // Moving to another tab drops the question, and the header offers Take down all again.
  await page.getByRole("tab", { name: /Instagram/ }).click();
  await expect(page.getByRole("button", { name: "Yes, take it down" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Take down all" })).toBeVisible();
  await page.getByRole("tab", { name: /Bluesky/ }).click();
  await page.getByRole("button", { name: "Take down Bluesky" }).click();
  await page.getByRole("button", { name: "Yes, take it down" }).click();
  await expect(page.getByText("Taken down from Bluesky.")).toBeFocused();
  expect(deleted).toBe(1);
});
