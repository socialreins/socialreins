import { expect, test } from "@playwright/test";

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", role: "owner" } };
const post = (id: string, extra: Record<string, unknown>) => ({
  id, social_set_id: "d", platform: "bluesky", body: `Body of ${id}`, media: [], thread: [], status: "draft",
  scheduled_at: null, published_at: null, error: null, created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", targets: [], lists: [], ...extra,
});

test("home sums up posts, inbox, automations and accounts for the current set", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00Z"));
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (r) => r.fulfill({ json: [{ id: "d", name: "Default", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null }] }));
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
  const tile = (label: string) => page.getByRole("link", { name: new RegExp(`^${label}`) });
  await expect(tile("Scheduled, next 7 days")).toContainText("1");
  await expect(tile("Published, last 7 days")).toContainText("1");
  await expect(tile("Failed, last 30 days")).toContainText("1");
  await expect(tile("Drafts")).toContainText("1");
  await expect(tile("Open in inbox")).toContainText("1+");
  await expect(tile("Connected accounts")).toContainText("1");

  const upNext = page.getByRole("region", { name: "Up next" });
  await expect(upNext.getByRole("link", { name: /Launch day/ })).toHaveAttribute("href", "/posts/p-soon");
  await expect(upNext.getByRole("listitem")).toHaveCount(2);
  await expect(upNext.getByRole("listitem").nth(1)).toContainText("Month end");
  await expect(page.getByRole("region", { name: "Needs attention" })).toContainText("Bluesky refused the image");
  await expect(page.getByRole("region", { name: "Recently published" }).getByRole("link", { name: /Hello/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Inbox" }).getByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/inbox/all?item=i1");
  await expect(page.getByRole("region", { name: "Automations" })).toContainText("1 on, with 3 runs so far.");
  await expect(page.getByRole("region", { name: "Accounts" })).toContainText("@acme.bsky.social");

  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "All sets" }).click();
  await page.locator("#set-menu").getByRole("button", { name: "Default" }).click();
  await expect.poll(() => queries.some((q) => q.get("social_set_id") === "d" && q.get("status") === "draft")).toBe(true);
});

test("home explains what failed to load and keeps the rest", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route(/\/v1\/posts(\?.*)?$/, (r) => r.fulfill({ status: 500 }));
  await page.goto("/home");
  await expect(page.getByRole("region", { name: "Up next" }).getByRole("alert")).toContainText("couldn't be loaded");
  await expect(page.getByRole("region", { name: "Automations" })).toContainText("No automation is on.");
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
  await expect(warning.getByRole("link", { name: "Reconnect Gone Gia" })).toHaveAttribute("href", "http://localhost:8080/connections/linkedin/redirect");
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
});
