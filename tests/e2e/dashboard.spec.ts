import { expect, test } from "@playwright/test";

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const post = (id: string, extra: Record<string, unknown>) => ({
  id, social_set_id: "d", platform: "bluesky", body: `Body of ${id}`, media: [], thread: [], status: "draft",
  scheduled_at: null, published_at: null, error: null, created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", targets: [], lists: [], ...extra,
});

test("home shows what failed, what is up next, recent posts, the inbox and a few counts for the current set", async ({ page }) => {
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
    if (q.get("status") === "draft") return r.fulfill({ json: [post("p-draft", {})] });
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
  await page.route(/\/v1\/inboxes\/all\/items/, (r) =>
    r.fulfill({
      json: {
        items: [{ id: "i1", social_account_id: "c1", platform: "bluesky", kind: "comment", remote_id: "x", remote_url: null, convo_id: null, post_id: null, author: { id: "a", handle: "bob.bsky.social", name: "Bob", avatar_url: null }, text: "Where is the guide?", received_at: "2026-11-10T11:00:00Z", state: "open", replied_at: null, replies: [] }],
        next_cursor: "more",
      },
    }),
  );
  await page.route("**/v1/automations", (r) => r.fulfill({ json: [{ id: "a1", name: "Guide", active: true, runs: { count: 3, last_at: null } }, { id: "a2", name: "Off", active: false, runs: { count: 9, last_at: null } }] }));

  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  const stat = (label: string) => page.getByRole("region", { name: "Overview" }).getByRole("link", { name: new RegExp(`^${label}`) });
  await expect(stat("Scheduled, next 7 days")).toContainText("1");
  await expect(stat("Scheduled, next 7 days")).toHaveAttribute("href", "/t/acme22/calendar");
  await expect(stat("Drafts")).toContainText("1");
  await expect(stat("Connected accounts")).toContainText("1");

  const upNext = page.getByRole("region", { name: "Up next" });
  await expect(upNext.getByRole("link", { name: /Launch day/ })).toHaveAttribute("href", "/t/acme22/posts/p-soon");
  await expect(upNext.getByRole("listitem")).toHaveCount(2);
  await expect(upNext.getByRole("listitem").nth(1)).toContainText("Month end");
  await expect(upNext.getByRole("link", { name: "Open calendar" })).toHaveAttribute("href", "/t/acme22/calendar");
  await expect(page.getByRole("region", { name: "Needs attention" })).toContainText("Bluesky refused the image");
  // Failures older than a week drop off Home.
  await expect(page.getByRole("region", { name: "Needs attention" })).not.toContainText("An old failure");
  await expect(page.getByRole("region", { name: "Recently published" }).getByRole("link", { name: /Hello/ })).toBeVisible();
  const inbox = page.getByRole("region", { name: "Inbox" });
  await expect(inbox.getByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/t/acme22/inbox/all?item=i1");
  await expect(inbox).toContainText("1+ open");
  // The calmer home leaves automations and the account list to their own pages.
  await expect(page.getByRole("region", { name: "Automations" })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "All sets" }).click();
  await page.locator("#set-menu").getByRole("button", { name: "All sets" }).click();
  await expect.poll(() => queries.some((q) => q.get("social_set_id") === "d" && q.get("status") === "draft")).toBe(true);
});

test("home explains what failed to load and keeps the rest", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route(/\/v1\/posts(\?.*)?$/, (r) => r.fulfill({ status: 500 }));
  await page.goto("/home");
  await expect(page.getByRole("region", { name: "Up next" }).getByRole("alert")).toContainText("couldn't be loaded");
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Inbox" })).toContainText("No open comments, mentions or DMs.");
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
  await expect(warning.getByRole("link", { name: "Reconnect Gone Gia" })).toHaveAttribute("href", "http://localhost:8080/connections/linkedin/redirect?team=acme22");
});

test("home counts and warns about only the picked set's accounts", async ({ page }) => {
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
  const stat = page.getByRole("link", { name: /^Connected accounts/ });
  await expect(stat).toContainText("1");
  await expect(page.getByRole("region", { name: "Accounts need reconnecting" })).toHaveCount(0);
  // The default set holds every account, the one to reconnect included.
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "English" }).click();
  await page.locator("#set-menu").getByRole("button", { name: "All sets" }).click();
  await expect(stat).toContainText("2");
  await expect(page.getByRole("region", { name: "Accounts need reconnecting" }).getByRole("listitem")).toHaveCount(1);
});

test("home shows no warning when every account is fine", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route("**/v1/connections", (r) =>
    r.fulfill({ json: [{ id: "c1", provider: "bluesky", external_id: "did:plc:a", handle: "acme.bsky.social", display_name: "Acme", avatar_url: null, token_expires_at: null, set_ids: [], created_at: "2026-10-20T10:00:00Z", status: "ok" }] }),
  );
  await page.goto("/home");
  await expect(page.getByRole("link", { name: /^Connected accounts/ })).toContainText("1");
  await expect(page.getByRole("region", { name: "Accounts need reconnecting" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
});
