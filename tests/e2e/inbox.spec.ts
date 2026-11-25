import { expect, test, type Page } from "@playwright/test";

// Day rows and times are read in one fixed time zone.
test.use({ timezoneId: "Europe/Berlin" });

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role },
});
const alice = {
  id: "c1",
  provider: "bluesky",
  external_id: "did:plc:alice",
  handle: "alice.bsky.social",
  display_name: "Alice",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  dm_access: true,
  created_at: "2026-10-20T10:00:00Z",
};
const xavier = { ...alice, id: "x1", provider: "x", external_id: "x-1", handle: "xavier", display_name: "Xavier" };
const fbPage = { ...alice, id: "f1", provider: "facebook", external_id: "101", handle: null, display_name: "Acme Page" };
const filters = { kinds: [], keywords: [], unanswered: false };
const inbox = (id: string, name: string, extra = {}) => ({
  id,
  name,
  is_all: id === "all",
  account_ids: id === "all" ? [] : ["c1"],
  filters,
  created_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  ...extra,
});
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const item = (id: string, kind: "comment" | "mention" | "dm" | "like" | "repost" | "follow", text: string, extra = {}) => ({
  id,
  social_account_id: "c1",
  platform: "bluesky",
  kind,
  remote_id: `at://did:plc:bob/app.bsky.feed.post/${id}`,
  remote_url: kind === "dm" ? null : `https://bsky.app/profile/did:plc:bob/post/${id}`,
  parent_remote_id: null,
  root_remote_id: null,
  convo_id: kind === "dm" ? "convo1" : null,
  post_id: null,
  author: { id: "did:plc:bob", handle: "bob.bsky.social", name: "Bob", avatar_url: null },
  text,
  received_at: ago(5),
  state: "open",
  replied_at: null as string | null,
  replies: [] as unknown[],
  ...extra,
});

// A small in-memory brain for the inbox.
type Row = ReturnType<typeof item>;
// brain groups DMs per person and account.
const thread = (i: Row) => (i.kind === "dm" ? `${i.social_account_id}:${i.author.id}` : i.id);
const oldestFirst = (a: Row, b: Row) => a.received_at.localeCompare(b.received_at);

async function brain(page: Page, role: Role, opts: { accounts?: unknown[]; items?: Row[]; convoPage?: number; inboxes?: ReturnType<typeof inbox>[] } = {}) {
  const state = {
    inboxes: opts.inboxes ?? [inbox("all", "All"), inbox("i2", "Questions", { filters: { ...filters, keywords: ["price"] } })],
    items: opts.items ?? [
      item("p1", "comment", "What is the price?"),
      item("p2", "mention", "Loving @alice lately", { received_at: ago(90) }),
      item("p3", "dm", "Hi, can we talk?", { received_at: ago(60 * 30) }),
    ],
    bodies: [] as unknown[],
    asked: [] as URLSearchParams[],
    // Every PATCH and reply to an item, and every conversation page asked for.
    patches: [] as { id: string; body: Record<string, unknown> }[],
    replies: [] as { id: string; body: Record<string, unknown> }[],
    convos: [] as { id: string; before: string | null }[],
    // Set to a status to make the next PATCHes fail.
    failPatch: 0,
    // The posts above an item, by item id; an item with none has an empty thread.
    above: {} as Record<string, unknown[]>,
    // The account's live state toward the open item, and every action posted (with its body); `refuse` makes the next one fail with that message.
    viewer: { liked: false, reposted: false, following: false, blocking: false, muted: false, thread_muted: false } as Record<string, boolean>,
    acted: [] as Record<string, unknown>[],
    refuse: null as string | null,
  };
  const dms = (i: Row) => state.items.filter((x) => x.kind === "dm" && thread(x) === thread(i)).sort(oldestFirst);
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: opts.accounts ?? [alice] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/inboxes", (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      state.bodies.push(req.postDataJSON());
      const made = inbox("i3", req.postDataJSON().name, { account_ids: req.postDataJSON().account_ids, filters: req.postDataJSON().filters });
      state.inboxes.push(made);
      return route.fulfill({ status: 201, json: made });
    }
    // brain counts each inbox's open items; "Questions" holds the ones about the price.
    const open = (id: string) => state.items.filter((i) => i.state === "open" && (id !== "i2" || i.text.includes("price"))).length;
    return route.fulfill({ json: state.inboxes.map((i) => ({ ...i, open_count: open(i.id) })) });
  });
  await page.route(/\/v1\/inboxes\/i2$/, (route) => {
    const req = route.request();
    if (req.method() === "DELETE") {
      state.inboxes = state.inboxes.filter((i) => i.id !== "i2");
      return route.fulfill({ status: 204 });
    }
    state.bodies.push(req.postDataJSON());
    return route.fulfill({ json: inbox("i2", req.postDataJSON().name) });
  });
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    const kind = q.get("kind");
    const search = q.get("q")?.toLowerCase();
    state.asked.push(q);
    // Activity (follows, likes, reposts) is listed only when asked for.
    const quiet = (i: Row) => ["follow", "like", "repost"].includes(i.kind);
    const match = (i: Row) => (kind === "activity" ? quiet(i) : kind ? i.kind === kind : !quiet(i)) && (!search || i.text.toLowerCase().includes(search));
    // Activity is listed whatever the state asked for, as brain does.
    if (kind === "activity") return route.fulfill({ json: { items: state.items.filter(match).map((i) => ({ ...i, conversation: null })), next_cursor: null } });
    // One row per conversation: its latest DM. Open while any of its DMs is open, done once none is.
    const rows = state.items.filter(match).flatMap((i): (Row & { conversation: object | null })[] => {
      if (i.kind !== "dm" || q.get("group") !== "conversations") return i.state === q.get("state") ? [{ ...i, conversation: null }] : [];
      const all = dms(i);
      const open = all.filter((x) => x.state === "open").length;
      if (all.at(-1) !== i || (open > 0 ? "open" : "done") !== q.get("state")) return [];
      return [{ ...i, conversation: { count: all.length, open_count: open, first_at: all[0]!.received_at, last_at: i.received_at } }];
    });
    return route.fulfill({ json: { items: rows.sort((a, b) => -oldestFirst(a, b)), next_cursor: null } });
  });
  const itemId = (url: string) => new URL(url).pathname.split("/")[3]!;
  await page.route(/\/v1\/inbox-items\/[^/]+$/, (route) => {
    const found = state.items.find((i) => i.id === itemId(route.request().url()));
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      state.patches.push({ id: found.id, body });
      if (state.failPatch) return route.fulfill({ status: state.failPatch, json: { error: "server_error" } });
      for (const i of body.conversation ? dms(found) : [found]) {
        if ("state" in body) i.state = body.state;
        if ("assigned_to" in body) Object.assign(i, { assigned_to: body.assigned_to ? { id: body.assigned_to, name: "Me" } : null });
      }
    }
    return route.fulfill({ json: found });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+\/conversation(\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const found = state.items.find((i) => i.id === itemId(route.request().url()));
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (found.kind !== "dm") return route.fulfill({ status: 422, json: { error: "not_a_conversation" } });
    const before = url.searchParams.get("before");
    state.convos.push({ id: found.id, before });
    const all = dms(found);
    const older = before ? all.slice(0, all.findIndex((i) => i.id === before)) : all;
    const size = opts.convoPage ?? 50;
    return route.fulfill({ json: { items: older.slice(-size), has_more: older.length > size } });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+\/thread$/, (route) => {
    const id = itemId(route.request().url());
    if (state.items.find((i) => i.id === id)?.kind === "dm") return route.fulfill({ status: 422, json: { error: "not_a_thread" } });
    return route.fulfill({ json: { posts: state.above[id] ?? [], truncated: false } });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+\/actions$/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      state.acted.push(body);
      if (state.refuse) return route.fulfill({ status: 422, json: { error: "bluesky_refused", message: state.refuse } });
      const flips: Record<string, [string, boolean]> = { like: ["liked", true], unlike: ["liked", false], follow: ["following", true], block_author: ["blocking", true] };
      const flip = flips[body.action as string];
      if (flip) state.viewer[flip[0]] = flip[1];
      return route.fulfill({ json: { action: body.action, remote_id: null } });
    }
    return route.fulfill({ json: { viewer: state.viewer, viewer_error: null, hidden: false, log: [] } });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+\/reply$/, (route) => {
    const found = state.items.find((i) => i.id === itemId(route.request().url()))!;
    const body = route.request().postDataJSON();
    state.replies.push({ id: found.id, body });
    found.replied_at = new Date().toISOString();
    found.replies = [...found.replies, { id: `r${state.replies.length}`, kind: found.kind === "dm" ? "dm" : "public", text: body.text, remote_id: null, remote_url: null, sent_by: "u-me", automation_id: null, created_at: found.replied_at }];
    if (body.conversation) for (const i of dms(found)) i.state = "done";
    return route.fulfill({ status: 201, json: found });
  });
  return state;
}

test("sidebar lists Home, Posts, Calendar, Queue, Lists, Library, Feeds and Analytics, then Inbox, Contacts, Broadcasts, Newsletters and Automations", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/posts");
  const links = page.getByRole("navigation", { name: "App" }).getByRole("link");
  await expect(links.nth(0)).toHaveText("Home");
  await expect(links.nth(1)).toHaveText("Posts");
  await expect(links.nth(2)).toHaveText("Calendar");
  await expect(links.nth(3)).toHaveText("Queue");
  await expect(links.nth(4)).toHaveText("Lists");
  await expect(links.nth(5)).toHaveText("Library");
  await expect(links.nth(6)).toHaveText("Feeds");
  await expect(links.nth(7)).toHaveText("Analytics");
  await expect(links.nth(8)).toHaveText("Inbox");
  await expect(links.nth(9)).toHaveText("Contacts");
  await expect(links.nth(10)).toHaveText("Broadcasts");
  await expect(links.nth(11)).toHaveText("Newsletters");
  await expect(links.nth(12)).toHaveText("Automations");
});

test("inbox lists items, filters by kind, and opens one by URL", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/inbox");
  const nav = page.getByRole("navigation", { name: "Inboxes" });
  await expect(nav.getByRole("link").first()).toHaveText("All inboxes");
  await expect(nav.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  const list = page.getByRole("region", { name: "All" });
  const rows = list.getByRole("list", { name: "Items" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Unanswered:");
  await expect(rows.first()).toContainText("5 minutes ago");
  await page.getByRole("combobox", { name: "Kind" }).selectOption({ label: "DMs" });
  await expect(page.getByRole("combobox", { name: "Kind" })).toHaveValue("dm");
  await expect(rows).toHaveCount(1);
  await list.getByRole("link", { name: /Hi, can we talk/ }).click();
  await expect(page).toHaveURL("/t/acme22/inbox?item=p3");
  const detail = page.getByRole("region", { name: "Item" });
  await expect(detail.getByRole("heading", { name: "Bob" })).toBeFocused();
  await expect(detail.getByLabel("Send DM")).toBeVisible();
  await expect(detail.getByRole("link", { name: "View on Bluesky" })).toHaveCount(0);
  // A shared link opens the same item.
  await page.goto("/inbox/i2?item=p1");
  await expect(page.getByRole("region", { name: "Item" }).getByLabel("Reply publicly")).toBeVisible();
  await expect(page.getByRole("region", { name: "Item" }).getByRole("link", { name: "View on Bluesky" })).toHaveAttribute(
    "href",
    "https://bsky.app/profile/did:plc:bob/post/p1",
  );
  await expect(page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "Questions" })).toHaveAttribute("aria-current", "page");
});

test("likes and reposts are quiet activity behind their own filter, and a reply shows the posts above it", async ({ page }) => {
  const state = await brain(page, "owner", {
    items: [
      item("p1", "comment", "Thanks, that helped", { parent_remote_id: "at://did:plc:alice/app.bsky.feed.post/mid" }),
      item("l1", "like", "", { state: "done", received_at: ago(10), remote_url: "https://bsky.app/profile/did:plc:alice/post/root" }),
      item("r1", "repost", "", { state: "done", received_at: ago(20) }),
    ],
  });
  const post = (author: string, text: string) => ({ uri: `at://${author}/p`, url: `https://bsky.app/profile/${author}/post/p`, author: { id: author, handle: `${author}.test`, name: author, avatar_url: null }, text, created_at: ago(300), attachments: [] });
  state.above.p1 = [post("alice", "Our launch post"), post("carol", "How does it work?")];
  await page.goto("/inbox");
  const list = page.getByRole("region", { name: "All" }).getByRole("list", { name: "Items" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Kind" }).selectOption({ label: "Activity (likes, reposts, follows)" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Liked your post");
  await expect(list).toContainText("Reposted your post");
  // Activity has nothing to answer.
  await list.getByRole("link", { name: /Liked your post/ }).click();
  const detail = page.getByRole("region", { name: "Item" });
  await expect(detail.getByRole("heading", { name: "Bob" })).toBeVisible();
  await expect(detail.getByLabel("Reply publicly")).toBeHidden();
  // A reply shows what it answers, oldest first.
  await page.goto("/inbox?item=p1");
  const context = detail.locator('[data-row="context"]');
  await expect(context).toHaveCount(2);
  await expect(context.first()).toContainText("Our launch post");
  await expect(context.last()).toContainText("How does it work?");
  await expect(detail.getByLabel("Reply publicly")).toBeVisible();
});

test("actions on Bluesky are confirmed first, follow the live state, and the risky ones are for owners and admins", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/inbox?item=p1");
  const detail = page.getByRole("region", { name: "Item" });
  await detail.getByText("Actions on Bluesky").click();
  // Nothing is sent until it is confirmed.
  await detail.getByRole("button", { name: "Like", exact: true }).click();
  await expect(detail.getByRole("group", { name: "Confirm" })).toContainText("Like @bob.bsky.social's post");
  expect(state.acted).toEqual([]);
  await detail.getByRole("button", { name: "Confirm" }).click();
  await expect(detail.getByRole("status").filter({ hasText: "Liked." })).toBeVisible();
  expect(state.acted).toEqual([{ action: "like", confirm: true }]);
  // The next read shows the state: now it can be undone.
  await expect(detail.getByRole("button", { name: "Unlike" })).toBeVisible();
  // Block asks, in words, and a refusal from Bluesky is said.
  state.refuse = "Bluesky refused it (InvalidRequest).";
  await detail.getByRole("button", { name: "Block", exact: true }).click();
  await expect(detail.getByRole("group", { name: "Confirm" })).toContainText("can no longer see this account's posts");
  await detail.getByRole("button", { name: "Confirm" }).click();
  await expect(detail.getByRole("alert").filter({ hasText: "Bluesky refused it" })).toBeVisible();
  // A report takes a reason and says who gets it.
  state.refuse = null;
  await detail.getByRole("button", { name: "Report", exact: true }).click();
  const form = detail.getByRole("form", { name: "Report to Bluesky" });
  await expect(form).toContainText("moderators");
  await form.getByLabel("Reason").selectOption("rude");
  await form.getByLabel("Details (optional)").fill("Insults");
  await form.getByLabel("Report the account").check();
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(detail.getByRole("status").filter({ hasText: "Reported to Bluesky." })).toBeVisible();
  expect(state.acted.at(-1)).toEqual({ action: "report", reason_type: "rude", reason: "Insults", account: true, confirm: true });
});

test("a member can like and mute but is not offered block, hide or report", async ({ page }) => {
  await brain(page, "member");
  await page.goto("/inbox?item=p1");
  const detail = page.getByRole("region", { name: "Item" });
  await detail.getByText("Actions on Bluesky").click();
  await expect(detail.getByRole("button", { name: "Like", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Mute person" })).toBeVisible();
  for (const name of ["Block", "Hide reply", "Report"]) await expect(detail.getByRole("button", { name, exact: true })).toHaveCount(0);
});

test("reply publicly, then mark done and reopen", async ({ page }) => {
  const state = await brain(page, "member");
  let sent: unknown;
  await page.route("**/v1/inbox-items/p1/reply", (route) => {
    sent = route.request().postDataJSON();
    const p1 = state.items.find((i) => i.id === "p1")!;
    p1.replied_at = new Date().toISOString();
    p1.replies = [{ id: "r1", kind: "public", text: sent && (sent as { text: string }).text, remote_id: null, remote_url: null, sent_by: "u-me", automation_id: null, created_at: p1.replied_at }];
    return route.fulfill({ status: 201, json: p1 });
  });
  await page.goto("/inbox?item=p1");
  // Members read and answer but don't manage inboxes.
  await expect(page.getByRole("button", { name: "New inbox" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Questions" })).toHaveCount(0);
  const detail = page.getByRole("region", { name: "Item" });
  await detail.getByLabel("Reply publicly").fill("It is free!");
  await expect(detail.getByText("11 of 300 characters")).toBeVisible();
  await detail.getByRole("button", { name: "Reply publicly" }).click();
  await expect(detail.getByText("Reply sent.")).toBeFocused();
  expect(sent).toEqual({ text: "It is free!" });
  await expect(detail.getByRole("list", { name: "Thread" })).toContainText("It is free!");
  await expect(detail.getByRole("list", { name: "Thread" })).toContainText("Team, public reply");
  await detail.getByRole("button", { name: "Mark done" }).click();
  // The row goes at once and the next item opens.
  await expect(page.getByRole("status").filter({ hasText: "Marked done." })).toBeVisible();
  await expect(page.getByRole("region", { name: "All" }).getByRole("link", { name: /What is the price/ })).toHaveCount(0);
  await expect(page).toHaveURL("/t/acme22/inbox?item=p2");
  // A comment is one item: no word of a conversation.
  expect(state.patches).toEqual([{ id: "p1", body: { state: "done" } }]);
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await page.getByRole("region", { name: "All" }).getByRole("link", { name: /What is the price/ }).click();
  await expect(page).toHaveURL("/t/acme22/inbox?state=done&item=p1");
  await detail.getByRole("button", { name: "Reopen" }).click();
  await expect(detail.getByText("Reopened.")).toBeFocused();
});

test("a DM that can't be sent says why", async ({ page }) => {
  await brain(page, "owner");
  await page.route("**/v1/inbox-items/p3/reply", (route) =>
    route.fulfill({ status: 422, json: { error: "no_dm_access", message: "The app password has no DM access." } }),
  );
  await page.goto("/inbox?item=p3");
  const detail = page.getByRole("region", { name: "Item" });
  await detail.getByLabel("Send DM").fill("Sure");
  await detail.getByRole("button", { name: "Send DM" }).click();
  await expect(detail.getByRole("alert")).toContainText("Reconnect with an app password that allows DMs");
  await expect(detail.getByRole("alert").getByRole("link", { name: "Open Accounts" })).toHaveAttribute("href", "/t/acme22/connections");
  // The message stays in the chat, marked as not sent.
  await expect(detail.getByRole("list", { name: "Conversation" })).toContainText("Sure");
  await expect(detail.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("empty states: no accounts, then no items", async ({ page }) => {
  await brain(page, "owner", { accounts: [] });
  await page.goto("/inbox");
  await expect(page.getByText("No accounts connected")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect an account" })).toHaveAttribute("href", "/t/acme22/connections");
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await brain(page, "owner", { items: [] });
  await page.goto("/inbox");
  await expect(page.getByText("New comments, mentions and DMs show up here within a minute")).toBeVisible();
});

test("owners create, edit and delete an inbox; All is not editable", async ({ page }) => {
  const state = await brain(page, "owner", { accounts: [alice, xavier] });
  await page.goto("/inbox");
  await expect(page.getByRole("button", { name: "Edit All" })).toHaveCount(0);
  await page.getByRole("button", { name: "New inbox" }).click();
  const dialog = page.getByRole("dialog", { name: "New inbox" });
  await dialog.getByLabel("Name").fill("DMs");
  // Every account with an inbox starts picked; one without (X) is not offered.
  await expect(dialog.getByRole("checkbox", { name: "Alice, Bluesky" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Xavier/ })).toHaveCount(0);
  await expect(dialog.getByText("Bluesky, Facebook and Instagram accounts have an inbox.")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Alice, Bluesky" }).uncheck();
  await expect(dialog.getByRole("button", { name: "Create inbox" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Alice, Bluesky" }).check();
  await dialog.getByRole("checkbox", { name: "DMs" }).check();
  await dialog.getByLabel("Keywords").fill("price, link");
  await dialog.getByLabel("Keywords").press("Enter");
  await expect(dialog.getByRole("button", { name: "Remove price" })).toBeVisible();
  await dialog.getByLabel("Unanswered only").check();
  await dialog.getByRole("button", { name: "Create inbox" }).click();
  await expect(dialog).toBeHidden();
  expect(state.bodies[0]).toEqual({
    name: "DMs",
    account_ids: ["c1"],
    filters: { kinds: ["dm"], keywords: ["price", "link"], unanswered: true },
  });
  await expect(page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "DMs" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Questions" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Questions" });
  await expect(edit.getByRole("button", { name: "Remove price" })).toBeVisible();
  await edit.getByRole("button", { name: "Delete inbox" }).click();
  await edit.getByRole("button", { name: "Yes, delete" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "Questions" })).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("panes stack with back links", async ({ page }) => {
    await brain(page, "owner");
    await page.goto("/inbox");
    await expect(page.getByRole("navigation", { name: "Inboxes" })).toBeVisible();
    await expect(page.getByRole("region", { name: "All" })).toBeHidden();
    await page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "Questions" }).click();
    await expect(page.getByRole("navigation", { name: "Inboxes" })).toBeHidden();
    await page.getByRole("link", { name: /What is the price/ }).click();
    await expect(page.getByRole("region", { name: "Item" }).getByRole("heading", { name: "Bob" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Questions" })).toBeHidden();
    await page.getByRole("link", { name: "Back to Questions" }).click();
    await expect(page).toHaveURL("/t/acme22/inbox/i2");
    await page.getByRole("link", { name: "Inboxes", exact: true }).click();
    await expect(page).toHaveURL("/t/acme22/inbox");
  });
});

test("a kind filter asks brain for that kind, and load more keeps it", async ({ page }) => {
  await brain(page, "owner", { items: [item("p1", "comment", "First page")] });
  const asked: URLSearchParams[] = [];
  await page.route(/\/v1\/inboxes\/all\/items/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    asked.push(q);
    if (q.get("kind") !== "dm") return route.fulfill({ json: { items: [item("p1", "comment", "First page")], next_cursor: null } });
    return route.fulfill({
      json: q.get("cursor")
        ? { items: [item("p9", "dm", "Older DM", { received_at: ago(600) })], next_cursor: null }
        : { items: [item("p8", "dm", "Newer DM")], next_cursor: "p8" },
    });
  });
  await page.goto("/inbox");
  await page.getByRole("combobox", { name: "Kind" }).selectOption({ label: "DMs" });
  await expect(page.getByRole("link", { name: /Newer DM/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /First page/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: /Older DM/ })).toBeVisible();
  expect(asked.at(-1)?.get("kind")).toBe("dm");
  expect(asked.at(-1)?.get("cursor")).toBe("p8");
});

test("the open list picks up new items without a reload", async ({ page }) => {
  await page.clock.install();
  const state = await brain(page, "owner", { items: [item("p1", "comment", "Older comment")] });
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: /Older comment/ })).toBeVisible();
  state.items.unshift(item("p7", "comment", "Brand new comment"));
  await page.clock.runFor(31_000);
  const rows = page.getByRole("list", { name: "Items" }).getByRole("listitem");
  await expect(rows.first()).toContainText("Brand new comment");
  await expect(rows).toHaveCount(2);
});

test("search asks brain with q, keeps it in the address and on reload", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/inbox");
  const items = page.getByRole("list", { name: "Items" }).getByRole("listitem");
  await expect(items).toHaveCount(3);
  const box = page.getByRole("searchbox", { name: "Search All" });
  await box.fill("PRICE");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("What is the price?");
  await expect(page).toHaveURL("/t/acme22/inbox?q=PRICE");
  expect(state.asked.at(-1)?.get("q")).toBe("PRICE");
  // Typing is debounced: one request for the whole word, not one per letter.
  expect(state.asked.filter((q) => q.has("q"))).toHaveLength(1);

  await page.reload();
  await expect(box).toHaveValue("PRICE");
  await expect(items).toHaveCount(1);
  // Opening an item and switching to Done keep the search.
  await items.first().getByRole("link").click();
  await expect(page).toHaveURL("/t/acme22/inbox?item=p1&q=PRICE");
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await expect(page.getByText('Nothing matches "PRICE".')).toBeVisible();
  expect(state.asked.at(-1)?.get("q")).toBe("PRICE");
  expect(state.asked.at(-1)?.get("state")).toBe("done");

  await box.fill("");
  await expect(page).toHaveURL("/t/acme22/inbox?state=done&item=p1");
});

test("each inbox shows its open count, kept fresh by the poll and by Mark done", async ({ page }) => {
  await page.clock.install();
  const state = await brain(page, "owner");
  await page.goto("/inbox?item=p1");
  const nav = page.getByRole("navigation", { name: "Inboxes" });
  const all = nav.getByRole("listitem").filter({ hasText: "All" });
  const questions = nav.getByRole("listitem").filter({ hasText: "Questions" });
  await expect(all.getByText("3 open in All")).toBeAttached();
  await expect(questions.getByText("1 open in Questions")).toBeAttached();

  state.items.unshift(item("p7", "comment", "Is the price the same?"));
  await page.clock.runFor(31_000);
  await expect(all.getByText("4 open in All")).toBeAttached();
  await expect(questions.getByText("2 open in Questions")).toBeAttached();

  await page.getByRole("region", { name: "Item" }).getByRole("button", { name: "Mark done" }).click();
  await expect(all.getByText("3 open in All")).toBeAttached();
  await expect(questions.getByText("1 open in Questions")).toBeAttached();
  // An inbox with nothing open shows no badge.
  state.items.forEach((i) => (i.state = "done"));
  await page.clock.runFor(31_000);
  await expect(nav.getByText(/open in/)).toHaveCount(0);
});

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("the panes scroll on their own, not the page, and the reply box stays in view", async ({ page }) => {
    const kinds = ["comment", "mention"] as const;
    await brain(page, "owner", { items: Array.from({ length: 40 }, (_, n) => item(`q${n}`, kinds[n % 2], `Message number ${n}`, { received_at: ago(n * 7) })) });
    await page.goto("/inbox");
    const items = page.getByRole("list", { name: "Items" });
    await expect(items.getByRole("listitem")).toHaveCount(40);
    const sizes = await items.evaluate((ul) => {
      const pane = ul.parentElement!;
      return { doc: document.scrollingElement!.scrollHeight, view: innerHeight, pane: pane.scrollHeight, paneView: pane.clientHeight };
    });
    expect(sizes.doc).toBeLessThanOrEqual(sizes.view + 1);
    expect(sizes.pane).toBeGreaterThan(sizes.paneView);
    await expect(page.getByText("Pick an item to read it and reply.")).toBeVisible();

    const last = items.getByRole("link", { name: /Message number 39/ });
    await last.scrollIntoViewIfNeeded();
    const before = await items.evaluate((ul) => ul.parentElement!.scrollTop);
    expect(before).toBeGreaterThan(0);
    await last.click();
    await expect(page).toHaveURL("/t/acme22/inbox?item=q39");
    const detail = page.getByRole("region", { name: "Item" });
    await expect(detail.getByRole("heading", { name: "Bob" })).toBeFocused();
    await expect(detail.getByLabel("Reply publicly")).toBeInViewport();
    expect(await items.evaluate((ul) => ul.parentElement!.scrollTop)).toBe(before);
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= innerHeight + 1)).toBe(true);
  });

  test("Up and Down move between items, Enter opens one", async ({ page }) => {
    await brain(page, "owner");
    await page.goto("/inbox");
    const items = page.getByRole("list", { name: "Items" });
    await items.getByRole("link", { name: /What is the price/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(items.getByRole("link", { name: /Loving @alice/ })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(items.getByRole("link", { name: /Hi, can we talk/ })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/t/acme22/inbox?item=p2");
    await expect(page.getByRole("region", { name: "Item" }).getByRole("heading", { name: "Bob" })).toBeFocused();
  });
});

// Two conversations (Bob with 4 DMs, Cara with 2) and three comments, at fixed times around a fixed "now".
const NOW = "2026-11-12T12:00:00Z";
const cara = { id: "did:plc:cara", handle: "cara.bsky.social", name: "Cara", avatar_url: null };
const ourReply = { id: "r0", kind: "dm", text: "Hello Bob, sure.", remote_id: null, remote_url: null, sent_by: "u-me", automation_id: null, created_at: "2026-11-10T09:30:00Z" };
const mixed = () => [
  item("b1", "dm", "Hi, do you ship to Berlin?", { received_at: "2026-11-10T09:00:00Z", state: "done", replied_at: ourReply.created_at, replies: [ourReply] }),
  item("b2", "dm", "And how long does it take?", { received_at: "2026-11-11T10:00:00Z", state: "done" }),
  item("b3", "dm", "Still there?", { received_at: "2026-11-12T08:00:00Z" }),
  item("b4", "dm", "I would like two of them.", { received_at: "2026-11-12T11:00:00Z" }),
  item("k1", "dm", "Do you have gift cards?", { received_at: "2026-11-12T09:00:00Z", author: cara }),
  item("k2", "dm", "For 50 euros.", { received_at: "2026-11-12T09:05:00Z", author: cara }),
  item("m1", "comment", "What is the price?", { received_at: "2026-11-12T11:30:00Z" }),
  item("m2", "comment", "Great post", { received_at: "2026-11-12T07:00:00Z" }),
  item("m3", "comment", "Where is the shop?", { received_at: "2026-11-11T07:00:00Z" }),
];
// The address as the browser has it, whatever host and port the test server runs on.
const query = (page: Page) => new URL(page.url()).searchParams;

test.describe("conversations", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(({ page }) => page.clock.setFixedTime(new Date(NOW)));
  const rows = (page: Page) => page.getByRole("list", { name: "Items" }).getByRole("listitem");
  const reader = (page: Page) => page.getByRole("region", { name: "Item" });
  const chat = (page: Page) => reader(page).getByRole("list", { name: "Conversation" });
  const bubbles = (page: Page) => chat(page).locator("[data-row]");

  test("the list asks brain for conversations and shows one row for each, with its count", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    await page.goto("/inbox");
    // Newest first: the comment, Bob's conversation, Cara's, then the older comments.
    await expect(rows(page)).toHaveText([/What is the price/, /I would like two of them/, /For 50 euros/, /Great post/, /Where is the shop/]);
    expect(state.asked.length).toBeGreaterThan(0);
    expect(state.asked.every((q) => q.get("group") === "conversations")).toBe(true);
    const bob = rows(page).nth(1);
    await expect(bob).toContainText("Bob");
    await expect(bob).toContainText("4 messages");
    await expect(bob).toContainText("Unread:");
    await expect(bob).toContainText("1 hour ago");
    await expect(rows(page).nth(2)).toContainText("2 messages");
    // A comment is a row of its own, as before.
    await expect(rows(page).first()).not.toContainText("message");
    await expect(rows(page).first()).toContainText("Unanswered:");
    // The filter and Load more keep asking for conversations.
    await page.getByRole("combobox", { name: "Kind" }).selectOption({ label: "DMs" });
    await expect(rows(page)).toHaveCount(2);
    expect(state.asked.at(-1)?.get("group")).toBe("conversations");
    expect(state.asked.at(-1)?.get("kind")).toBe("dm");
  });

  test("a conversation opens as a chat at its newest message, and Load earlier brings the rest", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed(), convoPage: 2 });
    await page.goto("/inbox");
    await rows(page).nth(1).getByRole("link").click();
    await expect.poll(() => query(page).get("item")).toBe("b4");
    await expect(reader(page).getByRole("heading", { name: "Bob" })).toBeFocused();
    await expect(reader(page)).toContainText("DMs with Alice, 4 messages");
    // The newest page: one day, their two messages on the left.
    await expect(bubbles(page)).toHaveText(["Today", /Still there\?/, /I would like two of them\./]);
    await expect(bubbles(page).nth(2)).toHaveAttribute("data-row", "them");
    await expect(chat(page).getByText("I would like two of them.")).toBeInViewport();
    await expect(reader(page).getByRole("list", { name: "Thread" })).toHaveCount(0);

    await chat(page).getByRole("button", { name: "Load earlier" }).click();
    await expect(bubbles(page)).toHaveText([
      new Date("2026-11-10T09:00:00Z").toLocaleDateString("en-US", { dateStyle: "medium" }),
      /Hi, do you ship to Berlin\?/,
      /Hello Bob, sure\..*Team, DM/,
      "Yesterday",
      /And how long does it take\?/,
      "Today",
      /Still there\?/,
      /I would like two of them\./,
    ]);
    // Ours sit on the right.
    await expect(bubbles(page).nth(2)).toHaveAttribute("data-row", "us");
    await expect(chat(page).getByRole("button", { name: "Load earlier" })).toHaveCount(0);
    expect(state.convos).toEqual([
      { id: "b4", before: null },
      { id: "b4", before: "b3" },
    ]);
    // A time reads in the pinned zone: 11:00 UTC is noon in Berlin.
    await expect(bubbles(page).last()).toContainText("12:00");
  });

  test("a reply goes to the latest message for the whole conversation and shows at once", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    // The first send is refused, the second waits until the test lets it through.
    let attempt = 0;
    let release = () => {};
    const held = new Promise<void>((done) => (release = done));
    await page.route(/\/v1\/inbox-items\/[^/]+\/reply$/, async (route) => {
      attempt += 1;
      if (attempt === 1) return route.fulfill({ status: 422, json: { error: "dm_not_allowed", message: "Not taken." } });
      await held;
      return route.fallback();
    });
    // Opened through an older DM of the conversation.
    await page.goto("/inbox?item=b3");
    await expect(bubbles(page).last()).toContainText("I would like two of them.");
    const box = reader(page).getByLabel("Send DM");
    await box.fill("Two it is!");
    await box.press("ControlOrMeta+Enter");
    await expect(box).toHaveValue("");
    await expect(bubbles(page).last()).toContainText("Two it is!");
    await expect(bubbles(page).last().getByRole("alert")).toContainText("Not sent. They only accept DMs from people they follow");

    await bubbles(page).last().getByRole("button", { name: "Retry" }).click();
    await expect(bubbles(page).last()).toContainText("Sending...");
    await expect(bubbles(page).last()).toContainText("Two it is!");
    await expect(reader(page).getByRole("button", { name: "Send DM" })).toBeDisabled();
    release();
    await expect(chat(page).getByText("Sending...")).toHaveCount(0);
    await expect(bubbles(page).last()).toContainText("Two it is!");
    await expect(bubbles(page).last()).toContainText("Team, DM");
    await expect(bubbles(page).last()).toHaveAttribute("data-row", "us");
    expect(state.replies).toEqual([{ id: "b4", body: { text: "Two it is!", conversation: true } }]);
    // Answered, so the whole conversation is done and leaves the open list.
    await expect(rows(page).filter({ hasText: "Bob" }).filter({ hasText: "messages" })).toHaveCount(0);
    await expect(reader(page).getByRole("button", { name: "Reopen" })).toBeVisible();
  });

  test("Mark done closes the whole conversation at once, Undo brings it back, and a refusal says so", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    await page.goto("/inbox?item=b4");
    await expect(bubbles(page).last()).toContainText("I would like two of them.");
    await reader(page).getByRole("button", { name: "Mark done" }).click();
    await expect(rows(page)).toHaveText([/What is the price/, /For 50 euros/, /Great post/, /Where is the shop/]);
    // The next row opens.
    await expect.poll(() => query(page).get("item")).toBe("k2");
    await expect(reader(page).getByRole("heading", { name: "Cara" })).toBeVisible();
    const line = page.getByRole("status").filter({ hasText: "Marked done." });
    await line.getByRole("button", { name: "Undo" }).click();
    await expect(rows(page)).toHaveText([/What is the price/, /I would like two of them/, /For 50 euros/, /Great post/, /Where is the shop/]);
    await expect.poll(() => query(page).get("item")).toBe("b4");
    expect(state.patches).toEqual([
      { id: "b4", body: { state: "done", conversation: true } },
      { id: "b4", body: { state: "open", conversation: true } },
    ]);
    await expect(line).toHaveCount(0);

    // Assign covers the conversation too.
    await reader(page).getByRole("button", { name: "Assign to me" }).click();
    await expect(reader(page).getByRole("status").filter({ hasText: "Assigned to Me." })).toBeVisible();
    expect(state.patches.at(-1)).toEqual({ id: "b4", body: { assigned_to: "u-me", conversation: true } });

    // brain refuses: the row comes back with a message.
    state.failPatch = 500;
    await reader(page).getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "couldn't be marked done, so it is back in the list" })).toBeVisible();
    await expect(rows(page)).toHaveCount(5);
    await expect(rows(page).nth(1)).toContainText("I would like two of them");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "marked done" })).toHaveCount(0);
  });

  test("the Undo line goes after five seconds", async ({ page }) => {
    await page.clock.install({ time: new Date(NOW) });
    await brain(page, "owner", { items: mixed() });
    await page.goto("/inbox?item=m1");
    await reader(page).getByRole("button", { name: "Mark done" }).click();
    const line = page.getByRole("status").filter({ hasText: "Marked done." });
    await expect(line).toBeVisible();
    await page.clock.runFor(4_000);
    await expect(line).toBeVisible();
    await page.clock.runFor(1_500);
    await expect(line).toHaveCount(0);
  });

  test("J, K, E, R, A, / and ? work, and never while typing", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    await page.goto("/inbox");
    await expect(rows(page)).toHaveCount(5);
    await expect(reader(page)).toContainText("move between items");
    const item = () => query(page).get("item");
    await page.keyboard.press("j");
    await expect.poll(item).toBe("m1");
    await page.keyboard.press("j");
    await expect.poll(item).toBe("b4");
    await expect(rows(page).nth(1).getByRole("link")).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("j");
    await expect.poll(item).toBe("k2");
    await page.keyboard.press("k");
    await expect.poll(item).toBe("b4");
    // A modifier key leaves the shortcut alone.
    await page.keyboard.press("Control+j");
    await page.keyboard.press("Alt+k");
    await expect(bubbles(page).last()).toContainText("I would like two of them.");
    expect(item()).toBe("b4");

    await page.keyboard.press("a");
    await expect(reader(page).getByRole("status").filter({ hasText: "Assigned to Me." })).toBeVisible();
    expect(state.patches).toEqual([{ id: "b4", body: { assigned_to: "u-me", conversation: true } }]);

    // R goes to the reply box, where the same keys are just letters.
    const box = reader(page).getByLabel("Send DM");
    await page.keyboard.press("r");
    await expect(box).toBeFocused();
    await page.keyboard.type("jkera/?");
    await expect(box).toHaveValue("jkera/?");
    expect(item()).toBe("b4");
    expect(state.patches).toHaveLength(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await box.fill("");

    // / goes to the search box, the same there.
    await reader(page).getByRole("heading", { name: "Bob" }).focus();
    await page.keyboard.press("/");
    const search = page.getByRole("searchbox", { name: "Search All" });
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await page.keyboard.type("e?");
    await expect(search).toHaveValue("e?");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(state.patches).toHaveLength(1);
    await search.fill("");
    await expect(rows(page)).toHaveCount(5);

    // E marks the open one done and opens the next.
    await reader(page).getByRole("heading", { name: "Bob" }).focus();
    await page.keyboard.press("e");
    await expect(rows(page)).toHaveCount(4);
    await expect.poll(item).toBe("k2");
    expect(state.patches.at(-1)).toEqual({ id: "b4", body: { state: "done", conversation: true } });
    await expect(reader(page).getByRole("heading", { name: "Cara" })).toBeFocused();

    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toContainText("Mark done and open the next one");
    // Open, the dialog holds the keys.
    await page.keyboard.press("j");
    expect(item()).toBe("k2");
    await help.getByRole("button", { name: "Close" }).click();
    await expect(help).toHaveCount(0);
  });

  test("the filter menus keep the address, and set filters show as chips to remove", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    await page.goto("/inbox?q=price&tag=vip&item=m1");
    const chips = page.getByRole("list", { name: "Active filters" });
    await expect(chips.getByRole("listitem")).toHaveText(["Tag: vip"]);
    await page.getByRole("combobox", { name: "Assigned" }).selectOption({ label: "Me" });
    await expect.poll(() => query(page).get("assigned")).toBe("me");
    expect(Object.fromEntries(query(page))).toEqual({ item: "m1", q: "price", assigned: "me", tag: "vip" });
    await expect(chips.getByRole("listitem")).toHaveText(["Assigned: Me", "Tag: vip"]);
    await expect.poll(() => state.asked.at(-1)?.get("assigned")).toBe("me");

    await page.getByRole("combobox", { name: "Kind" }).selectOption({ label: "Comments" });
    await expect(chips.getByRole("listitem")).toHaveText(["Comments", "Assigned: Me", "Tag: vip"]);
    await expect.poll(() => state.asked.at(-1)?.get("kind")).toBe("comment");
    expect(Object.fromEntries(state.asked.at(-1)!)).toEqual({ state: "open", group: "conversations", kind: "comment", q: "price", assigned: "me", tag: "vip" });
    expect(Object.fromEntries(query(page))).toEqual({ item: "m1", q: "price", assigned: "me", tag: "vip" });

    // Done keeps them too.
    await page.getByRole("link", { name: "Done", exact: true }).click();
    await expect.poll(() => query(page).get("state")).toBe("done");
    expect(Object.fromEntries(query(page))).toEqual({ state: "done", item: "m1", q: "price", assigned: "me", tag: "vip" });

    await chips.getByRole("button", { name: "Clear the kind filter" }).click();
    await expect(page.getByRole("combobox", { name: "Kind" })).toHaveValue("all");
    await chips.getByRole("link", { name: "Clear the assigned filter" }).click();
    await expect.poll(() => query(page).get("assigned")).toBeNull();
    await expect(page.getByRole("combobox", { name: "Assigned" })).toHaveValue("");
    await chips.getByRole("link", { name: "Clear the tag filter vip" }).click();
    await expect(chips).toHaveCount(0);
    expect(Object.fromEntries(query(page))).toEqual({ state: "done", item: "m1", q: "price" });
  });

  test("a comment still opens in the thread reader and answers for itself", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    await page.goto("/inbox");
    await rows(page).first().getByRole("link").click();
    const thread = reader(page).getByRole("list", { name: "Thread" });
    await expect(thread.getByRole("listitem")).toHaveText([/What is the price\?/]);
    await expect(chat(page)).toHaveCount(0);
    await expect(reader(page)).toContainText("Comment to Alice");
    await reader(page).getByLabel("Reply publicly").fill("Ten euros.");
    await reader(page).getByRole("button", { name: "Reply publicly" }).click();
    await expect(reader(page).getByText("Reply sent.")).toBeFocused();
    await expect(thread.getByRole("listitem")).toHaveText([/What is the price\?/, /Ten euros\..*Team, public reply/]);
    expect(state.replies).toEqual([{ id: "m1", body: { text: "Ten euros." } }]);
    expect(state.convos).toEqual([]);
  });

  // What brain does when it sends: the reply is on the item and the conversation is done.
  const delivered = (state: Awaited<ReturnType<typeof brain>>, id: string, text: string) => {
    const to = state.items.find((i) => i.id === id)!;
    to.replied_at = NOW;
    to.replies = [...to.replies, { id: `late-${id}`, kind: "dm", text, remote_id: null, remote_url: null, sent_by: "u-me", automation_id: null, created_at: NOW }];
    for (const i of state.items) if (i.kind === "dm" && i.author.id === to.author.id) i.state = "done";
  };

  test("a reply with no clear answer is never retried blindly: the conversation is read again, and Send again asks first", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    // brain answers 500 each time; the first time it had sent the DM before failing.
    let mode: "sent" | "lost" | "ok" = "sent";
    const tries: string[] = [];
    await page.route(/\/v1\/inbox-items\/[^/]+\/reply$/, (route) => {
      const id = new URL(route.request().url()).pathname.split("/")[3]!;
      tries.push(id);
      if (mode === "ok") return route.fallback();
      if (mode === "sent") delivered(state, id, route.request().postDataJSON().text);
      return route.fulfill({ status: 500, json: { error: "server_error" } });
    });
    await page.goto("/inbox?item=b4");
    await expect(bubbles(page).last()).toContainText("I would like two of them.");
    await reader(page).getByLabel("Send DM").fill("Two it is!");
    await reader(page).getByRole("button", { name: "Send DM" }).click();
    // Read again, the conversation holds the reply: it shows as sent, with nothing to send again.
    await expect(bubbles(page).last()).toContainText("Two it is!");
    await expect(bubbles(page).last()).toContainText("Team, DM");
    await expect(chat(page).getByText("Two it is!")).toHaveCount(1);
    await expect(reader(page).getByRole("button", { name: /Send again|Retry/ })).toHaveCount(0);
    await expect(reader(page).getByRole("alert")).toHaveCount(0);
    expect(tries).toEqual(["b4"]);
    expect(state.convos.filter((c) => c.id === "b4" && !c.before).length).toBeGreaterThan(1);

    // The same failure with nothing sent: it may have gone out, so no plain Retry.
    mode = "lost";
    await rows(page).filter({ hasText: "Cara" }).getByRole("link").click();
    await expect(bubbles(page).last()).toContainText("For 50 euros.");
    await reader(page).getByLabel("Send DM").fill("Yes we do");
    await reader(page).getByRole("button", { name: "Send DM" }).click();
    const stuck = bubbles(page).last();
    await expect(stuck.getByRole("alert")).toHaveText("This may have been sent. Check the conversation before sending again.");
    await expect(stuck).toContainText("Yes we do");
    await expect(stuck.getByRole("button", { name: "Retry" })).toHaveCount(0);
    expect(state.convos.filter((c) => c.id === "k2" && !c.before).length).toBeGreaterThan(1);
    expect(tries).toEqual(["b4", "k2"]);

    // Send again asks first, and Cancel sends nothing.
    await stuck.getByRole("button", { name: "Send again" }).click();
    await expect(stuck).toContainText("It may have been sent already. Send again?");
    await stuck.getByRole("button", { name: "Cancel" }).click();
    await expect(stuck).not.toContainText("Send again?");
    expect(tries).toEqual(["b4", "k2"]);
    mode = "ok";
    await stuck.getByRole("button", { name: "Send again" }).click();
    expect(tries).toEqual(["b4", "k2"]);
    await stuck.getByRole("button", { name: "Yes, send again" }).click();
    await expect(chat(page).getByRole("alert")).toHaveCount(0);
    await expect(bubbles(page).last()).toContainText("Yes we do");
    await expect(bubbles(page).last()).toContainText("Team, DM");
    await expect(chat(page).getByText("Yes we do")).toHaveCount(1);
    expect(tries).toEqual(["b4", "k2", "k2"]);
  });

  test("a reply on its way or not sent stays with its conversation while another item is open", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    // Bob refuses DMs; the DM to Cara waits until the test lets it through.
    let release = () => {};
    const held = new Promise<void>((done) => (release = done));
    await page.route(/\/v1\/inbox-items\/[^/]+\/reply$/, async (route) => {
      if (route.request().url().includes("/b4/")) return route.fulfill({ status: 422, json: { error: "dm_not_allowed", message: "Not taken." } });
      await held;
      return route.fallback();
    });
    await page.goto("/inbox?item=b4");
    await expect(bubbles(page).last()).toContainText("I would like two of them.");
    await reader(page).getByLabel("Send DM").fill("Two it is!");
    await reader(page).getByRole("button", { name: "Send DM" }).click();
    await expect(bubbles(page).last().getByRole("alert")).toContainText("Not sent.");
    const lines = page.getByRole("region", { name: "All" }).getByRole("alert");
    // Open, it needs no line in the list.
    await expect(lines).toHaveCount(0);

    await rows(page).filter({ hasText: "Cara" }).getByRole("link").click();
    await expect(bubbles(page).last()).toContainText("For 50 euros.");
    await expect(chat(page)).not.toContainText("Two it is!");
    await expect(lines).toHaveText(["A reply to Bob was not sent"]);
    await reader(page).getByLabel("Send DM").fill("Yes we do");
    await reader(page).getByRole("button", { name: "Send DM" }).click();
    await expect(bubbles(page).last()).toContainText("Sending...");

    // Back at Bob through the line: the failed reply is still there, with its Retry.
    await lines.getByRole("button", { name: "A reply to Bob was not sent" }).click();
    await expect.poll(() => query(page).get("item")).toBe("b4");
    await expect(bubbles(page).last()).toContainText("Two it is!");
    await expect(bubbles(page).last().getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(lines).toHaveCount(0);

    // And at Cara the one on its way still shows, then lands.
    await rows(page).filter({ hasText: "Cara" }).getByRole("link").click();
    await expect(bubbles(page).last()).toContainText("Yes we do");
    await expect(bubbles(page).last()).toContainText("Sending...");
    release();
    await expect(chat(page).getByText("Sending...")).toHaveCount(0);
    await expect(bubbles(page).last()).toContainText("Yes we do");
    await expect(bubbles(page).last()).toContainText("Team, DM");
    expect(state.replies).toEqual([{ id: "k2", body: { text: "Yes we do", conversation: true } }]);
    await expect(lines).toHaveText(["A reply to Bob was not sent"]);
  });

  test("a held E marks one item done, and each done keeps its own Undo", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    const done = () => state.patches.filter((p) => p.body.state === "done").map((p) => p.id);
    await page.goto("/inbox?item=b4");
    await expect(bubbles(page).last()).toContainText("I would like two of them.");
    await reader(page).getByRole("heading", { name: "Bob" }).focus();
    // The key held down: one press and its repeats.
    await page.keyboard.down("e");
    await page.keyboard.down("e");
    await page.keyboard.down("e");
    await page.keyboard.up("e");
    await expect(rows(page)).toHaveCount(4);
    await expect(reader(page).getByRole("heading", { name: "Cara" })).toBeFocused();
    // The keys after it were handled too, and marked nothing.
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    expect(done()).toEqual(["b4"]);

    // A second done right after: two lines, each with its own Undo.
    await reader(page).getByRole("heading", { name: "Cara" }).focus();
    await page.keyboard.press("e");
    await expect(rows(page)).toHaveText([/What is the price/, /Great post/, /Where is the shop/]);
    expect(done()).toEqual(["b4", "k2"]);
    const lines = page.getByRole("status").filter({ hasText: "Marked done." });
    await expect(lines).toHaveText([/Bob/, /Cara/]);
    await page.getByRole("button", { name: "Undo marking Bob done" }).click();
    await expect(rows(page)).toHaveText([/What is the price/, /I would like two of them/, /Great post/, /Where is the shop/]);
    await page.getByRole("button", { name: "Undo marking Cara done" }).click();
    await expect(rows(page)).toHaveText([/What is the price/, /I would like two of them/, /For 50 euros/, /Great post/, /Where is the shop/]);
    expect(state.patches.filter((p) => p.body.state === "open").map((p) => p.id).sort()).toEqual(["b4", "k2"]);
    await expect(lines).toHaveCount(0);
  });

  test("Undo never doubles a conversation that a newer DM already brought back", async ({ page }) => {
    const state = await brain(page, "owner", { items: mixed() });
    await page.goto("/inbox?item=b4");
    await expect(bubbles(page).last()).toContainText("I would like two of them.");
    await reader(page).getByRole("button", { name: "Mark done" }).click();
    await expect(rows(page)).toHaveCount(4);
    await expect.poll(() => state.patches.length).toBe(1);
    // Bob writes again, and the list's check picks his conversation up under its new latest DM.
    state.items.push(item("b5", "dm", "One more thing.", { received_at: NOW }));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(rows(page).first()).toContainText("One more thing.");
    await expect(rows(page)).toHaveCount(5);
    await page.getByRole("button", { name: "Undo marking Bob done" }).click();
    await expect.poll(() => state.patches.length).toBe(2);
    await expect.poll(() => query(page).get("item")).toBe("b4");
    await expect(bubbles(page).last()).toContainText("One more thing.");
    await expect(rows(page).filter({ hasText: "messages" }).filter({ hasText: "Bob" })).toHaveCount(1);
    await expect(rows(page)).toHaveCount(5);
  });

  test("a conversation that can't be loaded says so with Retry, and Load earlier is there once it loads", async ({ page }) => {
    await brain(page, "owner", { items: mixed(), convoPage: 2 });
    let down = true;
    await page.route(/\/v1\/inbox-items\/[^/]+\/conversation(\?.*)?$/, (route) => (down ? route.fulfill({ status: 500, json: { error: "server_error" } }) : route.fallback()));
    await page.goto("/inbox?item=b4");
    await expect(chat(page).getByRole("alert")).toContainText("The conversation couldn't be loaded.");
    await expect(bubbles(page)).toHaveCount(0);
    await expect(chat(page).getByRole("button", { name: "Load earlier" })).toHaveCount(0);
    down = false;
    await chat(page).getByRole("button", { name: "Retry" }).click();
    await expect(bubbles(page)).toHaveText(["Today", /Still there\?/, /I would like two of them\./]);
    await expect(chat(page).getByRole("alert")).toHaveCount(0);
    await expect(chat(page).getByRole("button", { name: "Load earlier" })).toBeVisible();
  });
});

test("the switcher puts All inboxes first, one custom inbox puts no chips on rows, and [ and ] move between inboxes", async ({ page }) => {
  await brain(page, "owner", {
    accounts: [alice, fbPage],
    items: [item("p1", "comment", "What is the price?", { inbox_ids: ["i2"] }), item("p2", "mention", "Hello", { received_at: ago(90), inbox_ids: [] })],
  });
  await page.goto("/inbox");
  const nav = page.getByRole("navigation", { name: "Inboxes" });
  const entries = nav.getByRole("listitem");
  await expect(entries.first()).toContainText("All inboxes");
  await expect(entries.first().getByText("2 open in All inboxes")).toBeAttached();
  await expect(entries.nth(1).getByText("1 open in Questions")).toBeAttached();
  // The inbox shows its accounts' avatars; the Page is in no inbox, and says so.
  await expect(entries.nth(1).getByRole("link").locator("[aria-hidden=true] > span")).toHaveCount(1);
  await expect(nav.getByText("1 account is in no inbox, so its messages show only in All inboxes.")).toBeVisible();
  const rows = page.getByRole("region", { name: "All inboxes" }).getByRole("list", { name: "Items" }).getByRole("listitem");
  // With one custom inbox every row would carry the same chip, so none does.
  await expect(rows.first()).toContainText("What is the price?");
  await expect(rows.first()).not.toContainText("Questions");
  await page.keyboard.press("]");
  await expect(page).toHaveURL("/t/acme22/inbox/i2");
  await expect(page.getByRole("region", { name: "Questions" }).getByRole("listitem").first()).not.toContainText("Questions");
  await page.keyboard.press("]");
  await expect(page).toHaveURL("/t/acme22/inbox/all");
  await expect(page.getByRole("heading", { name: "All inboxes", level: 2 })).toBeVisible();
  await page.keyboard.press("[");
  await expect(page).toHaveURL("/t/acme22/inbox/i2");
  // J still moves through the items.
  await page.keyboard.press("j");
  await expect(page).toHaveURL(/item=p1/);
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toContainText("Next inbox");
  await page.keyboard.press("Escape");
  // In the reply box [ and ] are text, not inbox moves.
  const reply = page.getByRole("region", { name: "Item" }).getByLabel("Reply publicly");
  await reply.click();
  await page.keyboard.type("[a]");
  await expect(reply).toHaveValue("[a]");
  await expect(page).toHaveURL(/\/inbox\/i2\?item=p1/);
});

test("with two custom inboxes, rows in All inboxes carry the chips of the inboxes that hold them", async ({ page }) => {
  await brain(page, "owner", {
    inboxes: [inbox("all", "All"), inbox("i2", "Questions"), inbox("i3", "Sales")],
    items: [item("p1", "comment", "What is the price?", { inbox_ids: ["i2", "i3"] }), item("p2", "mention", "Hello", { received_at: ago(90), inbox_ids: [] })],
  });
  await page.goto("/inbox");
  const rows = page.getByRole("region", { name: "All inboxes" }).getByRole("list", { name: "Items" }).getByRole("listitem");
  await expect(rows.first()).toContainText("Questions");
  await expect(rows.first()).toContainText("Sales");
  await expect(rows.nth(1)).not.toContainText("Questions");
  await expect(rows.nth(1)).not.toContainText("Sales");
  // Inside one inbox there are no chips.
  await page.goto("/inbox/i2");
  await expect(page.getByRole("region", { name: "Questions" }).getByRole("list", { name: "Items" }).getByRole("listitem").first()).not.toContainText("Sales");
});

test("photos and stickers show as thumbnails linking to the original, and a label when there is no text or the link expired", async ({ page }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.route("https://scontent.xx.fbcdn.net/**", (route) =>
    route.request().url().includes("gone") ? route.fulfill({ status: 403, body: "URL signature expired" }) : route.fulfill({ contentType: "image/png", body: png }),
  );
  const sticker = { kind: "sticker", url: "https://scontent.xx.fbcdn.net/s.png", preview_url: "https://scontent.xx.fbcdn.net/s.png" };
  const expired = { kind: "image", url: "https://scontent.xx.fbcdn.net/gone.jpg" };
  await brain(page, "owner", {
    items: [
      item("p1", "comment", "", { attachments: [sticker] }),
      item("p2", "comment", "Look at this", { received_at: ago(60), attachments: [expired] }),
      item("p3", "comment", "", { received_at: ago(90) }),
    ],
  });
  await page.goto("/inbox");
  const rows = page.getByRole("list", { name: "Items" }).getByRole("listitem");
  await expect(rows.first()).toContainText("Sticker");
  await expect(rows.first()).not.toContainText("(no text)");
  await expect(rows.nth(1)).toContainText("Look at this");
  await expect(rows.nth(2)).toContainText("(no text)");

  await rows.first().getByRole("link").click();
  const shown = page.getByRole("region", { name: "Item" }).getByRole("list", { name: "Attachments" });
  const img = shown.getByRole("img", { name: "Sticker" });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("loading", "lazy");
  await expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(shown.getByRole("link")).toHaveAttribute("href", sticker.url);
  await expect(page.getByRole("region", { name: "Item" }).getByText("(no text)")).toHaveCount(0);

  // An expired Meta link falls back to the kind's label, still linking to it.
  await rows.nth(1).getByRole("link").click();
  const link = page.getByRole("region", { name: "Item" }).getByRole("list", { name: "Attachments" }).getByRole("link");
  await expect(link).toContainText("Photo");
  await expect(link.getByRole("img")).toHaveCount(0);
  await expect(link).toHaveAttribute("href", expired.url);
});

test("a new inbox opened before the accounts load ticks them once they arrive", async ({ page }) => {
  await brain(page, "owner");
  let release = () => {};
  const loaded = new Promise<void>((r) => (release = r));
  await page.route("**/v1/connections", async (route) => {
    await loaded;
    await route.fulfill({ json: [alice] });
  });
  await page.goto("/inbox");
  await page.getByRole("button", { name: "New inbox" }).click();
  const dialog = page.getByRole("dialog", { name: "New inbox" });
  await expect(dialog.getByText("No account with an inbox is connected yet.")).toBeVisible();
  release();
  await expect(dialog.getByRole("checkbox", { name: "Alice, Bluesky" })).toBeChecked();
});

test("empty states: no inboxes, an inbox without accounts, and the plan's inbox limit", async ({ page }) => {
  await brain(page, "owner", { inboxes: [inbox("all", "All")] });
  await page.goto("/inbox");
  await expect(page.getByText("No inboxes yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "New inbox" })).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await brain(page, "owner", { items: [], inboxes: [inbox("all", "All"), inbox("i2", "Empty", { account_ids: [] })] });
  await page.route(/\/v1\/team\/billing$/, (route) =>
    route.fulfill({
      json: {
        enabled: true,
        plan: { id: "scheduler", name: "Scheduler", status: "active", trial_ends_at: null, current_period_end: null, cancel_at_period_end: false },
        limits: { accounts: 10, members: 3, automation: false, contacts: null, inboxes: 1 },
        usage: { accounts: 1, members: 1, inboxes: 1 },
      },
    }),
  );
  await page.goto("/inbox/i2");
  await expect(page.getByText("This inbox has no accounts. Edit it to add some.")).toBeVisible();
  await expect(page.getByText("Your plan's inbox limit is reached.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/t/acme22/billing");
  await expect(page.getByRole("button", { name: "New inbox" })).toHaveCount(0);
});

test("a create past the plan says so with an Upgrade link", async ({ page }) => {
  await brain(page, "owner");
  await page.route("**/v1/inboxes", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 402, json: { error: "plan_limit", limit: "inboxes" } }) : route.fallback(),
  );
  await page.goto("/inbox");
  await page.getByRole("button", { name: "New inbox" }).click();
  const dialog = page.getByRole("dialog", { name: "New inbox" });
  await dialog.getByLabel("Name").fill("Sales");
  await dialog.getByRole("button", { name: "Create inbox" }).click();
  await expect(dialog.getByText("Your plan's inbox limit is reached.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Upgrade" })).toBeVisible();
});
