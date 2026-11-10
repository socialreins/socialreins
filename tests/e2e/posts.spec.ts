import { expect, test, type Page } from "@playwright/test";

// Fixed zone so "Publish at" converts to a known UTC time.
test.use({ timezoneId: "Europe/Berlin" });

const me = {
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,

  current_team: { id: "t1", name: "Acme", role: "member" },
};
const sets = [
  { id: "d", name: "Default", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null },
  { id: "s1", name: "Clients", is_default: false, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null },
];
const alice = {
  id: "c1",
  provider: "bluesky",
  external_id: "did:plc:alice",
  handle: "alice.bsky.social",
  display_name: "Alice",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  created_at: "2026-10-20T10:00:00Z",
};
type Post = ReturnType<typeof post>;
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  social_set_id: "d",
  platform: "bluesky",
  body: `Body of ${id}`,
  media: [] as string[],
  thread: [] as { body: string; media: string[] }[],
  status: "draft",
  scheduled_at: null as string | null,
  published_at: null as string | null,
  error: null as string | null,
  created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [] as Record<string, unknown>[],
  lists: [] as { id: string; name: string; position: number }[],
  group_id: null as string | null,
  ...extra,
});
const target = (extra: Record<string, unknown> = {}) => ({
  id: "tg1",
  social_account_id: "c1",
  status: "published",
  remote_id: "at://did:plc:alice/app.bsky.feed.post/1",
  remote_url: "https://bsky.app/profile/alice.bsky.social/post/1",
  error: null,
  published_at: "2026-11-03T08:00:00Z",
  parts: [] as Record<string, unknown>[],
  ...extra,
});

async function brain(page: Page, { accounts = [alice] }: { accounts?: unknown[] } = {}) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: accounts }));
}

test("app links to posts", async ({ page }) => {
  await brain(page);
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto("/home");
  await page.getByRole("link", { name: "Posts", exact: true }).click();
  await expect(page).toHaveURL("/posts");
});

test("posts sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/posts");
  await expect(page).toHaveURL("/login");
});

test("calendar shows the month's posts, with filter and month steps; posts lists them with drafts", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+01:00"));
  await brain(page);
  const queries: URLSearchParams[] = [];
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    queries.push(q);
    if (q.get("status") === "draft") return route.fulfill({ json: [post("p-draft", { body: "An unfinished thought" })] });
    if (q.get("from")?.startsWith("2026-10-31")) {
      return route.fulfill({
        json: [
          post("p-sched", { status: "scheduled", scheduled_at: "2026-11-12T09:30:00Z", body: "Launch day" }),
          post("p-pub", { status: "published", scheduled_at: "2026-11-03T08:00:00Z", published_at: "2026-11-03T08:00:00Z", body: "Hello Bluesky", targets: [target()] }),
        ],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/posts");
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  const days = page.getByRole("list", { name: "Posts in November 2026" });
  await expect(days.getByRole("link", { name: /10:30.*Launch day$/ })).toHaveAttribute("href", "/posts/p-sched");
  await expect(page.getByRole("region", { name: "Drafts" }).getByRole("link", { name: "An unfinished thought" })).toHaveAttribute("href", "/posts/p-draft");
  expect(queries[0]?.get("to")).toBe("2026-11-30T23:00:00.000Z");

  await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page).toHaveURL("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
  const table = page.getByRole("table", { name: "Posts in November 2026" });
  await expect(table.getByRole("link", { name: /10:30.*Launch day$/ })).toHaveAttribute("href", "/posts/p-sched");
  await expect(table.getByRole("link", { name: /0?9:00.*Hello Bluesky$/ })).toHaveAttribute("href", "/posts/p-pub");
  await expect(table.getByRole("link", { name: "View on Bluesky" })).toHaveAttribute("href", "https://bsky.app/profile/alice.bsky.social/post/1");
  await expect(page.getByRole("region", { name: "Drafts" })).toHaveCount(0);

  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();
  await expect.poll(() => queries.some((q) => q.get("from") === "2026-11-30T23:00:00.000Z")).toBe(true);
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Default" }).click();
  await page.locator("#set-menu").getByRole("button", { name: "Clients" }).click();
  await expect(page.locator("#set-menu")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Clients" })).toBeVisible();
  await expect.poll(() => queries.some((q) => q.get("social_set_id") === "s1" && q.get("from") !== null)).toBe(true);

  // The picked set filters the drafts on Posts, is the default for a new post, and survives a reload.
  await page.goto("/posts");
  await expect.poll(() => queries.some((q) => q.get("social_set_id") === "s1" && q.get("status") === "draft")).toBe(true);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Clients" })).toBeVisible();
  await page.goto("/posts/new");
  await expect(page.getByLabel("Set")).toHaveValue("s1");
});

test("on a phone the month is a list of days, not a wide grid", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+01:00"));
  await page.setViewportSize({ width: 390, height: 844 });
  await brain(page);
  await page.route(/\/v1\/posts(\?.*)?$/, (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.get("status") === "draft" ? [] : [post("p-sched", { status: "scheduled", scheduled_at: "2026-11-12T09:30:00Z", body: "Launch day" })],
    }),
  );
  await page.goto("/calendar");
  await expect(page.getByRole("table")).toBeHidden();
  const days = page.getByRole("list", { name: "Posts in November 2026" });
  await expect(days.getByRole("link", { name: /Launch day/ })).toHaveAttribute("href", "/posts/p-sched");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a team without Bluesky sees a note linking to connections", async ({ page }) => {
  await brain(page, { accounts: [] });
  await page.goto("/posts/new");
  const note = page.getByText("No Bluesky, Threads, LinkedIn, X, TikTok, YouTube, Facebook or Instagram account is connected to this team yet");
  await expect(note).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect an account" })).toHaveAttribute("href", "/connections");
});

test("compose checks length, images and schedule before asking brain", async ({ page }) => {
  await brain(page);
  let creates = 0;
  await page.route("**/v1/posts", (route) => {
    creates++;
    return route.fulfill({ status: 422, json: { error: "invalid_media" } });
  });
  await page.goto("/posts/new");
  const body = page.getByLabel("Post", { exact: true });
  await body.fill("👨‍👩‍👧");
  await expect(page.getByText("1 of 300 characters")).toBeVisible();
  await body.fill("a".repeat(301));
  await expect(page.getByText("301 of 300 characters")).toBeVisible();
  await expect(body).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").filter({ hasText: "1 over Bluesky's limit" })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "at most 300 characters" })).toBeVisible();

  await body.fill("");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Write something or add an image" })).toBeVisible();

  await body.fill("Hello");
  await page.getByRole("button", { name: "Add image" }).click();
  await expect(page.getByLabel("Image 1 link")).toBeFocused();
  await page.getByLabel("Image 1 link").fill("http://example.com/a.png");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "must be public https links" })).toBeVisible();
  await page.getByLabel("Image 1 link").fill("");
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Pick a date and time" })).toBeVisible();
  expect(creates).toBe(0);

  // brain still judges, e.g. an image over 1 MB.
  await page.getByLabel("Image 1 link").fill("https://example.com/huge.png");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "must be public https links" })).toBeVisible();
  expect(creates).toBe(1);
});

test("schedule sends the local time as UTC and moves to the post's address", async ({ page }) => {
  await brain(page, { accounts: [{ ...alice, set_ids: ["d", "s1"] }] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", { ...sent, status: "scheduled" }) });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Set").selectOption("s1");
  await page.getByLabel("Post", { exact: true }).fill("Launch day");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/a.png");
  await page.getByLabel("Publish at").fill("2026-11-20T09:30");
  await expect(page.getByText("In your time zone, Europe/Berlin.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText(/^Scheduled for .*20, 2026/).last()).toBeFocused();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toEqual({
    social_set_id: "s1",
    platform: "bluesky",
    body: "Launch day",
    media: ["https://example.com/a.png"],
    thread: [],
    scheduled_at: "2026-11-20T08:30:00.000Z",
  });
});

test("a thread is written, checked, previewed and sent in order", async ({ page }) => {
  await brain(page);
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("One");
  await page.getByRole("button", { name: "Add to thread" }).click();
  await expect(page.getByRole("textbox", { name: "Post 2" })).toBeFocused();
  await page.getByRole("textbox", { name: "Post 2" }).fill("Two");
  await page.getByRole("button", { name: "Add to thread" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Post 3 of the thread: Write something" })).toBeVisible();
  expect(sent).toBeUndefined();
  await page.getByRole("button", { name: "Remove post 3" }).click();
  await expect(page.getByRole("button", { name: "Add to thread" })).toBeFocused();
  await expect(page.getByRole("region", { name: "Preview" }).getByText("Two")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent?.thread).toEqual([{ body: "Two", media: [] }]);
  await expect(page.getByRole("textbox", { name: "Post 2" })).toHaveValue("Two");
});

test("each thread post takes its own images", async ({ page }) => {
  await brain(page);
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("One");
  await page.getByRole("button", { name: "Add to thread" }).click();
  await page.getByRole("textbox", { name: "Post 2", exact: true }).fill("Two");

  const add = page.getByRole("button", { name: "Add image to post 2" });
  await add.click();
  await expect(page.getByLabel("Image 1 link of post 2")).toBeFocused();
  await page.getByLabel("Image 1 link of post 2").fill("https://drive.google.com/file/d/abc/view");
  await add.click();
  await expect(page.getByLabel("Image 2 link of post 2")).toBeFocused();
  await page.getByLabel("Image 2 link of post 2").fill("http://example.com/b.png");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Post 2 of the thread:" })).toBeVisible();
  expect(sent).toBeUndefined();

  await page.getByRole("button", { name: "Remove image 2 of post 2" }).click();
  await expect(add).toBeFocused();
  // The first post's images are separate.
  await expect(page.getByLabel("Image 1 link", { exact: true })).toHaveCount(0);
  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview.getByRole("listitem")).toHaveCount(1);
  await expect(preview.getByRole("listitem")).toHaveText("view");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent?.media).toEqual([]);
  expect(sent?.thread).toEqual([{ body: "Two", media: ["https://drive.google.com/file/d/abc/view"] }]);
  await expect(page.getByLabel("Image 1 link of post 2")).toHaveValue("https://drive.google.com/file/d/abc/view");
});

test("a published thread links each follow-up post", async ({ page }) => {
  await brain(page);
  const part = { remote_id: "at://did:plc:alice/app.bsky.feed.post/2", remote_url: "https://bsky.app/profile/alice.bsky.social/post/2", published_at: null };
  await page.route("**/v1/posts/p6", (route) =>
    route.fulfill({
      json: post("p6", {
        status: "published",
        published_at: "2026-11-03T08:00:00Z",
        thread: [{ body: "Two", media: [] }],
        targets: [target({ parts: [part] })],
      }),
    }),
  );
  await page.goto("/posts/p6");
  await expect(page.getByText("Thread: 1 of 1 follow-up posts out.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Post 2 on / })).toHaveAttribute("href", part.remote_url);
});

test("publish now polls until the post is published", async ({ page }) => {
  await brain(page);
  let state: Post = post("p2");
  let polls = 0;
  await page.route("**/v1/posts", (route) => {
    state = post("p2", { body: route.request().postDataJSON().body });
    return route.fulfill({ status: 201, json: state });
  });
  await page.route("**/v1/posts/p2/publish", (route) => {
    state = { ...state, status: "queued", scheduled_at: new Date().toISOString() };
    return route.fulfill({ status: 202, json: state });
  });
  await page.route("**/v1/posts/p2", (route) => {
    polls++;
    if (polls >= 2) state = { ...state, status: "published", published_at: new Date().toISOString(), targets: [target()] };
    return route.fulfill({ json: state });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Right now");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publishing. This page updates by itself." })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: /^Published on / })).toBeVisible({ timeout: 10_000 });
  // No "publishing" message is left behind once the post is out.
  await expect(page.getByText(/Publishing|Sent to Bluesky/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View on Bluesky" })).toHaveAttribute("href", "https://bsky.app/profile/alice.bsky.social/post/1");
  await expect(page.getByText("Alice: published")).toBeVisible();
  expect(polls).toBe(2);
});

test("publish now explains the daily quota", async ({ page }) => {
  await brain(page);
  await page.route("**/v1/posts", (route) => route.fulfill({ status: 201, json: post("p4") }));
  await page.route("**/v1/posts/p4/publish", (route) => route.fulfill({ status: 429, json: { error: "publish_quota" } }));
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("One too many");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "limit of 100 published posts today" })).toBeVisible();
  await expect(page).toHaveURL("/posts/p4");
});

test("a published TikTok post has no Take down, only where to delete it", async ({ page }) => {
  await brain(page);
  const published = post("p9", { platform: "tiktok", status: "published", scheduled_at: "2026-11-03T08:00:00Z", published_at: "2026-11-03T08:00:00Z", targets: [target()] });
  await page.route("**/v1/posts/p9", (route) => route.fulfill({ json: published }));
  await page.goto("/posts/p9");
  await expect(page.getByText("TikTok does not let other apps delete a post. Delete it in the TikTok app.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Take down" })).toHaveCount(0);
});

test("take down shows brain's message when it can't finish, then succeeds", async ({ page }) => {
  await brain(page);
  const published = post("p3", { status: "published", scheduled_at: "2026-11-03T08:00:00Z", published_at: "2026-11-03T08:00:00Z", targets: [target()] });
  let deletes = 0;
  await page.route("**/v1/posts/p3", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: published });
    deletes++;
    return deletes === 1
      ? route.fulfill({ status: 422, json: { error: "takedown_failed", message: "Alice's app password was revoked. Delete the post on Bluesky by hand." } })
      : route.fulfill({ json: { ...published, status: "deleted", targets: [target({ status: "deleted" })] } });
  });
  await page.goto("/posts/p3");
  await expect(page.getByLabel("Post", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Take down" }).click();
  await expect(page.getByRole("button", { name: "Yes, take it down" })).toBeFocused();
  await page.getByRole("button", { name: "Yes, take it down" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Alice's app password was revoked. Delete the post on Bluesky by hand." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take down" })).toBeFocused();
  await page.getByRole("button", { name: "Take down" }).click();
  await page.getByRole("button", { name: "Yes, take it down" }).click();
  await expect(page.getByText("Taken down from Bluesky.")).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Taken down." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take down" })).toHaveCount(0);
});

test("a failed post is read-only with its error and target statuses", async ({ page }) => {
  await brain(page);
  await page.route("**/v1/posts/p5", (route) =>
    route.fulfill({
      json: post("p5", {
        status: "failed",
        error: "Alice: the image is over 1 MB.",
        targets: [target({ status: "failed", remote_url: null, error: "image too large" })],
      }),
    }),
  );
  await page.goto("/posts/p5");
  await expect(page.getByRole("status").filter({ hasText: "Failed." })).toBeVisible();
  await expect(page.getByText("What went wrong: Alice: the image is over 1 MB.")).toBeVisible();
  await expect(page.getByText("Alice: failed. image too large")).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete|Take down|Save draft/ })).toHaveCount(0);
});

test("a draft can be edited and deleted", async ({ page }) => {
  await brain(page);
  const calls: string[] = [];
  await page.route("**/v1/posts/p6", (route) => {
    const m = route.request().method();
    calls.push(m);
    if (m === "GET") return route.fulfill({ json: post("p6", { body: "Old words" }) });
    if (m === "PUT") return route.fulfill({ json: post("p6", { body: route.request().postDataJSON().body }) });
    return route.fulfill({ status: 204 });
  });
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto("/posts/p6");
  await expect(page.getByLabel("Post", { exact: true })).toHaveValue("Old words");
  await page.getByLabel("Post", { exact: true }).fill("New words");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeFocused();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL("/posts");
  expect(calls).toEqual(["GET", "PUT", "DELETE"]);
});

const account = (id: string, provider: string, name: string) => ({ ...alice, id, provider, external_id: id, handle: null, display_name: name });
const threadsAcc = account("c2", "threads", "Alice on Threads");
const instaAcc = account("c3", "instagram", "Alice on Instagram");

test("a post for several platforms is one group, published on each", async ({ page }) => {
  await brain(page, { accounts: [alice, threadsAcc, instaAcc] });
  const ids = { bluesky: "g-b", threads: "g-t", instagram: "g-i" } as const;
  const owner: Record<string, string> = { "g-b": "c1", "g-t": "c2", "g-i": "c3" };
  let sent: Record<string, unknown> | undefined;
  let state: Post[] = [];
  const published: string[] = [];
  await page.route("**/v1/post-groups", (route) => {
    sent = route.request().postDataJSON();
    state = (Object.keys(ids) as (keyof typeof ids)[]).map((p) => post(ids[p], { platform: p, group_id: "g1", body: "Hello all", media: ["https://example.com/a.jpg"] }));
    return route.fulfill({ status: 201, json: { group_id: "g1", posts: state } });
  });
  await page.route(/\/v1\/posts\/g-.\/publish$/, (route) => {
    const id = route.request().url().split("/").at(-2)!;
    published.push(id);
    state = state.map((p) => (p.id === id ? { ...p, status: "queued" } : p));
    return route.fulfill({ status: 202, json: state.find((p) => p.id === id) });
  });
  await page.route(/\/v1\/posts\?group_id=g1$/, (route) => {
    state = state.map((p) => ({
      ...p,
      status: "published",
      published_at: "2026-11-03T08:00:00Z",
      targets: [target({ id: `t-${p.id}`, social_account_id: owner[p.id], remote_url: `https://example.com/${p.platform}/1` })],
    }));
    return route.fulfill({ json: state });
  });
  await page.goto("/posts/new");
  const to = page.getByRole("group", { name: "Post to" });
  // Every platform with an account in the set is ticked to start with.
  for (const name of [/Bluesky/, /Threads/, /Instagram/]) await expect(to.getByRole("checkbox", { name })).toBeChecked();
  await page.getByLabel("Post", { exact: true }).fill("Hello all");
  await expect(page.getByText("Bluesky: 9 of 300 characters")).toBeVisible();
  await expect(page.getByText("Threads: 9 of 500 characters")).toBeVisible();
  await expect(page.getByText("Instagram: 9 of 2,200 characters")).toBeVisible();
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/a.jpg");
  await page.getByRole("button", { name: "Add to thread" }).click();
  await page.getByRole("textbox", { name: "Post 2" }).fill("Two");
  await expect(page.getByText("Instagram can't post threads, so it gets only the first post.")).toBeVisible();
  await page.getByRole("button", { name: "Publish now" }).click();

  await expect(page).toHaveURL("/posts/g-b");
  await expect(page.getByRole("status").filter({ hasText: /^Published on / })).toBeVisible({ timeout: 10_000 });
  expect(sent).toEqual({
    social_set_id: "d",
    platforms: ["bluesky", "threads", "instagram"],
    body: "Hello all",
    media: ["https://example.com/a.jpg"],
    thread: [{ body: "Two", media: [] }],
    scheduled_at: null,
    overrides: { instagram: { thread: [] } },
  });
  expect(published).toEqual(["g-b", "g-t", "g-i"]);
  await expect(page.getByRole("link", { name: "View on Bluesky" })).toHaveAttribute("href", "https://example.com/bluesky/1");
  const others = page.getByRole("region", { name: "Same post on other platforms" });
  await expect(others.getByRole("link", { name: "Threads post" })).toHaveAttribute("href", "/posts/g-t");
  await expect(others.getByRole("link", { name: "View on Threads" })).toHaveAttribute("href", "https://example.com/threads/1");
  await expect(others.getByRole("link", { name: "View on Instagram" })).toHaveAttribute("href", "https://example.com/instagram/1");
});

test("Instagram without an image is flagged before brain is asked", async ({ page }) => {
  await brain(page, { accounts: [alice, instaAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Words only");
  const warning = page.getByRole("listitem").filter({ hasText: "Instagram needs at least one image or video." });
  await expect(warning).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Instagram needs at least one image or video." })).toBeVisible();
  expect(sent).toBeUndefined();

  // Without Instagram it is a single Bluesky post.
  await page.getByRole("group", { name: "Post to" }).getByRole("checkbox", { name: /Instagram/ }).uncheck();
  await expect(warning).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toMatchObject({ platform: "bluesky", body: "Words only" });
});

const linkedinAcc = account("c4", "linkedin", "Alice on LinkedIn");

test("LinkedIn takes 3000 characters and no thread", async ({ page }) => {
  await brain(page, { accounts: [linkedinAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  const body = page.getByLabel("Post", { exact: true });
  await body.fill("a".repeat(3001));
  await expect(page.getByRole("alert").filter({ hasText: "1 over LinkedIn's limit of 3,000" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to thread" })).toHaveCount(0);
  await body.fill("a".repeat(3000));
  await expect(page.getByText("LinkedIn: 3,000 of 3,000 characters")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toMatchObject({ platform: "linkedin", body: "a".repeat(3000) });
});

test("a first comment is offered on LinkedIn, counted and sent with the post", async ({ page }) => {
  await brain(page, { accounts: [linkedinAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("A claim");
  const comment = page.getByLabel("First comment", { exact: true });
  await comment.fill("a".repeat(1251));
  await expect(page.getByRole("alert").filter({ hasText: "1 over LinkedIn's first comment limit of 1,250" })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "LinkedIn takes a first comment of at most 1,250 characters." })).toBeVisible();
  expect(sent).toBeUndefined();
  await comment.fill("Sources: example.org");
  await expect(page.getByText("LinkedIn: 20 of 1,250 characters")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toMatchObject({ platform: "linkedin", body: "A claim", first_comment: "Sources: example.org" });
});

test("a platform without first comments hides the box and a group sends empty overrides there", async ({ page }) => {
  await brain(page, { accounts: [alice, linkedinAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/post-groups", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { group_id: "g1", posts: [post("g-b", { group_id: "g1" }), post("g-l", { platform: "linkedin", group_id: "g1" })] } });
  });
  await page.goto("/posts/new");
  const to = page.getByRole("group", { name: "Post to" });
  // Bluesky alone has no first comment box.
  await to.getByRole("checkbox", { name: /LinkedIn/ }).uncheck();
  await expect(page.getByLabel("First comment", { exact: true })).toHaveCount(0);
  await to.getByRole("checkbox", { name: /LinkedIn/ }).check();
  await page.getByLabel("Post", { exact: true }).fill("Hello");
  await page.getByLabel("First comment", { exact: true }).fill("Sources");
  await expect(page.getByText("Bluesky can't post one, so it gets none.")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/g-b");
  expect(sent).toMatchObject({ platforms: ["bluesky", "linkedin"], first_comment: "Sources", overrides: { bluesky: { first_comment: "" } } });
});

test("a published post shows its first comment and whether each account posted it", async ({ page }) => {
  await brain(page);
  await page.route("**/v1/posts/p7", (route) =>
    route.fulfill({
      json: post("p7", {
        platform: "linkedin",
        status: "published",
        published_at: "2026-11-03T08:00:00Z",
        first_comment: "Sources: example.org",
        targets: [target({ comment_status: "failed", comment_error: "Comment: LinkedIn refused it." })],
      }),
    }),
  );
  await page.goto("/posts/p7");
  await expect(page.getByRole("heading", { name: "First comment" })).toBeVisible();
  await expect(page.getByText("Sources: example.org")).toBeVisible();
  await expect(page.getByText(/First comment: not posted\. Comment: LinkedIn refused it\. It is not tried again/)).toBeVisible();
});

const facebookAcc = account("c7", "facebook", "Alice on Facebook");
const tiktokAcc = account("c8", "tiktok", "Alice on TikTok");
const creatorInfo = {
  nickname: "Ann Lee",
  username: "annlee",
  privacy_level_options: ["FOLLOWER_OF_CREATOR", "PUBLIC_TO_EVERYONE", "SELF_ONLY"],
  comment_disabled: false,
  duet_disabled: true,
  stitch_disabled: false,
  max_video_post_duration_sec: 600,
  can_post: true,
  reason: null as string | null,
};
const tiktokCreator = (page: Page, info: object | number) =>
  page.route("**/v1/connections/c8/tiktok", (route) => (typeof info === "number" ? route.fulfill({ status: info, json: { error: "tiktok_failed" } }) : route.fulfill({ json: info })));

test("a cover image is offered for exactly one video, checked and sent with the post", async ({ page }) => {
  await brain(page, { accounts: [youtubeAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  const cover = page.getByLabel("Cover image link");
  await expect(cover).toHaveCount(0);
  await page.getByLabel("Post", { exact: true }).fill("My title");
  await page.getByRole("button", { name: "Add image" }).click();
  // An image link has no cover, a video link does.
  await page.getByLabel("Image 1 link").fill("https://example.com/pic.png");
  await expect(cover).toHaveCount(0);
  await page.getByLabel("Image 1 link").fill("https://example.com/clip.mp4");
  await expect(cover).toBeVisible();
  await expect(page.getByText("YouTube takes a JPEG or PNG")).toBeVisible();
  await expect(page.getByText("YouTube needs a verified channel")).toBeVisible();

  await cover.fill("http://example.com/cover.jpg");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The cover image needs a public https link." })).toBeVisible();
  expect(sent).toBeUndefined();
  await cover.fill("https://example.com/cover.jpg");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toMatchObject({ platform: "youtube", media: ["https://example.com/clip.mp4"], cover: "https://example.com/cover.jpg" });
});

test("a group sends the cover only to the platforms that take one and says so for the rest", async ({ page }) => {
  await brain(page, { accounts: [facebookAcc, tiktokAcc] });
  await tiktokCreator(page, creatorInfo);
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/post-groups", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { group_id: "g1", posts: [post("g-f", { platform: "facebook", group_id: "g1" }), post("g-t", { platform: "tiktok", group_id: "g1" })] } });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Hello");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/clip.mp4");
  await page.getByLabel("Cover image link").fill("https://example.com/cover.png");
  await expect(page.getByText("TikTok can't take one (TikTok can only pick a frame of the video), so it gets none.")).toBeVisible();
  await page.getByLabel("Who can view this video").selectOption("SELF_ONLY");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/g-f");
  expect(sent).toMatchObject({ platforms: ["facebook", "tiktok"], overrides: { facebook: { cover: "https://example.com/cover.png" } } });
  expect(sent).not.toHaveProperty("cover");
  expect(sent).not.toHaveProperty("overrides.tiktok");

  // TikTok alone has no cover field.
  await page.goto("/posts/new");
  await page.getByRole("group", { name: "Post to" }).getByRole("checkbox", { name: /Facebook/ }).uncheck();
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/clip.mp4");
  await expect(page.getByLabel("Cover image link")).toHaveCount(0);
});

test("a published post shows its cover and, per account, why it was not set", async ({ page }) => {
  await brain(page, { accounts: [youtubeAcc] });
  await page.route("**/v1/posts/p8", (route) =>
    route.fulfill({
      json: post("p8", {
        platform: "youtube",
        status: "published",
        published_at: "2026-11-03T08:00:00Z",
        media: ["https://example.com/clip.mp4"],
        cover: "https://example.com/cover.jpg",
        targets: [target({ social_account_id: "c5", cover_error: "The video is up, but its cover image was not set. Cover: YouTube refused the custom thumbnail." })],
      }),
    }),
  );
  await page.goto("/posts/p8");
  await expect(page.getByRole("heading", { name: "Cover image" })).toBeVisible();
  await expect(page.getByText("https://example.com/cover.jpg")).toBeVisible();
  await expect(page.getByText(/Cover image: The video is up, but its cover image was not set\. Cover: YouTube refused the custom thumbnail\. It is not tried again/)).toBeVisible();
});

const xAcc = { ...account("c6", "x", "Ann on X"), handle: "ann_lee" };

test("X counts its own way, takes four images and a thread", async ({ page }) => {
  await brain(page, { accounts: [xAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  const body = page.getByLabel("Post", { exact: true });
  const over = (text: string) => page.getByRole("alert").filter({ hasText: text });

  // A link counts 23 however long it is, a Japanese character 2.
  await body.fill(`${"a".repeat(256)} https://example.com/${"b".repeat(80)}`);
  await expect(page.getByText("X: 280 of 280 characters")).toBeVisible();
  await body.fill(`${"a".repeat(257)} https://example.com/${"b".repeat(80)}`);
  await expect(over("1 over X's limit of 280")).toBeVisible();
  await body.fill("日".repeat(141));
  await expect(page.getByText("X: 282 of 280 characters")).toBeVisible();
  await body.fill("日".repeat(140));
  await expect(page.getByText("X: 280 of 280 characters")).toBeVisible();
  await expect(page.getByText(/X takes up to 4 JPEG, PNG or WebP images, or one GIF or MP4 or MOV video\./)).toBeVisible();

  // Four images at most.
  await body.fill("Hello X");
  for (const n of [1, 2, 3, 4]) {
    await page.getByRole("button", { name: "Add image" }).click();
    await page.getByLabel(`Image ${n} link`).fill(`https://example.com/${n}.png`);
  }
  await expect(page.getByRole("button", { name: "Add image" })).toHaveCount(0);

  // Threads are allowed.
  await page.getByRole("button", { name: "Add to thread" }).click();
  await page.getByRole("textbox", { name: "Post 2" }).fill("Two");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toMatchObject({
    platform: "x",
    body: "Hello X",
    media: [1, 2, 3, 4].map((n) => `https://example.com/${n}.png`),
    thread: [{ body: "Two", media: [] }],
  });
});

const youtubeAcc = account("c5", "youtube", "Ann on YouTube");

test("YouTube needs one video and takes its title from the first line", async ({ page }) => {
  await brain(page, { accounts: [youtubeAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  const body = page.getByLabel("Post", { exact: true });
  const warning = (text: string) => page.getByRole("listitem").filter({ hasText: text });
  const over = (text: string) => page.getByRole("alert").filter({ hasText: text });

  // What YouTube needs shows before anything is typed, with the privacy caveat.
  await expect(warning("YouTube needs a title: write it as the first line of the post.")).toBeVisible();
  await expect(warning("YouTube needs one MP4 or MOV video: add its link.")).toBeVisible();
  await expect(page.getByText("until Google has audited the YouTube API project behind this server, YouTube keeps new uploads private")).toBeVisible();
  await expect(page.getByText("YouTube takes exactly one MP4 or MOV video.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to thread" })).toHaveCount(0);

  // The first line is counted as the title in characters, the rest as the description in bytes.
  await body.fill(`${"a".repeat(101)}\nAbout it`);
  await expect(page.getByText("YouTube title: 101 of 100 characters")).toBeVisible();
  await expect(over("1 over YouTube title's limit of 100 characters")).toBeVisible();
  await body.fill(`My title\n${"é".repeat(2501)}`);
  await expect(page.getByText("YouTube description: 5,002 of 5,000 bytes")).toBeVisible();
  await expect(over("2 over YouTube description's limit of 5,000 bytes")).toBeVisible();
  await body.fill("a <b> c");
  await expect(warning("YouTube doesn't allow < or > in a title or description.")).toBeVisible();
  await body.fill("My title\nSecond line");
  await expect(page.getByText("YouTube title: 8 of 100 characters")).toBeVisible();
  await expect(page.getByText("YouTube description: 11 of 5,000 bytes")).toBeVisible();
  await expect(warning("YouTube needs a title")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Preview" }).locator("xpath=..").getByText("My title", { exact: true })).toBeVisible();

  // Without the video nothing is sent.
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(over("YouTube needs one MP4 or MOV video: add its link.")).toBeVisible();
  expect(sent).toBeUndefined();

  // One video at most: the add button goes once it is there.
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/clip.mp4");
  await expect(page.getByRole("button", { name: "Add image" })).toHaveCount(0);
  await expect(warning("YouTube needs one MP4 or MOV video")).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toMatchObject({ platform: "youtube", body: "My title\nSecond line", media: ["https://example.com/clip.mp4"], thread: [] });
});

test("each platform can have its own text, counted against its own limit", async ({ page }) => {
  await brain(page, { accounts: [alice, threadsAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/post-groups", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { group_id: "g1", posts: [post("g-b", { platform: "bluesky", group_id: "g1", body: "Short" }), post("g-t", { platform: "threads", group_id: "g1" })] },
    });
  });
  await page.goto("/posts/new");
  const body = page.getByLabel("Post", { exact: true });
  await body.fill("a".repeat(301));
  await expect(page.getByRole("alert").filter({ hasText: "1 over Bluesky's limit of 300" })).toBeVisible();
  await expect(body).toHaveAttribute("aria-invalid", "true");

  await page.getByRole("button", { name: "Customize for Bluesky" }).click();
  const own = page.getByRole("textbox", { name: "Bluesky text" });
  await expect(own).toBeFocused();
  await expect(own).toHaveValue("a".repeat(301));
  await own.fill("Short");
  await expect(page.getByText("Bluesky: 5 of 300 characters")).toBeVisible();
  await expect(page.getByText("Threads: 301 of 500 characters")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "over" })).toHaveCount(0);
  await expect(body).not.toHaveAttribute("aria-invalid", "true");

  await page.getByRole("button", { name: "Use the main post on Bluesky" }).click();
  await expect(page.getByRole("button", { name: "Customize for Bluesky" })).toBeFocused();
  await expect(page.getByRole("alert").filter({ hasText: "1 over Bluesky's limit" })).toBeVisible();
  await page.getByRole("button", { name: "Customize for Bluesky" }).click();
  await own.fill("Short");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved 2 drafts, one per platform.")).toBeVisible();
  expect(sent).toMatchObject({ platforms: ["bluesky", "threads"], body: "a".repeat(301), overrides: { bluesky: { body: "Short" } } });
  await expect(page).toHaveURL("/posts/g-b");
  await expect(page.getByLabel("Post", { exact: true })).toHaveValue("Short");
  await expect(page.getByRole("region", { name: "Same post on other platforms" }).getByRole("link", { name: "Threads post" })).toBeVisible();
});

test("custom text no longer counts once its platform is the only one left", async ({ page }) => {
  await brain(page, { accounts: [alice, threadsAcc] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Main words");
  await page.getByRole("button", { name: "Customize for Bluesky" }).click();
  await page.getByRole("textbox", { name: "Bluesky text" }).fill("Own words");
  await page.getByRole("group", { name: "Post to" }).getByRole("checkbox", { name: /Threads/ }).uncheck();
  await expect(page.getByRole("textbox", { name: "Bluesky text" })).toHaveCount(0);
  await expect(page.getByText("Bluesky: 10 of 300 characters")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toMatchObject({ platform: "bluesky", body: "Main words" });
});

test("a group publish that stops partway names what is left and carries on", async ({ page }) => {
  await brain(page, { accounts: [alice, threadsAcc, instaAcc] });
  const platformsById: Record<string, string> = { "g-b": "bluesky", "g-t": "threads", "g-i": "instagram" };
  let state: Post[] = [];
  const published: string[] = [];
  let refused = false;
  await page.route("**/v1/post-groups", (route) => {
    state = Object.entries(platformsById).map(([id, platform]) => post(id, { platform, group_id: "g1", media: ["https://example.com/a.jpg"] }));
    return route.fulfill({ status: 201, json: { group_id: "g1", posts: state } });
  });
  await page.route(/\/v1\/posts\/g-.\/publish$/, (route) => {
    const id = route.request().url().split("/").at(-2)!;
    published.push(id);
    if (id === "g-t" && !refused) {
      refused = true;
      return route.fulfill({ status: 429, json: { error: "rate_limited" } });
    }
    state = state.map((p) => (p.id === id ? { ...p, status: "queued" } : p));
    return route.fulfill({ status: 202, json: state.find((p) => p.id === id) });
  });
  // Brain keeps them queued, so the page does not settle while the test looks.
  await page.route(/\/v1\/posts\?group_id=g1$/, (route) => route.fulfill({ json: state }));
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Hello all");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/a.jpg");
  await page.getByRole("button", { name: "Publish now" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Too many publish" })).toBeVisible();
  await expect(page.getByText("Not published yet on Threads and Instagram.")).toBeVisible();
  expect(published).toEqual(["g-b", "g-t"]);
  await page.getByRole("button", { name: "Publish the rest" }).click();
  await expect(page.getByText(/Not published yet/)).toHaveCount(0);
  expect(published).toEqual(["g-b", "g-t", "g-t", "g-i"]);
  await expect(page.getByRole("region", { name: "Same post on other platforms" }).getByText("Publishing")).toHaveCount(2);
});

test("calendar marks each post with its platform", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+01:00"));
  await brain(page);
  await page.route(/\/v1\/posts(\?.*)?$/, (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).searchParams.get("status") === "draft"
          ? []
          : ["bluesky", "instagram"].map((p) => post(`p-${p}`, { platform: p, group_id: "g1", status: "scheduled", scheduled_at: "2026-11-12T09:30:00Z", body: "Launch day" })),
    }),
  );
  await page.goto("/calendar");
  const table = page.getByRole("table", { name: "Posts in November 2026" });
  await expect(table.getByRole("link", { name: /^Bluesky: 10:30.*Launch day$/ })).toHaveAttribute("href", "/posts/p-bluesky");
  await expect(table.getByRole("link", { name: /^Instagram: 10:30.*Launch day$/ })).toHaveAttribute("href", "/posts/p-instagram");
});

// A group of posts, one per platform, with the given statuses. DELETE takes a published post down, except
// where `refuse` answers that post's first DELETE differently. Opens the Bluesky post; returns the DELETEs seen.
async function groupPage(page: Page, statuses: Record<string, string>, refuse: Record<string, () => { status: number; json: unknown }> = {}) {
  await brain(page, { accounts: [alice, threadsAcc, instaAcc] });
  const platforms: Record<string, string> = { "g-b": "bluesky", "g-t": "threads", "g-i": "instagram" };
  let state: Post[] = Object.entries(statuses).map(([id, status]) =>
    post(id, { platform: platforms[id], group_id: "g1", status, published_at: status === "published" ? "2026-11-03T08:00:00Z" : null }),
  );
  const deleted: string[] = [];
  await page.route(/\/v1\/posts\/g-.$/, (route) => {
    const id = route.request().url().split("/").at(-1)!;
    if (route.request().method() === "GET") return route.fulfill({ json: state.find((p) => p.id === id) });
    deleted.push(id);
    const answer = refuse[id];
    if (answer) {
      delete refuse[id];
      return route.fulfill(answer());
    }
    state = state.map((p) => (p.id === id ? { ...p, status: "deleted" } : p));
    return route.fulfill({ json: state.find((p) => p.id === id) });
  });
  await page.route(/\/v1\/posts\?group_id=g1$/, (route) => route.fulfill({ json: state }));
  await page.goto("/posts/g-b");
  return deleted;
}

test("take down all asks once, names the platforms and takes each post down in turn", async ({ page }) => {
  const deleted = await groupPage(page, { "g-b": "published", "g-t": "published", "g-i": "published" });
  await page.getByRole("button", { name: "Take down all" }).click();
  await expect(page.getByText("Take these 3 posts down from Bluesky, Threads, and Instagram?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes, take them all down" })).toBeFocused();
  expect(deleted).toEqual([]);
  await page.getByRole("button", { name: "Yes, take them all down" }).click();
  const report = page.getByRole("status").filter({ hasText: "Taken down from Bluesky, Threads, and Instagram." });
  await expect(report).toBeFocused();
  await expect(report.getByRole("listitem")).toHaveText(["Bluesky: taken down", "Threads: taken down", "Instagram: taken down"]);
  expect(deleted).toEqual(["g-b", "g-t", "g-i"]);
  await expect(page.getByRole("button", { name: "Take down all" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Same post on other platforms" }).getByText("Taken down", { exact: true })).toHaveCount(2);
});

test("take down all names the platforms still up after a failure and retries only those", async ({ page }) => {
  const deleted = await groupPage(
    page,
    { "g-b": "published", "g-t": "published", "g-i": "published" },
    { "g-t": () => ({ status: 422, json: { error: "takedown_failed", message: "Threads token expired. Reconnect, then try again." } }) },
  );
  await page.getByRole("button", { name: "Take down all" }).click();
  await page.getByRole("button", { name: "Yes, take them all down" }).click();
  const report = page.getByRole("alert").filter({ hasText: "Still to take down: Threads." });
  await expect(report).toBeFocused();
  await expect(report).toContainText("Taken down from Bluesky and Instagram.");
  await expect(report.getByRole("listitem")).toHaveText(["Bluesky: taken down", "Threads: Threads token expired. Reconnect, then try again.", "Instagram: taken down"]);
  expect(deleted).toEqual(["g-b", "g-t", "g-i"]);
  await report.getByRole("button", { name: "Retry Threads" }).click();
  const done = page.getByRole("status").filter({ hasText: "Taken down from Bluesky, Threads, and Instagram." });
  await expect(done).toBeFocused();
  expect(deleted).toEqual(["g-b", "g-t", "g-i", "g-t"]);
  await expect(page.getByRole("button", { name: /Retry/ })).toHaveCount(0);
});

test("take down all leaves posts that are not published alone, and is hidden when none is", async ({ page }) => {
  const deleted = await groupPage(page, { "g-b": "published", "g-t": "draft", "g-i": "failed" });
  await page.getByRole("button", { name: "Take down all" }).click();
  await expect(page.getByText("Take this post down from Bluesky?").first()).toBeVisible();
  await page.getByRole("button", { name: "Yes, take it down" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Taken down from Bluesky." })).toBeFocused();
  expect(deleted).toEqual(["g-b"]);
  await expect(page.getByRole("button", { name: "Take down all" })).toHaveCount(0);
});

test("take down all is hidden when no post of the group is published", async ({ page }) => {
  const deleted = await groupPage(page, { "g-b": "draft", "g-t": "scheduled", "g-i": "failed" });
  await expect(page.getByRole("region", { name: "Same post on other platforms" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take down all" })).toHaveCount(0);
  expect(deleted).toEqual([]);
});

test("the editor warns when a ticked platform's account needs a reconnect", async ({ page }) => {
  const soon = { ...threadsAcc, status: "expiring", token_expires_at: "2026-11-20T10:00:00Z" };
  const gone = { ...instaAcc, status: "reconnect" };
  await brain(page, { accounts: [alice, soon, gone] });
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto("/posts/new");
  const notice = page.getByRole("region", { name: "An account needs reconnecting" });
  await expect(notice.getByRole("listitem")).toHaveCount(2);
  await expect(notice).toContainText("Alice on Threads");
  await expect(notice).toContainText("Alice on Instagram needs reconnecting");
  // This test's user is a member: told who can fix it, no Reconnect link.
  await expect(notice).toContainText("Ask a team owner or admin to reconnect it.");
  await expect(notice.getByRole("link")).toHaveCount(0);
  // Unticking a platform drops its account from the notice.
  const to = page.getByRole("group", { name: "Post to" });
  await to.getByRole("checkbox", { name: /Instagram/ }).uncheck();
  await expect(notice.getByRole("listitem")).toHaveCount(1);
  await to.getByRole("checkbox", { name: /Threads/ }).uncheck();
  await expect(notice).toHaveCount(0);
});

test("TikTok settings: privacy is chosen, the disclosure and consent follow TikTok's rules, and it is all sent", async ({ page }) => {
  await brain(page, { accounts: [tiktokAcc] });
  await tiktokCreator(page, creatorInfo);
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Clip");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/clip.mp4");
  await expect(page.getByText("Ann Lee", { exact: true })).toBeVisible();
  await expect(page.getByText("up to 10 minutes")).toBeVisible();

  // Nothing is chosen for the user: no level, no interaction, no disclosure.
  const privacy = page.getByLabel("Who can view this video");
  await expect(privacy).toHaveValue("");
  await expect(page.locator("#tiktok-privacy-note")).toHaveText("Only the options TikTok offers this account are listed.");
  await expect(privacy.getByRole("option")).toHaveText(["Select who can view this video", "Followers", "Everyone", "Only me"]);
  for (const name of ["Comment", "Stitch"]) await expect(page.getByLabel(name)).not.toBeChecked();
  // Duets are off in the creator's TikTok settings, so the box is greyed out.
  await expect(page.getByLabel(/^Duet/)).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Disclose post content" })).not.toBeChecked();
  await expect(page.getByText("By posting, you agree to TikTok's Music Usage Confirmation.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Music Usage Confirmation" })).toHaveAttribute("href", "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose who can view the TikTok post." })).toBeVisible();
  expect(sent).toBeUndefined();

  // The disclosure needs one of its two boxes; Branded content adds the policy and cannot be private.
  await privacy.selectOption("SELF_ONLY");
  await page.getByRole("switch", { name: "Disclose post content" }).check();
  await expect(page.getByRole("alert").filter({ hasText: "You need to indicate if your content promotes yourself, a third party, or both." })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "You need to indicate" }).first()).toBeVisible();
  expect(sent).toBeUndefined();
  await expect(page.getByLabel("Branded content")).toBeDisabled();
  await privacy.selectOption("PUBLIC_TO_EVERYONE");
  await page.getByLabel("Your brand").check();
  await expect(page.getByText("labeled as 'Promotional content'")).toBeVisible();
  await page.getByLabel("Branded content").check();
  await expect(page.getByText("labeled as 'Paid partnership'")).toBeVisible();
  await expect(privacy.getByRole("option", { name: "Only me" })).toBeDisabled();
  await expect(page.locator("#tiktok-privacy-note")).toHaveText("Branded content visibility cannot be set to private.");
  await expect(page.getByText("By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Branded Content Policy" })).toHaveAttribute("href", "https://www.tiktok.com/legal/page/global/bc-policy/en");

  await page.getByLabel("Comment").check();
  await page.getByLabel("This video is AI-generated").check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/posts/p1");
  expect(sent).toMatchObject({
    platform: "tiktok",
    tiktok: {
      privacy_level: "PUBLIC_TO_EVERYONE",
      allow_comment: true,
      allow_duet: false,
      allow_stitch: false,
      commercial_content: true,
      your_brand: true,
      branded_content: true,
      ai_generated: true,
    },
  });
});

test("TikTok settings: photos have no duet or stitch, and an account that cannot post blocks saving", async ({ page }) => {
  await brain(page, { accounts: [tiktokAcc] });
  await tiktokCreator(page, { ...creatorInfo, can_post: false, reason: "This TikTok account reached its limit of posts for the day." });
  let sent = false;
  await page.route("**/v1/posts", (route) => {
    sent = true;
    return route.fulfill({ status: 201, json: post("p1") });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Photos");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/a.jpg");
  await expect(page.getByLabel("Who can view this photo")).toBeVisible();
  await expect(page.getByLabel("Comment")).toBeVisible();
  await expect(page.getByLabel(/^Duet/)).toHaveCount(0);
  await expect(page.getByLabel("Stitch")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "reached its limit of posts for the day. Try again later." })).toBeVisible();
  await page.getByLabel("Who can view this photo").selectOption("SELF_ONLY");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "reached its limit of posts for the day. Try again later." }).last()).toBeVisible();
  expect(sent).toBe(false);
});

test("TikTok settings: an account that cannot be read says so and can be tried again", async ({ page }) => {
  await brain(page, { accounts: [tiktokAcc] });
  let calls = 0;
  await page.route("**/v1/connections/c8/tiktok", (route) => {
    calls += 1;
    return calls === 1 ? route.fulfill({ status: 502, json: { error: "tiktok_failed" } }) : route.fulfill({ json: creatorInfo });
  });
  await page.goto("/posts/new");
  await expect(page.getByText("The TikTok account couldn't be read.")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Who can view this video")).toBeVisible();
});

test("a saved TikTok post shows its settings and a draft loads them", async ({ page }) => {
  await brain(page, { accounts: [tiktokAcc] });
  await tiktokCreator(page, creatorInfo);
  const settings = { privacy_level: "FOLLOWER_OF_CREATOR", allow_comment: true, allow_duet: false, allow_stitch: false, commercial_content: true, your_brand: false, branded_content: true, ai_generated: true };
  await page.route("**/v1/posts/p20", (route) =>
    route.fulfill({ json: post("p20", { platform: "tiktok", status: "published", published_at: "2026-11-03T08:00:00Z", media: ["https://example.com/clip.mp4"], tiktok: settings, targets: [target({ social_account_id: "c8" })] }) }),
  );
  await page.route("**/v1/posts/p21", (route) => route.fulfill({ json: post("p21", { platform: "tiktok", media: ["https://example.com/clip.mp4"], tiktok: settings }) }));
  await page.goto("/posts/p20");
  await expect(page.getByRole("heading", { name: "TikTok settings" })).toBeVisible();
  await expect(page.getByText("Visible to: Followers. Allowed: comments. Disclosed as a paid partnership. Marked as AI-generated.")).toBeVisible();
  await page.goto("/posts/p21");
  await expect(page.getByLabel("Who can view this video")).toHaveValue("FOLLOWER_OF_CREATOR");
  await expect(page.getByLabel("Comment")).toBeChecked();
  await expect(page.getByLabel("Branded content")).toBeChecked();
});
