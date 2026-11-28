import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const account = (id: string, provider: string, name: string, set_ids: string[]) => ({
  id,
  provider,
  external_id: id,
  handle: id,
  display_name: name,
  avatar_url: null,
  token_expires_at: null,
  set_ids,
  dm_access: true,
  created_at: "2026-10-20T10:00:00Z",
});
// Two Bluesky accounts, a Facebook Page and a YouTube channel, in two sets.
const accounts = [
  account("bsky1", "bluesky", "Alice", ["sA"]),
  account("bsky2", "bluesky", "Bob Brand", ["sB"]),
  account("fb1", "facebook", "Acme Page", ["sA", "sB"]),
  account("yt1", "youtube", "Acme Channel", ["sB"]),
];
const sets = [
  { id: "sA", name: "Acme", is_default: false, account_ids: ["bsky1", "fb1"], account_count: 2, created_at: "", deleted_at: null },
  { id: "sB", name: "Brand B", is_default: false, account_ids: ["bsky2", "fb1", "yt1"], account_count: 3, created_at: "", deleted_at: null },
];
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const item = (id: string, accountId: string, platform: string, kind: string, text: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  id,
  number: Number(id.replace(/\D/g, "")) || 1,
  social_account_id: accountId,
  platform,
  kind,
  remote_id: `r-${id}`,
  remote_url: kind === "dm" ? null : `https://example.test/${id}`,
  parent_remote_id: null,
  root_remote_id: null,
  convo_id: kind === "dm" ? "convo1" : null,
  post_id: null as string | null,
  author: { id: `a-${id}`, handle: `fan-${id}`, name: `Fan ${id}`, avatar_url: null },
  text,
  received_at: ago(minutes),
  state: "open",
  replied_at: null as string | null,
  replies: [] as unknown[],
  assigned_to: null as { id: string; name: string } | null,
  contact_tags: [] as string[],
  ...extra,
});
type Row = ReturnType<typeof item>;
type View = { id: string; scope: string; name: string; filters: Record<string, string>; is_default: boolean; created_at: string; updated_at: string };
const view = (id: string, name: string, filters: Record<string, string>, is_default = false): View => ({ id, scope: "comments", name, filters, is_default, created_at: "", updated_at: "" });

const items = (): Row[] => [
  item("c1", "bsky1", "bluesky", "comment", "Love this post", 5, { post_id: "post-1" }),
  item("c2", "bsky2", "bluesky", "comment", "Where is my refund?", 10),
  item("c3", "fb1", "facebook", "comment", "Great shop", 15, { post_id: "post-1", replied_at: ago(3), replies: [] }),
  item("c4", "yt1", "youtube", "comment", "Nice video", 20, { video: { id: "v1", title: "How we pack orders", thumbnail_url: null, url: "https://youtube.test/v1" } }),
  item("m1", "bsky1", "bluesky", "mention", "Thanks @alice for the tip", 25),
  item("d1", "bsky1", "bluesky", "dm", "Hi, can we talk?", 30),
  item("f1", "bsky1", "bluesky", "follow", "", 35, { state: "done" }),
];

// A small in-memory brain: the inbox list and count with the filters Comments sends, and saved views.
async function brain(page: Page, opts: { views?: View[]; accounts?: typeof accounts; role?: string } = {}) {
  const state = {
    rows: items(),
    views: opts.views ?? ([] as View[]),
    asked: [] as URLSearchParams[],
    inboxBodies: [] as unknown[],
    viewCalls: [] as { method: string; body: unknown }[],
  };
  const quiet = (i: Row) => ["follow", "like", "repost"].includes(i.kind);
  const matching = (q: URLSearchParams) => {
    const kind = q.get("kind");
    const accountIds = q.get("account_ids")?.split(",");
    const platforms = q.get("platforms")?.split(",");
    const search = q.get("q")?.toLowerCase();
    return (i: Row) =>
      (kind === "activity" ? quiet(i) : kind === "comments" ? ["comment", "mention"].includes(i.kind) : kind ? i.kind === kind : !quiet(i)) &&
      (!accountIds || accountIds.includes(i.social_account_id)) &&
      (!platforms || platforms.includes(i.platform)) &&
      (!q.get("post_id") || i.post_id === q.get("post_id")) &&
      (q.get("unanswered") === null || (q.get("unanswered") === "true") === !i.replied_at) &&
      (!search || i.text.toLowerCase().includes(search)) &&
      (!q.get("from") || i.received_at >= q.get("from")!) &&
      (!q.get("to") || i.received_at < q.get("to")!);
  };
  await page.route("**/auth/me", (route) => route.fulfill({ json: { ...me, current_team: { ...me.current_team, role: opts.role ?? "owner" } } }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: opts.accounts ?? accounts }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route(/\/v1\/posts\/post-1$/, (route) => route.fulfill({ json: { id: "post-1", number: 42, body: "Our new summer range is here", platform: "bluesky" } }));
  await page.route(/\/v1\/inbox-items\/[^/]+\/automations$/, (route) => route.fulfill({ json: { automations: [] } }));
  await page.route("**/v1/inboxes", (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      state.inboxBodies.push(req.postDataJSON());
      return route.fulfill({ status: 201, json: { id: "i9", number: 9, name: req.postDataJSON().name, is_all: false, account_ids: req.postDataJSON().account_ids, filters: req.postDataJSON().filters, created_at: "", updated_at: "" } });
    }
    const open = (f: (i: Row) => boolean) => state.rows.filter((i) => i.state === "open" && !quiet(i) && f(i)).length;
    return route.fulfill({
      json: [{ id: "all", number: 1, name: "All", is_all: true, account_ids: [], filters: { kinds: [], keywords: [], unanswered: false }, created_at: "", updated_at: "", open_count: open(() => true), open_dm_count: open((i) => i.kind === "dm"), open_comment_count: open((i) => i.kind !== "dm") }],
    });
  });
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    state.asked.push(q);
    const match = matching(q);
    const rows = state.rows.filter((i) => match(i) && (q.get("kind") === "activity" || i.state === q.get("state")));
    return route.fulfill({ json: { items: rows.sort((a, b) => b.received_at.localeCompare(a.received_at)).map((i) => ({ ...i, conversation: null })), next_cursor: null } });
  });
  await page.route(/\/v1\/inboxes\/[^/]+\/count/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    state.asked.push(q);
    const match = matching(q);
    return route.fulfill({ json: { count: state.rows.filter((i) => match(i) && (q.get("kind") === "activity" || i.state === q.get("state"))).length } });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3]!;
    const found = state.rows.find((i) => i.id === id || String(i.number) === id);
    return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+\/(thread|actions)$/, (route) => route.fulfill({ status: 422, json: { error: "not_a_thread" } }));
  await page.route("**/v1/views?*", (route) => route.fulfill({ json: [...state.views].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)) }));
  await page.route("**/v1/views", (route) => {
    const body = route.request().postDataJSON();
    state.viewCalls.push({ method: "POST", body });
    if (state.views.some((v) => v.name.toLowerCase() === String(body.name).toLowerCase())) return route.fulfill({ status: 409, json: { error: "name_taken" } });
    if (body.is_default) state.views = state.views.map((v) => ({ ...v, is_default: false }));
    const made = view(`v${state.views.length + 1}`, body.name, body.filters, body.is_default);
    state.views.push(made);
    return route.fulfill({ status: 201, json: made });
  });
  await page.route(/\/v1\/views\/[^/]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3]!;
    const found = state.views.find((v) => v.id === id)!;
    const body = route.request().postDataJSON();
    state.viewCalls.push({ method: route.request().method(), body });
    if (route.request().method() === "DELETE") {
      state.views = state.views.filter((v) => v.id !== id);
      return route.fulfill({ status: 204 });
    }
    if (body.is_default) state.views = state.views.map((v) => ({ ...v, is_default: false }));
    Object.assign(found, body);
    return route.fulfill({ json: found });
  });
  return state;
}

const list = (page: Page) => page.locator('ul[aria-label="Items"] > li:visible, ul[aria-label="Comments"] > li:visible');
const panel = (page: Page) => page.getByRole("complementary", { name: "Views and filters" });
const texts = async (page: Page) => (await list(page).allInnerTexts()).map((t) => t.replace(/\s+/g, " "));

test("the sidebar has Comments after Inbox", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  const links = page.getByRole("navigation", { name: "App" }).getByRole("link");
  const names = await links.allInnerTexts();
  expect(names.indexOf("Comments")).toBe(names.indexOf("Inbox") + 1);
});

test("lists the comments and mentions of every network, newest first, with the network, the account and the post", async ({ page }) => {
  await brain(page);
  await page.goto("/comments");
  await expect(page.locator("#items-heading")).toContainText("Comments");
  // Four comments and a mention: no DM, no follow.
  await expect(list(page)).toHaveCount(5);
  const rows = await texts(page);
  expect(rows[0]).toContain("Love this post");
  expect(rows[0]).toContain("Bluesky: Alice");
  expect(rows[0]).toContain("On: Our new summer range is here");
  expect(rows.some((r) => r.includes("Facebook: Acme Page") && r.includes("Great shop"))).toBe(true);
  expect(rows.some((r) => r.includes("YouTube: Acme Channel") && r.includes("On: How we pack orders"))).toBe(true);
  expect(rows.some((r) => r.includes("Mention") && r.includes("Thanks @alice"))).toBe(true);
  expect(rows.join(" ")).not.toContain("Hi, can we talk");
  // The badge is the count under the filters, the same number as the list.
  await expect(page.getByTestId("comments-count")).toContainText("5");
});

test("filters by set (several), network, account and replies, all in the address, and the count follows", async ({ page }) => {
  const b = await brain(page);
  await page.goto("/comments");
  await expect(list(page)).toHaveCount(5);
  // Set A is Alice and the Page.
  await panel(page).getByText("Sets", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Acme\b/ }).click();
  await expect(page).toHaveURL(/set=sA/);
  await expect(list(page)).toHaveCount(3);
  await expect(page.getByTestId("comments-count")).toContainText("3");
  // Brand B too: the union of both sets' accounts.
  await page.getByRole("checkbox", { name: /Brand B/ }).click();
  await expect(page).toHaveURL(/set=sA%2CsB/);
  await expect(list(page)).toHaveCount(5);
  // A network on top of the sets: Bluesky has two accounts, both in a set picked.
  await panel(page).getByText("Networks", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Bluesky" }).click();
  await expect(list(page)).toHaveCount(3);
  await panel(page).getByText("Accounts", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Bob Brand/ }).click();
  await expect(list(page)).toHaveCount(1);
  expect((await texts(page))[0]).toContain("Where is my refund?");
  const last = b.asked.filter((q) => q.get("kind") === "comments").at(-1)!;
  expect(last.get("account_ids")).toBe("bsky2");
  // Unanswered only.
  await panel(page).getByText("Replies", { exact: true }).click();
  await page.getByRole("radio", { name: "Answered", exact: true }).click();
  await expect(page).toHaveURL(/answer=answered/);
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByText("No comments match these filters.")).toBeVisible();
});

test("a view applies by click and by the number keys, Clear and 0 and Esc clear it, and none is deleted", async ({ page }) => {
  await brain(page, { views: [view("v1", "Bluesky", { network: "bluesky" }), view("v2", "Unanswered", { answer: "unanswered" })] });
  await page.goto("/comments?q=%20");
  const views = page.getByRole("list", { name: "Saved views" });
  await expect(views.getByRole("button")).toHaveCount(2);
  await views.getByRole("button", { name: /Bluesky/ }).click();
  await expect(page).toHaveURL(/network=bluesky/);
  await expect(views.getByRole("button", { name: /Bluesky/ })).toHaveAttribute("aria-pressed", "true");
  await expect(list(page)).toHaveCount(3);
  // Key 2 swaps to the second view, 0 clears, Esc clears too.
  await page.keyboard.press("2");
  await expect(page).toHaveURL(/answer=unanswered/);
  await expect(page).not.toHaveURL(/network=/);
  await expect(views.getByRole("button", { name: /Unanswered/ })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("0");
  await expect(page).toHaveURL(/view=none/);
  await expect(list(page)).toHaveCount(5);
  await page.keyboard.press("1");
  await expect(list(page)).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/view=none/);
  await expect(list(page)).toHaveCount(5);
  // Clear is a button too, and the views are all still there.
  await views.getByRole("button", { name: /Bluesky/ }).click();
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(list(page)).toHaveCount(5);
  await expect(views.getByRole("button")).toHaveCount(2);
  // The keys do nothing while typing in the search box.
  await page.getByRole("searchbox", { name: "Search comments" }).fill("1");
  await expect(page).not.toHaveURL(/network=bluesky/);
});

test("the default view applies when Comments opens with no filters, shows, and Clear does not delete it", async ({ page }) => {
  const b = await brain(page, { views: [view("v1", "Bluesky", { network: "bluesky" }, true), view("v2", "Unanswered", { answer: "unanswered" })] });
  await page.goto("/comments");
  await expect(page).toHaveURL(/network=bluesky/);
  await expect(list(page)).toHaveCount(3);
  await expect(page.getByTestId("default-view")).toContainText("Default: Bluesky");
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page).toHaveURL(/view=none/);
  await expect(list(page)).toHaveCount(5);
  await expect(page.getByTestId("default-view")).toContainText("Default: Bluesky");
  expect(b.views).toHaveLength(2);
  // A link with its own filters keeps them, and a deep link to an item keeps the list as it is.
  await page.goto("/comments?answer=unanswered");
  await expect(page).not.toHaveURL(/network=/);
  await page.goto("/comments?item=c2");
  await expect(page).not.toHaveURL(/network=/);
  await expect(page.getByRole("region", { name: "Item" })).toContainText("Where is my refund?");
});

test("saves the filters as a view, as the default, renames it and deletes it", async ({ page }) => {
  const b = await brain(page);
  await page.goto("/comments?network=facebook&answer=answered");
  await expect(list(page)).toHaveCount(1);
  await page.getByLabel("Save these filters as a view").fill("Answered on Facebook");
  await page.getByLabel("Open Comments with this view").click();
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("status").filter({ hasText: 'Saved the view "Answered on Facebook", now your default' })).toBeVisible();
  expect(b.views[0]).toMatchObject({ name: "Answered on Facebook", is_default: true, filters: { network: "facebook", answer: "answered" } });
  const views = page.getByRole("list", { name: "Saved views" });
  await expect(views.getByRole("button", { name: /Answered on Facebook/ })).toHaveAttribute("aria-pressed", "true");
  // The same name again is refused with words.
  await page.getByLabel("Save these filters as a view").fill("answered on facebook");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByText("You already have a view with that name")).toBeVisible();
  // Rename, stop using it by default, delete.
  await page.getByLabel("Manage the view Answered on Facebook").click();
  await page.getByRole("button", { name: "Stop using by default" }).click();
  await expect(page.getByTestId("default-view")).toContainText("No default view");
  await page.getByLabel("Manage the view Answered on Facebook").click();
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("New name of the view Answered on Facebook").fill("FB answered");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(views.getByRole("button", { name: /FB answered/ })).toBeVisible();
  await page.getByLabel("Manage the view FB answered").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(views).toHaveCount(0);
  expect(b.views).toHaveLength(0);
});

test("By post gives a card per post with its comments from every network and the unanswered count", async ({ page }) => {
  await brain(page);
  await page.goto("/comments?by=post");
  const card = page.getByRole("region", { name: "Comments on Our new summer range is here" });
  await expect(card).toContainText("2 comments, 1 unanswered");
  await expect(card).toContainText("Bluesky, Facebook");
  await expect(card.getByRole("link", { name: "Open the post" })).toHaveAttribute("href", /\/posts\/42$/);
  await expect(card.getByRole("link", { name: /Love this post/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /Great shop/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Comments on How we pack orders" })).toContainText("1 comment, 1 unanswered");
  // One post's comments only.
  await card.getByRole("link", { name: "Only this post" }).click();
  await expect(page).toHaveURL(/post=post-1/);
  await expect(list(page)).toHaveCount(2);
});

test("Activity shows follows, likes and reposts", async ({ page }) => {
  await brain(page);
  await page.goto("/comments");
  await panel(page).getByText("Moderation", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Activity instead of comments/ }).click();
  await expect(page).toHaveURL(/show=activity/);
  await expect(list(page)).toHaveCount(1);
  await expect(list(page).first()).toContainText("Followed you");
});

test("Save as inbox makes a comments-only inbox in one click", async ({ page }) => {
  const b = await brain(page);
  await page.goto("/comments?network=bluesky&q=refund&answer=unanswered&post=post-1");
  await page.getByRole("button", { name: "Save as inbox" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Made the inbox" })).toContainText('"Comments: Bluesky, "refund""');
  await expect(page.getByRole("status").filter({ hasText: "An inbox does not hold one post" })).toBeVisible();
  expect(b.inboxBodies[0]).toEqual({
    name: 'Comments: Bluesky, "refund"',
    account_ids: ["bsky1", "bsky2"],
    filters: { kinds: ["comment", "mention"], keywords: ["refund"], unanswered: true },
  });
  await expect(page.getByRole("link", { name: "Open it" })).toHaveAttribute("href", /\/inbox\/9$/);
});

test("Automate comments like this opens the comment builder with the accounts and the keyword", async ({ page }) => {
  await brain(page);
  await page.goto("/comments?set=sA&q=price");
  await page.getByRole("link", { name: "Automate comments like this" }).click();
  await expect(page).toHaveURL(/\/automations\/new\?template=comment-to-dm&set=sA&keywords=price/);
});

test("a member cannot make inboxes or automations from comments, and the page says why", async ({ page }) => {
  await brain(page, { role: "member" });
  await page.goto("/comments");
  await expect(page.getByRole("button", { name: "Save as inbox" })).toHaveCount(0);
  await expect(page.getByText("Team owners and admins can make an inbox or an automation")).toBeVisible();
});

test("says what to do with no account, and what LinkedIn and X need", async ({ page }) => {
  await brain(page, { accounts: [] });
  await page.goto("/comments");
  await expect(page.getByText("No accounts connected")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect an account" })).toBeVisible();
  await expect(page.getByText("LinkedIn comments need LinkedIn's approval")).toBeVisible();
});

test("an item opens in the same page, J and K move, and a DM address moves to the Inbox", async ({ page }) => {
  await brain(page);
  await page.goto("/comments");
  await list(page).first().getByRole("link").click();
  await expect(page).toHaveURL(/\/comments\?item=1$/);
  await expect(page.getByRole("region", { name: "Item" })).toContainText("Love this post");
  await page.keyboard.press("j");
  await expect(page.getByRole("region", { name: "Item" })).toContainText("Where is my refund?");
  await page.keyboard.press("k");
  await expect(page.getByRole("region", { name: "Item" })).toContainText("Love this post");
  await page.goto("/comments?item=d1");
  await expect(page).toHaveURL(/\/inbox\?item=1/);
});

test("the shortcut help lists the view keys, and not the inbox stepping keys", async ({ page }) => {
  await brain(page);
  await page.goto("/comments");
  await expect(list(page)).toHaveCount(5);
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toContainText("Apply the saved view with that number");
  await expect(dialog).toContainText("Clear every filter");
  await expect(dialog).not.toContainText("Next inbox");
});

test("Clear and a view also reset the keyword box, and keep the Done tab and the open item", async ({ page }) => {
  await brain(page, { views: [view("v1", "Unanswered", { answer: "unanswered" })] });
  await page.goto("/comments?view=none");
  const box = page.getByRole("searchbox", { name: "Search comments" });
  await box.fill("refund");
  await expect(page).toHaveURL(/q=refund/);
  await expect(list(page)).toHaveCount(1);
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(box).toHaveValue("");
  await page.waitForTimeout(600);
  await expect(page).not.toHaveURL(/q=/);
  await expect(list(page)).toHaveCount(5);
  // Applying a view that has no keyword empties the box too.
  await box.fill("shop");
  await expect(list(page)).toHaveCount(1);
  await page.getByRole("button", { name: /Unanswered/ }).click();
  await expect(box).toHaveValue("");
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/answer=unanswered/);
  await expect(page).not.toHaveURL(/q=/);
});

test("the Done tab and the open item survive a filter, Clear and a view", async ({ page }) => {
  const b = await brain(page, { views: [view("v1", "Bluesky", { network: "bluesky" })] });
  b.rows.find((i) => i.id === "c2")!.state = "done";
  await page.goto("/comments?state=done&item=c2&view=none");
  await expect(list(page)).toHaveCount(1);
  await panel(page).getByText("Networks", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Bluesky" }).click();
  await expect(page).toHaveURL(/state=done/);
  // The address says the item by its number once it has loaded.
  await expect(page).toHaveURL(/item=(c2|2)/);
  await page.keyboard.press("0");
  await expect(page).toHaveURL(/view=none/);
  await expect(page).toHaveURL(/state=done/);
  await expect(page).toHaveURL(/item=(c2|2)/);
  await page.getByRole("button", { name: /Bluesky/ }).click();
  await expect(page).toHaveURL(/state=done/);
  // The tabs keep Clear's "no default" too.
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/view=none/);
});

test("the default view does not come back when its last filter is unticked, or after Clear and a tab", async ({ page }) => {
  await brain(page, { views: [view("v1", "Facebook", { network: "facebook" }, true)] });
  await page.goto("/comments");
  await expect(page).toHaveURL(/network=facebook/);
  // The group is open by itself, as a filter is picked in it.
  await page.getByRole("checkbox", { name: "Facebook" }).click();
  await expect(page).not.toHaveURL(/network=/);
  await expect(list(page)).toHaveCount(5);
  await page.waitForTimeout(500);
  await expect(page).not.toHaveURL(/network=/);
  // A visit from the sidebar is a new visit: the default applies again.
  await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Comments" }).click();
  await expect(page).toHaveURL(/network=facebook/);
  // Making a view the default while unfiltered does not jump to it.
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page).toHaveURL(/view=none/);
  await expect(list(page)).toHaveCount(5);
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/view=none/);
  await expect(page).not.toHaveURL(/network=/);
});

test("Esc closes a view's menu first and leaves the filters alone", async ({ page }) => {
  await brain(page, { views: [view("v1", "Bluesky", { network: "bluesky" })] });
  await page.goto("/comments?network=bluesky");
  await page.getByLabel("Manage the view Bluesky").click();
  await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Rename" })).toBeHidden();
  await expect(page).toHaveURL(/network=bluesky/);
});

test("a long view name and a long account name never widen the panel past its pane", async ({ page }) => {
  const long = "A view with a name that goes on and on to sixty characters or so";
  const wide = [...accounts.slice(0, 3), account("fb2", "facebook", "Harun R. Rayhan - Solutions Architect (DevOps and AI) - a very long Page name", ["sA"])];
  await brain(page, { views: [view("v1", long, { network: "bluesky" }, true)], accounts: wide });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/comments?view=none");
  await expect(list(page).first()).toBeVisible();
  await panel(page).getByText("Accounts", { exact: true }).click();
  const sizes = await panel(page).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  // The view's menu is reachable without scrolling the panel sideways.
  await page.getByLabel(`Manage the view ${long}`).click();
  await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
});
