import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin" });

const team = { id: "t1", name: "Acme", code: "acme22", require_approval: true };
const me = (role: "owner" | "admin" | "member", extra: Record<string, unknown> = {}) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { ...team, role, ...extra },
});
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
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
  status: "scheduled",
  scheduled_at: "2026-11-12T09:00:00Z" as string | null,
  published_at: null as string | null,
  error: null as string | null,
  created_by: "u-ann",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [] as Record<string, unknown>[],
  lists: [] as { id: string; name: string; position: number }[],
  group_id: null as string | null,
  approval: null as string | null,
  approval_note: null as string | null,
  approval_by: null as string | null,
  approval_at: null as string | null,
  ...extra,
});
// One waiting post, one waiting group of two, one sent back with a note and one nobody has to approve.
const fixture = () => [
  post("p1", { body: "Launch day", approval: "pending" }),
  post("g-b", { body: "Hiring", scheduled_at: "2026-11-13T09:00:00Z", group_id: "g1", approval: "pending" }),
  post("g-x", { body: "Hiring", scheduled_at: "2026-11-13T09:00:00Z", group_id: "g1", platform: "x", approval: "pending" }),
  post("p2", { body: "Old price", scheduled_at: "2026-11-14T09:00:00Z", approval: "rejected", approval_note: "Use the new price" }),
  post("p3", { body: "Weekly tip", scheduled_at: "2026-11-15T09:00:00Z", approval: "approved" }),
];

type Call = { path: string; body: unknown };
// brain with the approval endpoints: a decision changes `posts`, so the list that reloads shows it.
async function brain(page: Page, session: unknown, posts: Post[] = fixture()) {
  const calls: Call[] = [];
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00Z"));
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: session }));
  await page.route(/\/v1\/social-sets$/, (r) => r.fulfill({ json: sets }));
  await page.route("**/v1/connections", (r) => r.fulfill({ json: [alice] }));
  await page.route(/\/v1\/posts(\?.*)?$/, (r) => {
    const q = new URL(r.request().url()).searchParams;
    if (q.get("status") === "draft") return r.fulfill({ json: [] });
    return r.fulfill({ json: posts.filter((p) => !q.get("group_id") || p.group_id === q.get("group_id")) });
  });
  await page.route(/\/v1\/posts\/[\w-]+$/, (r) => {
    const found = posts.find((p) => r.request().url().endsWith(`/${p.id}`));
    return found ? r.fulfill({ json: found }) : r.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.route(/\/v1\/(posts|post-groups)\/[\w-]+\/(approve|reject)$/, (r) => {
    const [, kind, id, what] = /\/v1\/(posts|post-groups)\/([\w-]+)\/(approve|reject)$/.exec(r.request().url())!;
    const body = r.request().postDataJSON() as { note?: string };
    calls.push({ path: `/${kind}/${id}/${what}`, body });
    const hit = posts.filter((p) => (kind === "posts" ? p.id === id : p.group_id === id));
    if (!hit.some((p) => p.approval === "pending")) return r.fulfill({ status: 409, json: { error: "not_awaiting_approval" } });
    for (const p of hit) Object.assign(p, { approval: what === "approve" ? "approved" : "rejected", approval_note: body.note ?? null, approval_by: "u-me" });
    return r.fulfill({ json: kind === "posts" ? hit[0] : { posts: hit } });
  });
  return calls;
}

test("an owner switches approvals on from the Team page, and a member has no switch", async ({ page }) => {
  await brain(page, me("owner", { require_approval: false }));
  await page.route("**/v1/team/members", (r) => r.fulfill({ json: [] }));
  await page.route("**/v1/team/invitations", (r) => r.fulfill({ json: [] }));
  let sent: unknown;
  await page.route("**/v1/team", (r) => {
    sent = r.request().postDataJSON();
    return r.fulfill({ json: { ...team, role: "owner", require_approval: true } });
  });
  await page.goto("/t/acme22/team");
  const box = page.getByRole("checkbox", { name: "Members' posts need an owner or admin to approve them before they go out" });
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(page.getByText("Members' posts now wait for an owner or admin to approve them.")).toBeVisible();
  expect(sent).toEqual({ require_approval: true });
  await expect(box).toBeChecked();

  await page.route("**/auth/me", (r) => r.fulfill({ json: me("member") }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approvals" })).toHaveCount(0);
});

test("a member sees what waits and what was sent back, and can't publish before approval", async ({ page }) => {
  await brain(page, me("member"));
  await page.goto("/t/acme22/posts");
  const list = page.getByRole("list", { name: "Posts in November 2026" });
  const row = (text: string) => list.getByRole("listitem").filter({ hasText: text });
  await expect(row("Launch day").getByText("Needs approval")).toBeVisible();
  await expect(row("Old price").getByText("Changes requested")).toBeVisible();
  await expect(row("Old price").getByText("Use the new price")).toBeVisible();
  await expect(row("Weekly tip").getByText("Needs approval")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Request changes/ })).toHaveCount(0);

  await page.goto("/t/acme22/calendar");
  await expect(page.getByRole("link", { name: /Scheduled, needs approval: .*Launch day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Scheduled: .*Weekly tip/ })).toBeVisible();

  await page.goto("/t/acme22/posts/p1");
  const banner = page.getByRole("region", { name: "Approval" });
  await expect(banner).toContainText("Waiting for an owner or admin to approve");
  await expect(banner.getByRole("button")).toHaveCount(0);
  const publish = page.getByRole("button", { name: "Publish now" });
  await expect(publish).toBeDisabled();
  await expect(publish).toHaveAccessibleDescription("An owner or admin has to approve this post before it goes out. Schedule it to ask for approval.");
  await expect(page.getByRole("button", { name: "Schedule", exact: true })).toBeEnabled();

  await page.goto("/t/acme22/posts/p2");
  await expect(page.getByRole("region", { name: "Approval" })).toContainText("An owner or admin asked for changes: Use the new price");

  // An approved post goes out on a member's Publish now.
  await page.goto("/t/acme22/posts/p3");
  await expect(page.getByRole("button", { name: "Publish now" })).toBeEnabled();
  await expect(page.getByRole("region", { name: "Approval" })).toHaveCount(0);
});

test("an owner approves one post and a whole group from the Posts list", async ({ page }) => {
  const calls = await brain(page, me("owner"));
  await page.goto("/t/acme22/posts");
  await page.getByRole("button", { name: "Approve Launch day" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved Launch day. It goes out at its scheduled time." })).toBeVisible();
  expect(calls).toEqual([{ path: "/posts/p1/approve", body: {} }]);
  await expect(page.getByRole("button", { name: "Approve Launch day" })).toHaveCount(0);

  // The two versions of one post are one row, approved together.
  await expect(page.getByRole("button", { name: "Approve Hiring" })).toHaveCount(1);
  await page.getByRole("button", { name: "Approve Hiring" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved Hiring on 2 networks." })).toBeVisible();
  expect(calls[1]).toEqual({ path: "/post-groups/g1/approve", body: {} });
  await expect(page.getByRole("list", { name: "Posts in November 2026" }).getByText("Needs approval")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Approval" }).getByRole("button", { name: "Needs approval 0" })).toBeVisible();
});

test("an owner requests changes with a note, and the row then shows it", async ({ page }) => {
  const calls = await brain(page, me("admin"));
  await page.goto("/t/acme22/posts");
  await page.getByRole("button", { name: "Request changes: Launch day" }).click();
  const dialog = page.getByRole("dialog", { name: "Request changes: Launch day" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls).toEqual([]);

  await page.getByRole("button", { name: "Request changes: Launch day" }).click();
  await dialog.getByLabel("Note for the author (optional)").fill(" Add the link ");
  await dialog.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Asked for changes to Launch day." })).toBeVisible();
  expect(calls).toEqual([{ path: "/posts/p1/reject", body: { note: "Add the link" } }]);
  const row = page.getByRole("list", { name: "Posts in November 2026" }).getByRole("listitem").filter({ hasText: "Launch day" });
  await expect(row.getByText("Changes requested")).toBeVisible();
  await expect(row.getByText("Add the link")).toBeVisible();
});

test("the approval filter lives in the URL and only shows while the team requires approval", async ({ page }) => {
  await brain(page, me("owner"));
  await page.goto("/t/acme22/posts");
  const chips = page.getByRole("list", { name: "Approval" });
  await expect(chips.getByRole("button", { name: "All 4" })).toHaveAttribute("aria-pressed", "true");
  await chips.getByRole("button", { name: "Needs approval 2" }).click();
  await expect(page).toHaveURL("/t/acme22/posts?approval=pending");
  const list = page.getByRole("list", { name: "Posts in November 2026" });
  await expect(list.getByText("Launch day")).toBeVisible();
  await expect(list.getByText("Hiring")).toBeVisible();
  await expect(list.getByText("Weekly tip")).toHaveCount(0);
  await expect(list.getByText("Old price")).toHaveCount(0);

  await page.goto("/t/acme22/posts?approval=rejected");
  await expect(chips.getByRole("button", { name: "Changes requested 1" })).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByText("Old price")).toBeVisible();
  await expect(list.getByText("Launch day")).toHaveCount(0);
  await chips.getByRole("button", { name: "All 4" }).click();
  await expect(page).toHaveURL("/t/acme22/posts");

  await page.route("**/auth/me", (r) => r.fulfill({ json: me("owner", { require_approval: false }) }));
  await page.goto("/t/acme22/posts?approval=rejected");
  await expect(list.getByText("Launch day")).toBeVisible();
  await expect(chips).toHaveCount(0);
});

test("approving a post someone else already handled says so and reloads the list", async ({ page }) => {
  const posts = fixture();
  await brain(page, me("owner"), posts);
  await page.goto("/t/acme22/posts");
  await expect(page.getByRole("button", { name: "Approve Launch day" })).toBeVisible();
  posts[0]!.approval = "approved";
  await page.getByRole("button", { name: "Approve Launch day" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This post is no longer waiting for approval. Reload to see it." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve Launch day" })).toHaveCount(0);
});

test("an owner approves or sends back a post from its page", async ({ page }) => {
  const calls = await brain(page, me("owner"));
  await page.goto("/t/acme22/posts/p1");
  const banner = page.getByRole("region", { name: "Approval" });
  await expect(page.getByRole("button", { name: "Publish now" })).toBeEnabled();
  await banner.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved. It goes out at its scheduled time.")).toBeVisible();
  expect(calls).toEqual([{ path: "/posts/p1/approve", body: {} }]);
  await expect(banner).toHaveCount(0);

  // A group's page decides for every network of the post.
  await page.goto("/t/acme22/posts/g-b");
  await banner.getByRole("button", { name: "Request changes" }).click();
  const dialog = page.getByRole("dialog", { name: "Request changes: Hiring" });
  await expect(dialog).toContainText("on any of its 2 networks");
  await dialog.getByLabel("Note for the author (optional)").fill("Wrong date");
  await dialog.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByText("Asked for changes on 2 networks.")).toBeVisible();
  expect(calls[1]).toEqual({ path: "/post-groups/g1/reject", body: { note: "Wrong date" } });
  await expect(banner).toContainText("An owner or admin asked for changes: Wrong date");
});

test("a member's Publish now that brain refuses explains the approval", async ({ page }) => {
  // The team switched approvals on after this page read the session.
  await brain(page, me("member", { require_approval: false }), [post("p9", { body: "Go now" })]);
  await page.route("**/v1/posts/p9", (r) => r.fulfill({ json: post("p9", { body: "Go now" }) }));
  await page.route("**/v1/posts/p9/publish", (r) => r.fulfill({ status: 403, json: { error: "approval_required" } }));
  await page.goto("/t/acme22/posts/p9");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This team's posts need an owner or admin to approve them before they go out." })).toBeVisible();
});

test("home has one row for the posts waiting for approval for an owner, none for a member", async ({ page }) => {
  await brain(page, me("owner"));
  await page.route("**/v1/inboxes", (r) => r.fulfill({ json: [] }));
  await page.goto("/t/acme22/home");
  const card = page.getByRole("region", { name: "Needs attention" });
  // One row for all of them: the single post and the group of two that is approved as one.
  await expect(card.getByRole("link", { name: "2 posts need approval" })).toHaveAttribute("href", "/t/acme22/posts?approval=pending");
  await expect(card.getByRole("listitem")).toHaveCount(1);

  await page.route("**/auth/me", (r) => r.fulfill({ json: me("member") }));
  await page.reload();
  await expect(page.getByRole("region", { name: "Today and next" }).getByRole("link", { name: /Launch day/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
});
