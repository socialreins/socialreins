import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({ id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role } });
const set = (id: string, name: string, is_default = false) => ({ id, name, is_default, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null });
const sets = [set("d", "All sets", true), set("s1", "Clients")];
const account = (id: string, provider: string, set_ids: string[]) => ({
  id,
  provider,
  external_id: id,
  handle: `${provider}.example`,
  display_name: provider,
  avatar_url: null,
  token_expires_at: null,
  set_ids,
  dm_access: false,
  created_at: "2026-10-20T10:00:00Z",
});
// All sets has every network; Clients only Bluesky and TikTok.
const accounts = [
  account("c1", "bluesky", ["d", "s1"]),
  account("c2", "x", ["d"]),
  account("c3", "instagram", ["d"]),
  account("c4", "tiktok", ["d", "s1"]),
  account("c5", "youtube", ["d"]),
];
const feed = (id: string, url: string, extra = {}) => ({
  id,
  url,
  social_set_id: "d",
  platforms: ["bluesky", "x"],
  template: "{title}\n{link}",
  mode: "draft",
  active: true,
  last_checked_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  last_error: null,
  items_posted: 12,
  created_at: "2026-11-01T10:00:00Z",
  ...extra,
});
const three = () => [
  feed("f1", "https://blog.example.com/feed.xml"),
  feed("f2", "https://news.example.org/rss", { social_set_id: "s1", platforms: ["bluesky"], mode: "queue", items_posted: 1, last_error: "HTTP 404" }),
  feed("f3", "https://shop.example.net/atom.xml", { mode: "now", active: false, items_posted: 0, last_checked_at: null }),
];

type Answer = { status: number; json?: unknown };
// `answer` replaces brain's reply to a write (POST, PUT, DELETE or a check); every write is recorded in `calls`.
async function brain(page: Page, role: Role = "owner", answer?: (method: string, path: string, body: unknown) => Answer | undefined) {
  const state = { list: three(), calls: [] as { method: string; path: string; body: unknown }[] };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/auth/passkeys", (route) => route.fulfill({ json: [{ id: "k1", name: "Phone", created_at: "2026-10-01T10:00:00Z", last_used_at: null }] }));
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [me(role).current_team] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: accounts }));
  await page.route(/\/v1\/(posts|lists)(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/feeds(\/.*)?$/, (route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;
    if (method === "GET") return route.fulfill({ json: state.list });
    const body = req.postDataJSON() as Record<string, unknown> | null;
    state.calls.push({ method, path, body });
    const forced = answer?.(method, path, body);
    if (forced) return route.fulfill(forced);
    const id = path.split("/")[3];
    const old = state.list.find((f) => f.id === id);
    if (method === "POST" && !id) return route.fulfill({ status: 201, json: feed("f9", "", { ...body, items_posted: 0, last_checked_at: null }) });
    if (method === "DELETE") return route.fulfill({ status: 204 });
    return route.fulfill({ json: { ...old, ...body, ...(path.endsWith("/check") && { last_checked_at: new Date().toISOString(), items_posted: 13 }) } });
  });
  return state;
}

const card = (page: Page, url: string) => page.getByRole("listitem", { name: url });
const form = (page: Page) => page.getByRole("dialog");

test("the sidebar links to Feeds after Library", async ({ page }) => {
  await brain(page);
  await page.goto("/library");
  const links = page.getByRole("navigation", { name: "App" }).getByRole("link");
  await expect(links.nth(5)).toHaveText("Library");
  await expect(links.nth(6)).toHaveText("Feeds");
  await links.nth(6).click();
  await expect(page).toHaveURL("/t/acme22/feeds");
  await expect(page.getByRole("heading", { name: "Feeds", level: 1 })).toBeVisible();
});

test("lists every feed with its set, networks, mode, counts and last error", async ({ page }) => {
  await brain(page);
  await page.goto("/feeds");
  await expect(page.getByText("A feed watches a blog or site's RSS link")).toBeVisible();
  const a = card(page, "https://blog.example.com/feed.xml");
  await expect(a.locator("strong").first()).toHaveText("blog.example.com");
  await expect(a).toContainText("All sets");
  await expect(a).toContainText("Bluesky:");
  await expect(a).toContainText("X:");
  await expect(a).toContainText("Saves a draft");
  await expect(a).toContainText("12 posts made. Last checked 5 minutes ago.");
  await expect(a.getByRole("switch")).toBeChecked();

  const b = card(page, "https://news.example.org/rss");
  await expect(b).toContainText("Clients");
  await expect(b).toContainText("Adds to the queue");
  await expect(b).toContainText("1 post made.");
  await expect(b).toContainText("Problem at the last check: HTTP 404");

  const c = card(page, "https://shop.example.net/atom.xml");
  await expect(c).toContainText("Posts right away");
  await expect(c).toContainText("0 posts made. Not checked yet.");
  await expect(c.getByRole("switch")).not.toBeChecked();
});

test("adds a feed for the picked set's networks", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/feeds");
  await page.getByRole("button", { name: "Add feed" }).click();
  const f = form(page);
  await expect(f.getByRole("heading", { name: "Add a feed" })).toBeVisible();
  // All sets: every connected network but TikTok and YouTube, all ticked.
  for (const name of ["Instagram", "Bluesky", "X"]) await expect(f.getByRole("checkbox", { name, exact: true })).toBeChecked();
  await expect(f.getByRole("checkbox")).toHaveCount(3);
  await expect(f.getByText("TikTok, YouTube and Pinterest are left out")).toBeVisible();
  // Clients has only Bluesky left.
  await f.getByLabel("Set", { exact: true }).selectOption("s1");
  await expect(f.getByRole("checkbox")).toHaveCount(1);
  await f.getByLabel("Set", { exact: true }).selectOption("d");
  await f.getByRole("checkbox", { name: "Instagram" }).uncheck();

  await expect(f.getByRole("radio", { name: /Save a draft/ })).toBeChecked();
  await expect(f.getByText("without anyone reviewing them")).toBeHidden();
  await f.getByRole("radio", { name: /Post right away/ }).check();
  await expect(f.getByText("without anyone reviewing them")).toBeVisible();
  await f.getByRole("radio", { name: /Add to the queue/ }).check();

  // The template starts as the title and the link; a placeholder goes in at the cursor and the preview follows.
  const text = f.getByLabel("Post text");
  await expect(text).toHaveValue("{title}\n{link}");
  const preview = f.getByRole("group", { name: "Preview" });
  await expect(preview).toContainText("Five ways to plan a week of posts");
  await expect(preview).toContainText("https://example.com/blog/plan-a-week");
  await text.fill("New: ");
  await f.getByRole("button", { name: "Insert {title}" }).click();
  await expect(text).toBeFocused();
  await page.keyboard.type(" ");
  await f.getByRole("button", { name: "Insert {summary}" }).click();
  await expect(text).toHaveValue("New: {title} {summary}");
  await expect(preview).toContainText("New: Five ways to plan a week of posts A short guide");

  await f.getByLabel("Feed link").fill("https://new.example.com/feed");
  await f.getByRole("button", { name: "Add feed" }).click();
  await expect(f).toBeHidden();
  expect(state.calls).toEqual([
    {
      method: "POST",
      path: "/v1/feeds",
      body: { url: "https://new.example.com/feed", social_set_id: "d", platforms: ["bluesky", "x"], template: "New: {title} {summary}", mode: "queue" },
    },
  ]);
  const added = card(page, "https://new.example.com/feed");
  await expect(added).toContainText("Adds to the queue");
  await expect(added.getByRole("status")).toContainText("Feed added. Items already in it are skipped");
});

test("shows each refusal on its field", async ({ page }) => {
  let reply: Answer = { status: 422, json: { error: "feed_unreadable", reason: "not an RSS or Atom feed" } };
  const state = await brain(page, "owner", () => reply);
  await page.goto("/feeds");
  await page.getByRole("button", { name: "Add feed" }).click();
  const f = form(page);
  const link = f.getByLabel("Feed link");
  await link.fill("https://example.com/about");
  await f.getByRole("button", { name: "Add feed" }).click();
  await expect(f.getByRole("alert")).toHaveText("That feed couldn't be read (not an RSS or Atom feed). Check that the link opens an RSS or Atom feed.");
  await expect(link).toHaveAttribute("aria-invalid", "true");
  await expect(link).toHaveAccessibleDescription(/couldn't be read/);

  reply = { status: 422, json: { error: "invalid_feed", field: "template" } };
  await f.getByRole("button", { name: "Add feed" }).click();
  await expect(f.getByRole("alert")).toContainText("keep it within 2000 characters");
  await expect(f.getByLabel("Post text")).toHaveAttribute("aria-invalid", "true");
  await expect(link).not.toHaveAttribute("aria-invalid");

  reply = { status: 422, json: { error: "platform_not_supported", platform: "tiktok" } };
  await f.getByRole("button", { name: "Add feed" }).click();
  await expect(f.getByRole("alert")).toContainText("Feeds can't post to TikTok");

  reply = { status: 422, json: { error: "too_many_feeds" } };
  await f.getByRole("button", { name: "Add feed" }).click();
  await expect(f.getByRole("alert")).toContainText("already has 20 feeds");

  // No network ticked never reaches brain.
  const sent = state.calls.length;
  for (const box of await f.getByRole("checkbox").all()) await box.uncheck();
  await f.getByRole("button", { name: "Add feed" }).click();
  await expect(f.getByRole("alert")).toHaveText("Tick at least one network the set has an account for.");
  expect(state.calls).toHaveLength(sent);
  await expect(f).toBeVisible();
});

test("switches a feed off with the whole feed in the PUT", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/feeds");
  const a = card(page, "https://blog.example.com/feed.xml");
  await a.getByRole("switch", { name: "blog.example.com feed" }).click();
  await expect(a.getByRole("switch")).not.toBeChecked();
  await expect(a.getByRole("status")).toHaveText("The feed is off.");
  expect(state.calls).toEqual([
    {
      method: "PUT",
      path: "/v1/feeds/f1",
      body: { url: "https://blog.example.com/feed.xml", social_set_id: "d", platforms: ["bluesky", "x"], template: "{title}\n{link}", mode: "draft", active: false },
    },
  ]);
});

test("checks a feed now and says so when it was checked a moment ago", async ({ page }) => {
  let limited = false;
  const state = await brain(page, "owner", () => (limited ? { status: 429, json: { error: "checked_recently" } } : undefined));
  await page.goto("/feeds");
  const a = card(page, "https://blog.example.com/feed.xml");
  await a.getByRole("button", { name: "Check now" }).click();
  await expect(a.getByRole("status")).toHaveText("Checked.");
  await expect(a).toContainText("13 posts made. Last checked just now.");
  expect(state.calls).toEqual([{ method: "POST", path: "/v1/feeds/f1/check", body: null }]);

  limited = true;
  await a.getByRole("button", { name: "Check now" }).click();
  await expect(a.getByRole("alert")).toHaveText("This feed was checked less than a minute ago. Try again in a minute.");
  await expect(a).toContainText("13 posts made.");
});

test("edits a feed and keeps it on or off", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/feeds");
  await page.getByRole("button", { name: "Edit the shop.example.net feed" }).click();
  const f = form(page);
  await expect(f.getByRole("heading", { name: "Edit feed" })).toBeVisible();
  await expect(f.getByLabel("Feed link")).toHaveValue("https://shop.example.net/atom.xml");
  await expect(f.getByRole("radio", { name: /Post right away/ })).toBeChecked();
  await expect(f.getByRole("checkbox", { name: "Instagram" })).not.toBeChecked();
  await expect(f.getByRole("checkbox", { name: "Bluesky" })).toBeChecked();
  await f.getByRole("radio", { name: /Save a draft/ }).check();
  await f.getByRole("checkbox", { name: "X", exact: true }).uncheck();
  await f.getByRole("button", { name: "Save feed" }).click();
  await expect(f).toBeHidden();
  expect(state.calls).toEqual([
    {
      method: "PUT",
      path: "/v1/feeds/f3",
      body: { url: "https://shop.example.net/atom.xml", social_set_id: "d", platforms: ["bluesky"], template: "{title}\n{link}", mode: "draft", active: false },
    },
  ]);
  const c = card(page, "https://shop.example.net/atom.xml");
  await expect(c).toContainText("Saves a draft");
  await expect(c.getByRole("status")).toHaveText("Feed saved.");
});

test("deletes a feed only after a second yes", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/feeds");
  const b = card(page, "https://news.example.org/rss");
  await b.getByRole("button", { name: "Delete the news.example.org feed" }).click();
  await expect(b).toContainText("Delete this feed? The posts it made stay.");
  await b.getByRole("button", { name: "Keep it" }).click();
  expect(state.calls).toHaveLength(0);
  await b.getByRole("button", { name: "Delete the news.example.org feed" }).click();
  await b.getByRole("button", { name: "Yes, delete" }).click();
  await expect(b).toBeHidden();
  await expect(page.getByText("The feed for news.example.org was deleted.")).toBeVisible();
  expect(state.calls).toEqual([{ method: "DELETE", path: "/v1/feeds/f2", body: null }]);
  await expect(page.getByRole("listitem").filter({ hasText: "posts made" })).toHaveCount(2);
});

test("a member reads the feeds and can't change them", async ({ page }) => {
  await brain(page, "member");
  await page.goto("/feeds");
  await expect(page.getByText("Only team owners and admins can add or change feeds.")).toBeVisible();
  const a = card(page, "https://blog.example.com/feed.xml");
  await expect(a).toContainText("Saves a draft");
  await expect(a.getByText("On", { exact: true })).toBeVisible();
  await expect(card(page, "https://shop.example.net/atom.xml").getByText("Off", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  for (const name of ["Add feed", "Check now", /^Edit/, /^Delete/]) await expect(page.getByRole("button", { name })).toHaveCount(0);
});
