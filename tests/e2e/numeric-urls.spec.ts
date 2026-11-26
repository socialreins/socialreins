import { expect, test, type Page } from "@playwright/test";

const team = { id: "t1", name: "Acme", code: "acme22", role: "owner", public_pages: true, newsletter: true, newsletter_sender: { name: "Acme", address: "1 Mill Lane" } };
const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: team };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const alice = { id: "c1", provider: "bluesky", external_id: "did:plc:alice", handle: "alice.bsky.social", display_name: "Alice", avatar_url: null, token_expires_at: null, set_ids: ["d"], dm_access: true, created_at: "2026-10-20T10:00:00Z" };
const UUID = (n: number) => `01a2111a-7943-70e9-85db-${String(n).padStart(12, "0")}`;
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const when = { created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" };

// Serves one thing under both its UUID and its number, as brain does.
async function serve(page: Page, kind: string, thing: { id: string; number: number }, body: unknown = thing) {
  for (const key of [thing.id, String(thing.number)]) await page.route(new RegExp(`/v1/${kind}/${key}$`), (route) => route.fulfill({ json: body }));
}

async function brain(page: Page) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [team] }));
  await page.route("**/v1/team", (route) => route.fulfill({ json: team }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [alice] }));
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/contact-tags", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/billing", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
}

test("a list's address is its number, and an old address with the UUID moves to it", async ({ page }) => {
  await brain(page);
  const list = { id: UUID(1), number: 12, social_set_id: null, name: "Series", remote_ids: {}, ...when };
  await page.route(/\/v1\/lists$/, (route) => route.fulfill({ json: [list] }));
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await serve(page, "lists", list, { ...list, items: [] });
  await page.goto("/lists");
  await expect(page.getByRole("link", { name: /Series/ })).toHaveAttribute("href", "/t/acme22/lists/12");
  await page.goto(`/t/acme22/lists/${list.id}`);
  await expect(page.getByRole("heading", { name: "Series" }).first()).toBeVisible();
  await expect(page).toHaveURL("/t/acme22/lists/12");
});

test("an automation's address is its number, keeps its query when it moves, and a run links to its item's number", async ({ page }) => {
  await brain(page);
  const a = {
    id: UUID(2),
    number: 7,
    name: "Price answers",
    active: true,
    activated_at: "2026-10-28T10:00:00Z",
    trigger: "comment_received",
    conditions: { social_set_id: null, account_ids: [], post_remote_ids: [], keywords: ["price"], first_per_author: false },
    actions: [{ type: "send_dm", text: "Hi {name}" }],
    fallback_public_reply: null,
    steps: null,
    created_by: "u-me",
    runs: { sent: 0, skipped: 0, failed: 1, running: 0, total: 1, count: 1, last_at: ago(5) },
    ...when,
  };
  const run = { id: UUID(20), automation_id: a.id, inbox_item_id: UUID(21), inbox_item_number: 4821, status: "failed", reason: "internal", results: [], step_index: null, resume_at: null, retries: 0, can_retry: false, created_at: ago(5), updated_at: ago(5) };
  await page.route(/\/v1\/automations$/, (route) => route.fulfill({ json: [a] }));
  await serve(page, "automations", a);
  await page.route(/\/v1\/automations\/[^/]+\/runs(\?.*)?$/, (route) => route.fulfill({ json: { runs: [run], next_cursor: null } }));
  await page.route(/\/v1\/automations\/[^/]+\/misses$/, (route) => route.fulfill({ json: { misses: [] } }));
  await page.route(/\/v1\/inbox-items\/[^/]+$/, (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/automations");
  await expect(page.getByRole("link", { name: "Price answers" })).toHaveAttribute("href", "/t/acme22/automations/7");
  await page.goto(`/t/acme22/automations/${a.id}?runs=failed`);
  await expect(page.getByRole("link", { name: /Open in inbox/ })).toHaveAttribute("href", "/t/acme22/inbox?item=4821");
  await expect(page).toHaveURL("/t/acme22/automations/7?runs=failed");
});

test("a broadcast and a newsletter have numbers in their addresses too", async ({ page }) => {
  await brain(page);
  const counts = { total: 0, sent: 0, skipped: 0, failed: 0, pending: 0 };
  const b = { id: UUID(3), number: 5, name: "Spring offer", text: "Hi {name}", tag: "vip", platform: null, status: "draft", pause_reason: null, counts, created_by: "u-me", created_at: ago(120), started_at: null, finished_at: null };
  const n = { id: UUID(4), number: 9, subject: "Spring menu", body: "Hello", status: "draft", pause_reason: null, tested_at: null, counts: { total: 0, sent: 0, failed: 0, pending: 0 }, created_by: "u-me", created_at: ago(120), started_at: null, finished_at: null };
  await page.route(/\/v1\/broadcasts$/, (route) => route.fulfill({ json: [b] }));
  await page.route(/\/v1\/newsletters$/, (route) => route.fulfill({ json: [n] }));
  await page.route("**/v1/subscribers", (route) => route.fulfill({ json: { subscribers: [] } }));
  await serve(page, "broadcasts", b);
  await serve(page, "newsletters", n);
  await page.goto("/broadcasts");
  await expect(page.getByRole("link", { name: /Spring offer/ })).toHaveAttribute("href", "/t/acme22/broadcasts/5");
  await page.goto(`/t/acme22/broadcasts/${b.id}?edit=1`);
  await expect(page).toHaveURL("/t/acme22/broadcasts/5?edit=1");
  await page.goto("/newsletters");
  await expect(page.getByRole("link", { name: /Spring menu/ })).toHaveAttribute("href", "/t/acme22/newsletters/9");
  await page.goto(`/t/acme22/newsletters/${n.id}`);
  await expect(page).toHaveURL("/t/acme22/newsletters/9");
});

test("the inbox, its items and their contacts go by number; old addresses move to it", async ({ page }) => {
  await brain(page);
  const box = { id: UUID(5), number: 3, name: "All", is_all: true, account_ids: [], filters: { account_ids: [], kinds: [], platforms: [], keywords: [], unanswered: false }, open_count: 1, ...when };
  const contact = { id: UUID(6), number: 33, platform: "bluesky", external_id: "did:plc:bob", handle: "bob.bsky.social", display_name: "Bob", avatar_url: null, tags: [], notes: null, opted_out: false, first_seen_at: "2026-10-01T10:00:00Z", last_seen_at: ago(30), items_count: 1 };
  const item = {
    id: UUID(7),
    number: 4821,
    social_account_id: "c1",
    platform: "bluesky",
    kind: "comment",
    remote_id: "at://did:plc:bob/app.bsky.feed.post/x1",
    remote_url: null,
    parent_remote_id: null,
    root_remote_id: null,
    convo_id: null,
    post_id: null,
    author: { id: "did:plc:bob", handle: "bob.bsky.social", name: "Bob", avatar_url: null },
    text: "What is the price?",
    received_at: ago(5),
    state: "open",
    replied_at: null,
    replies: [],
    contact_id: contact.id,
    contact_number: contact.number,
    contact_tags: [],
    assigned_to: null,
  };
  await page.route("**/v1/inboxes", (route) => route.fulfill({ json: [box] }));
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => route.fulfill({ json: { items: [item], next_cursor: null } }));
  await serve(page, "inbox-items", item);
  await page.route(/\/v1\/inbox-items\/[^/]+\/automations$/, (route) => route.fulfill({ json: { automations: [] } }));
  await page.route(/\/v1\/inbox-items\/[^/]+\/actions$/, (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.route(/\/v1\/contacts(\?.*)?$/, (route) => route.fulfill({ json: { items: [contact], next_cursor: null } }));
  await serve(page, "contacts", contact, { ...contact, recent: [item] });

  const reads: string[] = [];
  page.on("request", (r) => /\/v1\/inbox-items\/[^/]+$/.test(new URL(r.url()).pathname) && reads.push(r.url()));
  // The inbox and the item named by their UUIDs move to their numbers.
  await page.goto(`/t/acme22/inbox/${box.id}?item=${item.id}`);
  await expect(page.getByRole("region", { name: "Item" }).getByText("What is the price?")).toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe("/t/acme22/inbox/3?item=4821");
  // The move to the number does not read the item a second time.
  expect(reads).toHaveLength(1);
  // What it links to carries numbers: the other items and the contact.
  await expect(page.getByRole("list", { name: /Inbox|items/i }).first().getByRole("link").first()).toHaveAttribute("href", /\/t\/acme22\/inbox\/3\?item=4821$/);
  await expect(page.getByRole("link", { name: "Open contact" })).toHaveAttribute("href", "/t/acme22/contacts?contact=33");

  // A contact named by its UUID moves to its number, and its row and conversations link by number.
  await page.goto(`/t/acme22/contacts?contact=${contact.id}`);
  await expect(page.getByRole("region", { name: "Contact", exact: true }).getByRole("heading", { name: "Bob" })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("contact")).toBe("33");
  await expect(page.getByRole("list", { name: "Contact list" }).getByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/t/acme22/contacts?contact=33");
  await expect(page.getByRole("list", { name: "Recent conversations" }).getByRole("link")).toHaveAttribute("href", "/t/acme22/inbox?item=4821");
});

test("an inbox number brain does not know says so instead of loading for ever", async ({ page }) => {
  await brain(page);
  const box = { id: UUID(5), number: 3, name: "All", is_all: true, account_ids: [], filters: { account_ids: [], kinds: [], platforms: [], keywords: [], unanswered: false }, open_count: 0, ...when };
  await page.route("**/v1/inboxes", (route) => route.fulfill({ json: [box] }));
  await page.route(/\/v1\/inboxes\/99\/items/, (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/t/acme22/inbox/99");
  await expect(page.getByRole("alert").first()).toBeVisible();
});
