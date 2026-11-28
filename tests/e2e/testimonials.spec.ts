import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const account = { id: "bsky1", provider: "bluesky", external_id: "bsky1", handle: "alice", display_name: "Alice", avatar_url: null, token_expires_at: null, set_ids: ["sA"], dm_access: true, created_at: "2026-10-20T10:00:00Z" };
const sets = [{ id: "sA", name: "Acme", is_default: true, account_ids: ["bsky1"], account_count: 1, created_at: "", deleted_at: null }];
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const item = (id: string, kind: string, text: string, minutes: number) => ({
  id,
  number: Number(id.replace(/\D/g, "")) || 1,
  social_account_id: "bsky1",
  platform: "bluesky",
  kind,
  remote_id: `at://did:plc:x/app.bsky.feed.post/${id}`,
  remote_url: `https://example.test/${id}`,
  parent_remote_id: null,
  root_remote_id: null,
  convo_id: null,
  post_id: null,
  author: { id: `a-${id}`, handle: "fan.test", name: "Fan Test", avatar_url: null },
  text,
  received_at: ago(minutes),
  state: "open",
  replied_at: null,
  replies: [],
  assigned_to: null,
  contact_tags: [],
  ai_draft: null,
  conversation: null,
});
type Row = ReturnType<typeof item>;
type Testimonial = {
  id: string;
  inbox_item_id: string | null;
  contact_id: string | null;
  text: string;
  author_name: string | null;
  author_handle: string | null;
  platform: string | null;
  source_url: string | null;
  permission: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
const testimonial = (id: string, over: Partial<Testimonial> = {}): Testimonial => ({
  id,
  inbox_item_id: "c1",
  contact_id: null,
  text: "Best shop I know",
  author_name: "Fan Test",
  author_handle: "fan.test",
  platform: "bluesky",
  source_url: "https://example.test/c1",
  permission: "not_asked",
  note: null,
  created_by: "u-me",
  created_at: "2026-11-28T10:00:00Z",
  updated_at: "2026-11-28T10:00:00Z",
  ...over,
});

// A small in-memory brain: one comment, one mention and one DM, the Comments list and the
// testimonials made from them.
async function brain(page: Page, start: Testimonial[] = []) {
  const state = { rows: [item("c1", "comment", "Love this post", 5), item("c2", "comment", "Where is my refund?", 10), item("m1", "mention", "Thanks @alice for the tip", 25), item("d1", "dm", "Hi, can we talk?", 30)] as Row[], testimonials: start as Testimonial[], patched: [] as unknown[], added: [] as unknown[] };
  const quiet = (i: Row) => ["follow", "like", "repost"].includes(i.kind);
  const matching = (q: URLSearchParams) => {
    const kind = q.get("kind");
    return (i: Row) =>
      (kind === "comments" ? ["comment", "mention"].includes(i.kind) : kind ? i.kind === kind : !quiet(i)) && (!q.get("q") || i.text.toLowerCase().includes(q.get("q")!.toLowerCase()));
  };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route(/\/v1\/queues\/[^/]+$/, (route) => route.fulfill({ json: { time_zone: "Europe/Berlin", slots: [], updated_at: "" } }));
  await page.route(/\/v1\/inbox-items\/[^/]+\/automations$/, (route) => route.fulfill({ json: { automations: [] } }));
  await page.route(/\/v1\/inbox-items\/[^/]+\/(thread|actions)$/, (route) => route.fulfill({ status: 422, json: { error: "not_a_thread" } }));
  await page.route("**/v1/views?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/inboxes", (route) =>
    route.fulfill({ json: [{ id: "all", number: 1, name: "All", is_all: true, account_ids: [], filters: { kinds: [], keywords: [], unanswered: false }, created_at: "", updated_at: "", open_count: 3, open_dm_count: 1, open_comment_count: 2 }] }),
  );
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    const match = matching(q);
    const rows = state.rows.filter((i) => match(i) && i.state === q.get("state"));
    return route.fulfill({ json: { items: rows.sort((a, b) => b.received_at.localeCompare(a.received_at)), next_cursor: null } });
  });
  await page.route(/\/v1\/inboxes\/[^/]+\/count/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { count: state.rows.filter((i) => matching(q)(i) && i.state === q.get("state")).length } });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3]!;
    const found = state.rows.find((i) => i.id === id);
    return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.route(/\/v1\/testimonials(\?.*)?$/, (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { items: state.testimonials, next_cursor: null } });
    const body = route.request().postDataJSON();
    state.added.push(body);
    const row = state.rows.find((i) => i.id === body.inbox_item_id);
    if (!row) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (row.kind !== "comment" && row.kind !== "mention") return route.fulfill({ status: 422, json: { error: "not_a_comment" } });
    if (state.testimonials.some((t) => t.inbox_item_id === row.id)) return route.fulfill({ status: 409, json: { error: "already_testimonial" } });
    const made = testimonial(`t${state.testimonials.length + 1}`, { inbox_item_id: row.id, text: body.text ?? row.text, author_name: row.author.name, author_handle: row.author.handle });
    state.testimonials = [made, ...state.testimonials];
    return route.fulfill({ status: 201, json: made });
  });
  await page.route(/\/v1\/testimonials\/[^/]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3]!;
    const found = state.testimonials.find((t) => t.id === id);
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (route.request().method() === "DELETE") {
      state.testimonials = state.testimonials.filter((t) => t.id !== id);
      return route.fulfill({ status: 204 });
    }
    const body = route.request().postDataJSON();
    state.patched.push(body);
    Object.assign(found, body);
    return route.fulfill({ json: found });
  });
  return state;
}

const list = (page: Page) => page.locator('ul[aria-label="Items"] > li:visible, ul[aria-label="Comments"] > li:visible');

test("a comment becomes a testimonial from the Comments reader", async ({ page }) => {
  const b = await brain(page);
  await page.goto("/comments?item=c1");
  await expect(page.getByRole("heading", { name: "Fan Test" })).toBeVisible();
  await page.getByRole("button", { name: "Add as testimonial" }).click();
  await expect(page.getByText("Added to Testimonials.")).toBeVisible();
  await expect(page.getByRole("link", { name: "In Testimonials" })).toBeVisible();
  expect(b.added).toEqual([{ inbox_item_id: "c1" }]);

  await page.goto("/testimonials");
  const cards = page.locator('ul[aria-label="Testimonials"] > li');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Love this post");
  await expect(cards.first()).toContainText("Fan Test (@fan.test) on Bluesky");
  await expect(cards.first().getByLabel("Permission")).toHaveValue("not_asked");
  await expect(cards.first().getByRole("link", { name: /View on Bluesky/ })).toHaveAttribute("href", "https://example.test/c1");
});

test("the permission control records an answer and only granted ones offer Post it", async ({ page }) => {
  const b = await brain(page, [testimonial("t1"), testimonial("t2", { id: "t2", inbox_item_id: "m1", text: "Thanks @acme", permission: "declined" })]);
  await page.goto("/testimonials");
  const cards = page.locator('ul[aria-label="Testimonials"] > li');
  const first = cards.first();
  await expect(first.getByRole("button", { name: "Post it" })).toHaveCount(0);
  await expect(first).toContainText("Ask before you reuse it.");
  await first.getByLabel("Permission").selectOption("granted");
  await expect(page.getByText("Marked granted.")).toBeVisible();
  expect(b.patched).toEqual([{ permission: "granted" }]);
  await expect(first).toContainText("They said yes to it being reused.");
  await expect(first.getByRole("button", { name: "Post it" })).toBeVisible();

  // The filter says what each answer holds.
  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Declined" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Thanks @acme");
  await page.getByRole("button", { name: "Not asked" }).click();
  await expect(page.getByText("No testimonial is waiting for an answer.")).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(cards).toHaveCount(2);
});

test("Post it opens the composer with the quote and the attribution, and sends nothing", async ({ page }) => {
  const b = await brain(page, [testimonial("t1", { permission: "granted" })]);
  const posts: unknown[] = [];
  await page.route("**/v1/posts", (route) => {
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { id: "p1" } });
  });
  await page.goto("/testimonials");
  await page.getByRole("button", { name: "Post it" }).click();
  await expect(page).toHaveURL(/\/posts\/new\?testimonial=t1$/);
  const body = page.getByLabel("Post", { exact: true });
  await expect(body).toHaveValue('"Best shop I know"\nFan Test (@fan.test) on Bluesky');
  expect(b.patched).toEqual([]);
  expect(posts).toEqual([]);
});

test("an empty Testimonials page says where one comes from", async ({ page }) => {
  await brain(page);
  await page.goto("/testimonials");
  await expect(page.getByText("No testimonials yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Comments" })).toHaveAttribute("href", "/t/acme22/comments");
  await expect(list(page)).toHaveCount(0);
});
