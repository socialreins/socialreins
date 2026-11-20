import { expect, test, type Page } from "@playwright/test";

// The Posts list names the local month: pin the zone so it reads the same everywhere.
test.use({ timezoneId: "Europe/Berlin" });

const team = { id: "t1", name: "Acme", code: "acme22", role: "owner" };
const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: team };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const members = [{ id: "u-me", name: "Me", email: "me@example.com", role: "owner", joined_at: "2026-10-02T10:00:00Z" }];
const zero = { posts: 0, likes: 0, comments: 0, shares: 0, views: 0 };
const page0 = { items: [], next_cursor: null };

// What an empty brain answers to a GET of `path`.
const empty = (path: string): unknown =>
  /\/social-sets$/.test(path) ? sets
  : /\/v1\/teams$/.test(path) ? [team]
  : /\/team\/members$/.test(path) ? members
  : /\/(contacts|media-library|snippets)$/.test(path) ? page0
  : /\/queue$/.test(path) ? { time_zone: "Europe/Berlin", slots: [], next: [] }
  : /\/analytics$/.test(path) ? { supported: ["bluesky"], totals: zero, by_platform: [], by_day: [], top_posts: [] }
  : /\/newsletter/.test(path) ? { subscribers: [] }
  : [];

// An empty mock brain at 13:00 in Berlin on Tuesday 10 November 2026. GETs matching `held` wait for `open()`, then fail
// until `mend()`, then answer `data` (the empty answer by default). Nothing here depends on the order of the calls.
async function brain(page: Page, held: (url: URL) => boolean, data?: unknown) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const state = { failing: true };
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00Z"));
  await page.addInitScript(() => {
    localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now()));
    localStorage.setItem("current-set:t1", "d");
  });
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route("**/auth/passkeys", (r) => r.fulfill({ json: [] }));
  await page.route(/\/v1\//, async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() !== "GET") return r.fulfill({ status: 204 });
    if (!held(url)) return r.fulfill({ json: empty(url.pathname) });
    await gate;
    if (state.failing) return r.fulfill({ status: 500, json: { error: "error" } });
    return r.fulfill({ json: data ?? empty(url.pathname) });
  });
  return { open, mend: () => (state.failing = false) };
}

const main = (page: Page) => page.locator("#main");
const path = (re: RegExp) => (url: URL) => re.test(url.pathname);

// Placeholders while the page's own list is on its way, then a failure with Retry, then what Retry brings.
async function loadsFailsRetries(page: Page, b: Awaited<ReturnType<typeof brain>>, loading: string, failed: string) {
  await expect(page.getByRole("status").filter({ hasText: loading }).first()).toBeAttached();
  await expect(main(page).locator(".skeleton:visible").first()).toBeVisible();
  b.open();
  const alert = page.getByRole("alert").filter({ hasText: failed });
  await expect(alert).toBeVisible();
  await expect(main(page).locator(".skeleton")).toHaveCount(0);
  b.mend();
  await alert.getByRole("button", { name: /^Retry/ }).click();
  await expect(alert).toHaveCount(0);
}

type Case = { name: string; url: string; held: (url: URL) => boolean; loading: string; failed: string; empty: string; action: { role: "link" | "button"; name: string }; then?: (page: Page) => Promise<void> };
const cases: Case[] = [
  {
    name: "Posts", url: "/posts", held: (u) => /\/v1\/posts$/.test(u.pathname) && u.searchParams.get("status") !== "draft",
    loading: "Loading posts...", failed: "Posts couldn't be loaded.", empty: "Nothing scheduled or published in November 2026.", action: { role: "link", name: "Write a post" },
    then: async (page) => {
      await expect(main(page).getByRole("link", { name: "Write a post" })).toHaveAttribute("href", "/t/acme22/posts/new");
    },
  },
  {
    name: "Analytics", url: "/analytics", held: path(/\/v1\/analytics$/),
    loading: "Loading the analytics...", failed: "The analytics couldn't be loaded.", empty: "No posts were published in the last 30 days.", action: { role: "link", name: "Write a post" },
  },
  {
    name: "Contacts", url: "/contacts", held: path(/\/v1\/contacts$/),
    loading: "Loading contacts...", failed: "Contacts couldn't be loaded.", empty: "No contacts yet.", action: { role: "link", name: "Connect an account" },
    then: async (page) => {
      await expect(main(page).getByRole("link", { name: "Connect an account" })).toHaveAttribute("href", "/t/acme22/connections");
    },
  },
  {
    name: "Library", url: "/library", held: path(/\/v1\/media-library$/),
    loading: "Loading media...", failed: "The library couldn't be loaded.", empty: "No media yet.", action: { role: "button", name: "Add media" },
    then: async (page) => {
      await main(page).getByRole("button", { name: "Add media" }).click();
      await expect(page.getByLabel("Link", { exact: true })).toBeFocused();
    },
  },
  {
    name: "Feeds", url: "/feeds", held: path(/\/v1\/feeds$/),
    loading: "Loading feeds...", failed: "Feeds couldn't be loaded.", empty: "No feeds yet.", action: { role: "button", name: "Add your first feed" },
  },
  {
    name: "Queue", url: "/queue", held: path(/\/queue$/),
    loading: "Loading the queue...", failed: "The queue couldn't be loaded.", empty: "No times yet.", action: { role: "button", name: "Pick a time" },
    then: async (page) => {
      await main(page).getByRole("button", { name: "Pick a time" }).click();
      await expect(page.getByLabel("Time", { exact: true })).toBeFocused();
    },
  },
  {
    name: "Lists", url: "/lists", held: path(/\/v1\/lists$/),
    loading: "Loading lists...", failed: "Lists couldn't be loaded.", empty: "No lists yet.", action: { role: "button", name: "Name a list" },
    then: async (page) => {
      await main(page).getByRole("button", { name: "Name a list" }).click();
      await expect(page.getByLabel("New list name")).toBeFocused();
    },
  },
  {
    name: "Accounts", url: "/connections", held: path(/\/v1\/connections$/),
    loading: "Loading accounts...", failed: "Accounts couldn't be loaded.", empty: "No accounts connected yet.", action: { role: "button", name: "Connect an account" },
  },
  {
    name: "API tokens", url: "/api-tokens", held: path(/\/v1\/api-tokens$/),
    loading: "Loading tokens...", failed: "Tokens couldn't be loaded.", empty: "No API tokens yet.", action: { role: "button", name: "Name a token" },
    then: async (page) => {
      await main(page).getByRole("button", { name: "Name a token" }).click();
      await expect(page.getByLabel("Token name")).toBeFocused();
    },
  },
];

for (const c of cases) {
  test(`${c.name}: placeholders while loading, Retry after a failure, then the empty state with its action`, async ({ page }) => {
    const b = await brain(page, c.held);
    await page.goto(c.url);
    await loadsFailsRetries(page, b, c.loading, c.failed);
    await expect(main(page).getByText(c.empty)).toBeVisible();
    await expect(main(page).getByRole(c.action.role, { name: c.action.name })).toBeVisible();
    await c.then?.(page);
  });
}

test("Sets: placeholders while loading, Retry after a failure, then the sets", async ({ page }) => {
  const b = await brain(page, (u) => /\/v1\/social-sets$/.test(u.pathname) && !u.searchParams.has("deleted"));
  await page.goto("/sets");
  await loadsFailsRetries(page, b, "Loading sets...", "Sets couldn't be loaded.");
  await expect(main(page).getByText("All sets").first()).toBeVisible();
});

test("Team: placeholders while the members load, Retry after a failure, then the members", async ({ page }) => {
  const b = await brain(page, path(/\/v1\/team\/members$/));
  await page.goto("/team");
  await loadsFailsRetries(page, b, "Loading members...", "Members couldn't be loaded.");
  await expect(main(page).getByText("me@example.com").first()).toBeVisible();
});

const post = (id: string, time: string) => ({
  id, social_set_id: "d", platform: "bluesky", body: `Body of ${id}`, media: [], thread: [], status: "scheduled",
  scheduled_at: `2026-11-12T${time}:00Z`, published_at: null, error: null, created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", targets: [], lists: [], group_id: null,
});

test("Calendar: the grid stands while the month loads, and a busy day's list opens beside its day", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const b = await brain(page, path(/\/v1\/posts$/), ["08:00", "09:00", "10:00", "11:00", "12:00"].map((t, i) => post(`p${i}`, t)));
  await page.goto("/calendar");
  const table = page.getByRole("table", { name: "Posts in November 2026" });
  await expect(table).toBeVisible();
  const before = await table.boundingBox();
  await loadsFailsRetries(page, b, "Loading posts...", "Posts couldn't be loaded.");
  await expect(table.getByRole("link", { name: /Body of p0/ })).toBeVisible();
  await expect(main(page).locator(".skeleton")).toHaveCount(0);
  // Same grid, same size: nothing jumped when the posts arrived.
  expect((await table.boundingBox())?.height).toBe(before?.height);

  const more = table.getByRole("button", { name: /^Show all 5 posts/ });
  await more.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const d = (await dialog.boundingBox())!;
  const cell = (await more.locator("xpath=ancestor::td").boundingBox())!;
  expect(d.x >= cell.x + cell.width || d.x + d.width <= cell.x).toBe(true);
});

test("Posts: the filter chips stay on one line on a phone and scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const b = await brain(page, () => false);
  b.open();
  await page.goto("/posts");
  const chips = page.getByRole("list", { name: "Status" });
  await expect(chips.getByRole("button", { name: /^Draft/ })).toBeAttached();
  const size = await chips.evaluate((el) => ({ height: el.clientHeight, scroll: el.scrollWidth, width: el.clientWidth }));
  expect(size.height).toBeLessThan(48);
  expect(size.scroll).toBeGreaterThan(size.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
