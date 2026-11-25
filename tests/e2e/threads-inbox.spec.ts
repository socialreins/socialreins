import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role },
});
const account = (extra = {}) => ({
  id: "th1",
  provider: "threads",
  external_id: "1",
  handle: "the_nomadic_dev",
  display_name: "The Nomadic Dev",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  dm_access: false,
  created_at: "2026-10-20T10:00:00Z",
  ...extra,
});
const all = { id: "all", name: "All", is_all: true, account_ids: [], filters: { kinds: [], keywords: [], unanswered: false }, created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z" };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const comment = (extra = {}) => ({
  id: "t1",
  social_account_id: "th1",
  platform: "threads",
  kind: "comment",
  remote_id: "200",
  remote_url: "https://www.threads.com/@ann/post/200",
  parent_remote_id: "100",
  root_remote_id: "100",
  convo_id: null,
  post_id: null,
  author: { id: "ann", handle: "ann", name: null, avatar_url: null },
  text: "Does this work on the free plan?",
  received_at: ago(5),
  state: "open",
  replied_at: null as string | null,
  replies: [] as unknown[],
  attachments: [],
  ...extra,
});

// A small brain with one Threads reply: its thread above, the actions log, and every reply and action sent.
async function brain(page: Page, role: Role, opts: { account?: object; refuse?: { error: string; message: string } } = {}) {
  const state = {
    item: comment(),
    replies: [] as Record<string, unknown>[],
    acted: [] as Record<string, unknown>[],
    hidden: false,
    log: [] as Record<string, unknown>[],
  };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account(opts.account)] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "d", name: "All sets", is_default: true, account_ids: ["th1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/inboxes", (route) => route.fulfill({ json: [{ ...all, open_count: 1 }] }));
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => route.fulfill({ json: { items: [{ ...state.item, conversation: null }], next_cursor: null } }));
  await page.route(/\/v1\/inbox-items\/t1$/, (route) => route.fulfill({ json: state.item }));
  await page.route(/\/v1\/inbox-items\/t1\/thread$/, (route) =>
    route.fulfill({
      json: {
        posts: [{ uri: "100", url: "https://www.threads.com/@the_nomadic_dev/post/100", author: { id: "1", handle: "the_nomadic_dev", name: null, avatar_url: null }, text: "Our free plan launch post", created_at: ago(600), attachments: [] }],
        truncated: false,
      },
    }),
  );
  await page.route(/\/v1\/inbox-items\/t1\/actions$/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      state.acted.push(body);
      if (opts.refuse) return route.fulfill({ status: 422, json: opts.refuse });
      state.hidden = body.action === "hide_reply";
      state.log.unshift({ id: `l${state.log.length}`, action: body.action, status: "done", target: "post", error: null, reply_id: null, done_by: "u-me", created_at: new Date().toISOString() });
      return route.fulfill({ json: { action: body.action, remote_id: null } });
    }
    return route.fulfill({ json: { viewer: null, viewer_error: "unsupported_platform", convo: null, hidden: state.hidden, log: state.log } });
  });
  await page.route(/\/v1\/inbox-items\/t1\/reply$/, (route) => {
    const body = route.request().postDataJSON();
    state.replies.push(body);
    state.item = comment({ replied_at: new Date().toISOString(), replies: [{ id: "r1", kind: "public", text: body.text, remote_id: "R1", remote_url: "https://www.threads.com/@the_nomadic_dev/post/R1", sent_by: "u-me", automation_id: null, created_at: new Date().toISOString() }] });
    return route.fulfill({ status: 201, json: state.item });
  });
  return state;
}

test("a Threads reply shows the post above it, counts an emoji by its bytes and sends a public reply", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/inbox/all?item=t1");
  const detail = page.getByRole("region", { name: "Item" });
  await expect(detail.getByRole("heading", { name: "@ann" })).toBeVisible();
  await expect(detail.getByText("Our free plan launch post")).toBeVisible();
  // The post above and the reply itself both link to Threads, not to Bluesky.
  await expect(detail.getByRole("link", { name: "View on Threads" })).toHaveCount(2);
  await expect(detail.getByRole("link", { name: /View on Bluesky/ })).toHaveCount(0);
  const box = detail.getByLabel("Reply publicly");
  await expect(box).toHaveAttribute("placeholder", "Reply to @ann on Threads");
  // 3 emoji are 12 bytes: Threads counts bytes, so 125 of them (500) fit and 126 do not.
  await box.fill("😀😀😀");
  await expect(detail.getByText("12 of 500 characters")).toBeVisible();
  await box.fill("😀".repeat(126));
  await expect(detail.getByText("504 of 500 characters")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Reply publicly" })).toBeDisabled();
  await box.fill("Yes, it does. Thanks for asking!");
  await detail.getByRole("button", { name: "Reply publicly" }).click();
  await expect.poll(() => state.replies).toEqual([{ text: "Yes, it does. Thanks for asking!" }]);
  await expect(detail.getByText("Reply sent.")).toBeVisible();
});

test("hiding a Threads reply is confirmed, logged, and can be undone; only hiding is offered", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/inbox/all?item=t1");
  const detail = page.getByRole("region", { name: "Item" });
  const actions = detail.getByRole("region", { name: "Actions on Threads" });
  await expect(actions.getByText("no like, repost, follow or block")).toBeVisible();
  await expect(actions.getByRole("button")).toHaveCount(1);
  await actions.getByRole("button", { name: "Hide reply" }).click();
  await expect(actions.getByRole("group", { name: "Confirm" })).toContainText("Hide this reply under your post?");
  // Nothing is sent before the confirmation.
  expect(state.acted).toEqual([]);
  await actions.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.acted).toEqual([{ action: "hide_reply", confirm: true }]);
  await expect(actions.getByText("The reply is hidden.")).toBeVisible();
  await expect(actions.getByRole("list", { name: "Recent actions" })).toContainText("Hid the reply");
  await actions.getByRole("button", { name: "Show reply" }).click();
  await actions.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.acted.length).toBe(2);
  await expect(actions.getByRole("list", { name: "Recent actions" })).toContainText("Showed the reply again");
});

test("a refused hide says what Threads said", async ({ page }) => {
  await brain(page, "owner", { refuse: { error: "threads_nested", message: "Threads can only hide a reply directly under a post of this account, not one deeper in the thread." } });
  await page.goto("/inbox/all?item=t1");
  const actions = page.getByRole("region", { name: "Item" }).getByRole("region", { name: "Actions on Threads" });
  await actions.getByRole("button", { name: "Hide reply" }).click();
  await actions.getByRole("button", { name: "Confirm" }).click();
  await expect(actions.getByRole("alert")).toContainText("directly under a post of this account");
});

test("a member sees that only owners and admins hide replies", async ({ page }) => {
  await brain(page, "member");
  await page.goto("/inbox/all?item=t1");
  const actions = page.getByRole("region", { name: "Item" }).getByRole("region", { name: "Actions on Threads" });
  await expect(actions.getByText("Owners and admins can hide replies.")).toBeVisible();
  await expect(actions.getByRole("button")).toHaveCount(0);
});

test("an account connected before replies is asked to reconnect, in the inbox and under Accounts", async ({ page }) => {
  await brain(page, "owner", { account: { replies_denied: true } });
  await page.goto("/inbox/all");
  await expect(page.getByText("Reconnect to enable replies").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Reconnect it under Accounts" })).toBeVisible();
  await page.goto("/connections");
  await expect(page.getByText("Reconnect to enable replies").first()).toBeVisible();
  await page.getByRole("button", { name: "Settings for The Nomadic Dev" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("This account was connected before SocialReins could read and send Threads replies.")).toBeVisible();
  await expect(dialog.getByText("Threads has no DMs")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Reconnect/ })).toHaveAttribute("href", /connections\/threads\/redirect/);
});
