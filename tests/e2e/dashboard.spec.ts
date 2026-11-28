import { expect, test, type Page } from "@playwright/test";

// Home says "Today" and "Good afternoon" by the local clock: pin the zone so it reads the same everywhere.
test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const post = (id: string, extra: Record<string, unknown>) => ({
  id, social_set_id: "d", platform: "bluesky", body: `Body of ${id}`, media: [], thread: [], status: "draft",
  scheduled_at: null, published_at: null, error: null, created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", targets: [], lists: [], group_id: null, ...extra,
});
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const strip = (page: Page, label: string) => page.getByRole("list", { name: "This week" }).getByRole("link", { name: new RegExp(`^${label}`) });

// A mock brain at 13:00 in Berlin on Tuesday 10 November, with `posts` in the set "d". Everything else answers an empty list.
async function brain(page: Page, posts: unknown[] = []) {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00Z"));
  await page.addInitScript(() => {
    localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now()));
    localStorage.setItem("current-set:t1", "d");
  });
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (r) => r.fulfill({ json: sets }));
  await page.route(/\/v1\/posts(\?.*)?$/, (r) => r.fulfill({ json: posts }));
}

test("home greets, and shows what failed, what is next, recent posts, the inbox and a few counts for the current set", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00Z"));
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (r) => r.fulfill({ json: [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null }] }));
  await page.route("**/v1/connections", (r) =>
    r.fulfill({ json: [{ id: "c1", provider: "bluesky", external_id: "did:plc:a", handle: "acme.bsky.social", display_name: "Acme", avatar_url: null, token_expires_at: null, set_ids: ["d"], created_at: "2026-10-20T10:00:00Z" }] }),
  );
  const queries: URLSearchParams[] = [];
  await page.route(/\/v1\/posts(\?.*)?$/, (r) => {
    const q = new URL(r.request().url()).searchParams;
    queries.push(q);
    return r.fulfill({
      json: [
        post("p-soon", { status: "scheduled", scheduled_at: "2026-11-12T09:00:00Z", body: "Launch day" }),
        post("p-later", { status: "scheduled", scheduled_at: "2026-11-30T09:00:00Z", body: "Month end" }),
        post("p-pub", { status: "published", scheduled_at: "2026-11-08T09:00:00Z", published_at: "2026-11-08T09:00:00Z", body: "Hello" }),
        post("p-fail", { status: "failed", scheduled_at: "2026-11-09T09:00:00Z", error: "Bluesky refused the image", body: "Broken" }),
        post("p-old-fail", { status: "failed", scheduled_at: "2026-11-01T09:00:00Z", error: "An old failure", body: "Old" }),
      ],
    });
  });
  await page.route("**/v1/inboxes", (r) => r.fulfill({ json: [{ id: "all", name: "All", is_all: true, filters: { account_ids: [], kinds: [], platforms: [], keywords: [], unanswered: false }, created_at: "", updated_at: "" }] }));
  // The Inbox card asks for DMs and the Comments card for comments and mentions, each with its own first page.
  const row = (id: string, kind: string, text: string) => ({ id, social_account_id: "c1", platform: "bluesky", kind, remote_id: "x", remote_url: null, convo_id: null, post_id: null, author: { id: "a", handle: "bob.bsky.social", name: "Bob", avatar_url: null }, text, received_at: "2026-11-10T11:00:00Z", state: "open", replied_at: null, replies: [] });
  await page.route(/\/v1\/inboxes\/all\/items/, (r) =>
    r.fulfill({
      json: {
        items: new URL(r.request().url()).searchParams.get("kind") === "dm" ? [row("d1", "dm", "Can you call me?")] : [row("i1", "comment", "Where is the guide?")],
        next_cursor: "more",
      },
    }),
  );
  await page.route("**/v1/automations", (r) => r.fulfill({ json: [{ id: "a1", name: "Guide", active: true, runs: { count: 3, last_at: null } }, { id: "a2", name: "Off", active: false, runs: { count: 9, last_at: null } }] }));

  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  // 12:00 UTC is 13:00 in Berlin.
  await expect(page.getByRole("heading", { name: "Good afternoon, Me", level: 2 })).toBeVisible();
  await expect(page.getByText("Tuesday, November 10")).toBeVisible();
  await expect(page.getByRole("link", { name: "New post" })).toHaveAttribute("href", "/t/acme22/posts/new");
  await expect(page.getByRole("link", { name: "Upload CSV" })).toHaveAttribute("href", "/t/acme22/posts/bulk");
  await expect(strip(page, "Scheduled")).toContainText("1");
  await expect(strip(page, "Scheduled")).toHaveAttribute("href", "/t/acme22/calendar");
  await expect(strip(page, "Published")).toContainText("1");

  // Nothing goes out today or tomorrow, so the card says so and shows the next posts under their days.
  const next = page.getByRole("region", { name: "Today and next" });
  await expect(next).toContainText("Nothing is scheduled for today or tomorrow.");
  await expect(next.getByRole("link", { name: /Launch day/ })).toHaveAttribute("href", "/t/acme22/posts/p-soon");
  await expect(next.getByRole("listitem")).toHaveCount(2);
  await expect(next.getByRole("listitem").nth(1)).toContainText("Month end");
  await expect(next.getByRole("link", { name: "Open calendar" })).toHaveAttribute("href", "/t/acme22/calendar");
  await expect(page.getByRole("region", { name: "Needs attention" })).toContainText("Bluesky refused the image");
  // Failures older than a week drop off Home.
  await expect(page.getByRole("region", { name: "Needs attention" })).not.toContainText("An old failure");
  await expect(page.getByRole("region", { name: "Recently published" }).getByRole("link", { name: /Hello/ })).toBeVisible();
  const inbox = page.getByRole("region", { name: "Inbox" });
  await expect(inbox.getByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/t/acme22/inbox/all?item=d1");
  await expect(inbox).toContainText("Can you call me?");
  // This brain sends no open_count, so Home counts the first page.
  await expect(inbox).toContainText("1+ open");
  // Comments and mentions have their own card, linking to the Comments page.
  const comments = page.getByRole("region", { name: "Comments" });
  await expect(comments.getByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/t/acme22/comments?item=i1");
  await expect(comments).toContainText("Where is the guide?");
  await expect(comments).toContainText("1+ open");
  await expect(strip(page, "Open")).toContainText("1+");
  // The calmer home leaves automations and the account list to their own pages.
  await expect(page.getByRole("region", { name: "Automations" })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "All sets" }).click();
  await page.locator("#set-menu").getByRole("button", { name: "All sets" }).click();
  await expect.poll(() => queries.some((q) => q.get("social_set_id") === "d")).toBe(true);
  // The week's numbers read a week back (the clock is 2026-11-10T12:00Z); the latest published posts have their own call.
  expect(queries.some((q) => q.get("from") === "2026-11-03T12:00:00.000Z" && q.get("to") === "2026-12-10T12:00:00.000Z" && !q.has("status"))).toBe(true);
  expect(queries.some((q) => q.get("status") === "published" && q.get("order") === "desc" && q.get("limit") === "100")).toBe(true);
});

test("a section that fails to load says so with Retry while the others render", async ({ page }) => {
  await brain(page);
  let down = true;
  await page.route(/\/v1\/posts(\?.*)?$/, (r) =>
    down ? r.fulfill({ status: 500 }) : r.fulfill({ json: [post("p-today", { status: "scheduled", scheduled_at: "2026-11-10T15:00:00Z", body: "Back again" })] }),
  );
  await page.goto("/home");
  const next = page.getByRole("region", { name: "Today and next" });
  await expect(next.getByRole("alert")).toContainText("couldn't be loaded");
  await expect(page.getByRole("region", { name: "Recently published" }).getByRole("alert")).toContainText("couldn't be loaded");
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  // Nobody knows whether anything failed, so Home does not claim all is clear.
  await expect(page.getByText("All clear.")).toHaveCount(0);
  await expect(strip(page, "Scheduled")).toContainText("-");
  // The inbox and the stats have their own calls and are fine.
  await expect(page.getByRole("region", { name: "Inbox" })).toContainText("No open DMs.");
  await expect(strip(page, "Open")).toContainText("0");
  await expect(page.getByRole("region", { name: "Top post this week" })).toContainText("No stats yet.");

  down = false;
  await next.getByRole("button", { name: "Retry today and next" }).click();
  await expect(next.getByRole("link", { name: /Back again/ })).toBeVisible();
  await expect(next.getByRole("alert")).toHaveCount(0);
  await expect(strip(page, "Scheduled")).toContainText("1");
  await expect(page.getByText("All clear. Nothing needs your attention.")).toBeVisible();
});

test("the same failure on one network is one row with a count, the reason once and the posts in a fold", async ({ page }) => {
  const failed = (id: string, hour: string, extra: Record<string, unknown> = {}) =>
    post(id, { platform: "tiktok", status: "failed", scheduled_at: `2026-11-09T${hour}:00:00Z`, error: "TikTok refused the video", body: `Clip ${id}`, ...extra });
  await brain(page, [failed("f1", "08"), failed("f2", "09"), failed("f3", "10"), failed("f4", "11", { platform: "bluesky", error: "Bluesky refused the image" })]);
  await page.goto("/home");
  const attention = page.getByRole("region", { name: "Needs attention" });
  await expect(attention.locator("ul > li").filter({ has: page.locator("details") })).toHaveCount(2);
  const tiktok = attention.getByRole("listitem").filter({ hasText: "3 posts failed on TikTok" });
  await expect(tiktok.getByText("TikTok refused the video")).toHaveCount(1);
  await expect(attention.getByText("TikTok refused the video")).toHaveCount(1);
  await expect(tiktok.getByRole("link", { name: "View failed posts on TikTok" })).toHaveAttribute("href", "/t/acme22/posts?status=failed&network=tiktok");
  // The posts stay folded until asked for.
  await expect(tiktok.getByRole("link", { name: /Clip f1/ })).toBeHidden();
  await tiktok.getByText("Show the 3 posts").click();
  await expect(tiktok.locator("details").getByRole("listitem")).toHaveCount(3);
  await expect(tiktok.getByRole("link", { name: /Clip f1/ })).toHaveAttribute("href", "/t/acme22/posts/f1");
  await expect(attention.getByText("1 post failed on Bluesky")).toBeVisible();
  await expect(page.getByText("All clear.")).toHaveCount(0);
});

const metrics = (likes: number, comments: number) => ({ likes, comments, shares: 0, views: null, fetched_at: "2026-11-10T10:00:00Z" });
const sent = (id: string, day: string, extra: Record<string, unknown> = {}) =>
  post(id, { status: "published", scheduled_at: `2026-11-${day}T09:00:00Z`, published_at: `2026-11-${day}T09:00:00Z`, ...extra });
// Two posts in the next week (one goes to two networks), three out in the last week and one before it.
const week = [
  post("s-b", { status: "scheduled", scheduled_at: "2026-11-10T15:00:00Z", body: "Launch day", group_id: "g1" }),
  post("s-x", { status: "scheduled", scheduled_at: "2026-11-10T15:00:00Z", body: "Launch day", group_id: "g1", platform: "x" }),
  post("s-2", { status: "scheduled", scheduled_at: "2026-11-11T08:00:00Z", body: "Morning tip" }),
  post("s-far", { status: "scheduled", scheduled_at: "2026-11-25T08:00:00Z", body: "Far away" }),
  sent("p-1", "09", { body: "With numbers", targets: [{ id: "tg1", social_account_id: "c1", status: "published", remote_id: "r", remote_url: null, error: null, published_at: "2026-11-09T09:00:00Z", parts: [], metrics: metrics(12, 1) }] }),
  sent("p-2", "08"),
  sent("p-3", "05"),
  sent("p-old", "01"),
];

test("the strip shows the week's numbers, each linking to its page", async ({ page }) => {
  await brain(page, week);
  const asked: URLSearchParams[] = [];
  await page.route(/\/v1\/analytics(\?.*)?$/, (r) => {
    asked.push(new URL(r.request().url()).searchParams);
    return r.fulfill({
      json: {
        supported: ["bluesky", "facebook", "instagram", "youtube"],
        totals: { posts: 3, likes: 1234, comments: 56, shares: 7, views: 8900 },
        by_platform: [],
        by_day: [
          { date: "2026-11-08", posts: 1, likes: 1200, comments: 50, shares: 7, views: 0 },
          { date: "2026-11-09", posts: 1, likes: 34, comments: 6, shares: 0, views: 8900 },
        ],
        top_posts: [sent("p-top", "08", { body: "The big launch", targets: [{ id: "tg2", social_account_id: "c1", status: "published", remote_id: "r", remote_url: null, error: null, published_at: "2026-11-08T09:00:00Z", parts: [], metrics: { ...metrics(1200, 50), shares: 7 } }] })],
      },
    });
  });
  await page.route("**/v1/inboxes", (r) => r.fulfill({ json: [{ id: "all", name: "All", is_all: true, open_count: 12, open_dm_count: 5, open_comment_count: 7, filters: { account_ids: [], kinds: [], platforms: [], keywords: [], unanswered: false }, created_at: "", updated_at: "" }] }));
  await page.route(/\/v1\/inboxes\/all\/items/, (r) => r.fulfill({ json: { items: [], next_cursor: null } }));
  await page.goto("/home");

  await expect(strip(page, "Scheduled")).toContainText("2");
  await expect(strip(page, "Published")).toContainText("3");
  await expect(strip(page, "Published")).toHaveAttribute("href", "/t/acme22/posts?status=published");
  // 1234 likes, 56 comments and 7 shares.
  const engagement = strip(page, "Engagement");
  await expect(engagement).toContainText("1.3K");
  await expect(engagement).toHaveAttribute("href", "/t/acme22/analytics?range=7");
  await expect(engagement).toHaveAttribute("title", "Stats cover Bluesky, Facebook, Instagram and YouTube");
  await expect(engagement.locator("svg polyline")).toHaveCount(1);
  // The strip counts the Inbox, which lists DMs: 5 of the 12 open items.
  await expect(strip(page, "Open")).toContainText("5");
  await expect(strip(page, "Open")).toHaveAttribute("href", "/t/acme22/inbox");
  expect(asked.some((q) => q.get("from") === "2026-11-04" && q.get("to") === "2026-11-10" && q.get("social_set_id") === "d")).toBe(true);

  const top = page.getByRole("region", { name: "Top post this week" });
  await expect(top.getByRole("link", { name: /The big launch/ })).toHaveAttribute("href", "/t/acme22/posts/p-top");
  await expect(top).toContainText("1.2K likes, 50 comments, 7 shares");
  const recent = page.getByRole("region", { name: "Recently published" });
  await expect(recent.getByRole("listitem")).toHaveCount(4);
  await expect(recent.getByRole("link", { name: /With numbers/ })).toContainText("12 likes, 1 comment");
  await expect(page.getByText("All clear. Nothing needs your attention.")).toBeVisible();
});

test("today and tomorrow are a timeline, a post on several networks is one row, with the next queue slot", async ({ page }) => {
  await brain(page, week);
  await page.route("**/v1/social-sets/d/queue", (r) => r.fulfill({ json: { time_zone: "Europe/Berlin", slots: [{ weekday: 4, time: "09:00" }], next: ["2026-11-12T08:00:00Z"] } }));
  await page.goto("/home");
  const next = page.getByRole("region", { name: "Today and next" });
  await expect(next.getByRole("heading", { level: 3 })).toHaveText([/^Today/, /^Tomorrow/]);
  await expect(next.getByRole("listitem")).toHaveCount(2);
  const launch = next.getByRole("link", { name: /Launch day/ });
  await expect(launch).toHaveCount(1);
  await expect(launch).toContainText("4:00 PM");
  await expect(launch).toContainText("Bluesky");
  await expect(launch).toContainText("X:");
  await expect(next).not.toContainText("Far away");
  await expect(next).toContainText("Next queue slot:");
  await expect(next.getByRole("link", { name: "Thu, Nov 12, 9:00 AM" })).toHaveAttribute("href", "/t/acme22/queue");
});

test("home has no sideways scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await brain(page, [...week, post("f1", { platform: "tiktok", status: "failed", scheduled_at: "2026-11-09T08:00:00Z", error: "TikTok refused the video because the file is longer than the account may post", body: "A clip with a long caption that has to be cut short on a narrow screen" })]);
  await page.goto("/home");
  await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Recently published" }).getByRole("listitem")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  // The strip is two by two.
  const boxes = await Promise.all(["Scheduled", "Published", "Engagement", "Open"].map((l) => strip(page, l).boundingBox()));
  expect(boxes[0]!.y).toBe(boxes[1]!.y);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
  expect(boxes[2]!.x).toBe(boxes[0]!.x);
});

test("home warns about accounts to reconnect, with a Reconnect link for owners", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  const li = { id: "c2", provider: "linkedin", external_id: "abc", handle: null, avatar_url: null, set_ids: [], created_at: "2026-10-20T10:00:00Z" };
  await page.route("**/v1/connections", (r) =>
    r.fulfill({
      json: [
        { id: "c1", provider: "bluesky", external_id: "did:plc:a", handle: "acme.bsky.social", display_name: "Acme", avatar_url: null, token_expires_at: null, set_ids: [], created_at: "2026-10-20T10:00:00Z", status: "ok" },
        { ...li, display_name: "Soon Sam", status: "expiring", token_expires_at: "2026-11-20T10:00:00Z" },
        { ...li, id: "c3", display_name: "Gone Gia", status: "reconnect", token_expires_at: "2026-11-01T10:00:00Z" },
      ],
    }),
  );
  await page.goto("/home");
  const warning = page.getByRole("region", { name: "Accounts need reconnecting" });
  await expect(warning.getByRole("listitem")).toHaveCount(2);
  await expect(warning.getByRole("listitem").nth(0)).toContainText("Soon Sam");
  await expect(warning.getByRole("listitem").nth(0)).toContainText("stops working on");
  await expect(warning.getByRole("listitem").nth(1)).toContainText("Gone Gia needs reconnecting");
  await expect(warning.getByRole("link", { name: "Reconnect Gone Gia" })).toHaveAttribute("href", /\/connections\/linkedin\/redirect\?team=acme22$/);
});

test("home warns about only the picked set's accounts", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now()));
    localStorage.setItem("current-set:t1", "s2");
  });
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  const set = (id: string, name: string) => ({ id, name, is_default: id === "d", account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null });
  await page.route(/\/v1\/social-sets$/, (r) => r.fulfill({ json: [set("d", "All sets"), set("s2", "English")] }));
  const account = { id: "c1", provider: "bluesky", external_id: "did:plc:a", handle: "acme.bsky.social", display_name: "Acme", avatar_url: null, token_expires_at: null, set_ids: ["d", "s2"], created_at: "2026-10-20T10:00:00Z", status: "ok" };
  await page.route("**/v1/connections", (r) =>
    r.fulfill({ json: [account, { ...account, id: "c2", provider: "linkedin", handle: null, display_name: "Gone Gia", set_ids: ["d"], status: "reconnect", token_expires_at: "2026-11-01T10:00:00Z" }] }),
  );
  await page.goto("/home");
  await expect(page.getByText("All clear. Nothing needs your attention.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Accounts need reconnecting" })).toHaveCount(0);
  // The default set holds every account, the one to reconnect included.
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "English" }).click();
  await page.locator("#set-menu").getByRole("button", { name: "All sets" }).click();
  await expect(page.getByRole("region", { name: "Accounts need reconnecting" }).getByRole("listitem")).toHaveCount(1);
});

test("home says all is clear when every account is fine and nothing failed", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route("**/v1/connections", (r) =>
    r.fulfill({ json: [{ id: "c1", provider: "bluesky", external_id: "did:plc:a", handle: "acme.bsky.social", display_name: "Acme", avatar_url: null, token_expires_at: null, set_ids: [], created_at: "2026-10-20T10:00:00Z", status: "ok" }] }),
  );
  await page.goto("/home");
  await expect(page.getByText("All clear. Nothing needs your attention.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Accounts need reconnecting" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
});
