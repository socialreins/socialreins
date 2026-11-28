import { expect, test, type Page } from "@playwright/test";

const me = {
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" },
};
const account = {
  id: "x1",
  provider: "x",
  external_id: "2244994945",
  handle: "ann_lee",
  display_name: "Ann Lee",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["s1"],
  created_at: "2026-10-20T10:00:00Z",
  long_posts: false,
  detected_long_posts: false,
};
const inbox = (extra = {}) => ({
  enabled: false,
  read_dms: false,
  poll_minutes: 60,
  budget_usd: 2,
  spent_usd: 0,
  paused: null,
  message: null,
  last_error: null,
  last_read_at: null,
  can_read_dms: true,
  can_like: true,
  can_hide: true,
  reconnect: false,
  credits: false,
  reads_per_credit: 3,
  estimate: { per_mention_usd: 0.015, per_dm_usd: 0.02, idle_month_usd: 0, projected_month_usd: 0 },
  limits: { min_poll_minutes: 15, max_poll_minutes: 1440, default_poll_minutes: 60, min_budget_usd: 0.1, max_budget_usd: 100, default_budget_usd: 2 },
  ...extra,
});

async function brain(page: Page, state: ReturnType<typeof inbox>) {
  const seen = { puts: [] as unknown[], resumes: 0 };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account] }));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: [{ provider: "x", configured: true }] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "s1", name: "All sets", is_default: true, account_ids: ["x1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/connections/x1/x-inbox", (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON();
      seen.puts.push(body);
      return route.fulfill({ json: { ...state, ...body } });
    }
    return route.fulfill({ json: state });
  });
  await page.route("**/v1/connections/x1/x-inbox/resume", (route) => {
    seen.resumes++;
    return route.fulfill({ json: { ...state, paused: null, message: null } });
  });
  return seen;
}

test("the X inbox is off until a team turns it on, says what it costs, and saves the choices", async ({ page }) => {
  const seen = await brain(page, inbox());
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for Ann Lee" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("group", { name: "X inbox" })).toBeVisible();
  await expect(dialog.getByLabel("Read this account's mentions and replies")).not.toBeChecked();
  await expect(dialog.getByText("Each new mention or reply costs about $0.015")).toBeVisible();
  await expect(dialog.getByText("Spent this month:")).toContainText("$0.000 of $2.00");
  await dialog.getByLabel("Read this account's mentions and replies").check();
  await dialog.getByLabel("Read every").selectOption("240");
  await dialog.getByLabel("Most to spend a month ($)").fill("5");
  await dialog.getByLabel("Read and send DMs").check();
  await dialog.getByRole("button", { name: "Save inbox settings" }).click();
  await expect.poll(() => seen.puts).toEqual([{ enabled: true, read_dms: true, poll_minutes: 240, budget_usd: 5 }]);
  await expect(dialog.getByText("Saved.")).toBeVisible();
});

test("an account connected before the inbox scopes is asked to reconnect for DMs", async ({ page }) => {
  await brain(page, inbox({ can_read_dms: false, can_like: false, can_hide: false }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for Ann Lee" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Reconnect for DMs, likes and hiding.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Reconnect", exact: true })).toHaveAttribute("href", /\/connections\/x\/redirect.*inbox=1/);
  await expect(dialog.getByLabel("Read and send DMs")).toBeDisabled();
});

test("a pause for credits shows X's message and a Resume that asks brain once", async ({ page }) => {
  const message = "X says this app is out of API credits (X bills API use by credits). Add credits in the X developer console, then publish again.";
  const seen = await brain(page, inbox({ enabled: true, paused: "credits", message }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for Ann Lee" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert").filter({ hasText: "Reading is paused." })).toContainText("out of API credits");
  await dialog.getByRole("button", { name: "Resume" }).click();
  await expect.poll(() => seen.resumes).toBe(1);
  await expect(dialog.getByText("Reading is paused.")).toHaveCount(0);
});

test("a used-up budget has no Resume: it ends with the month or a higher budget", async ({ page }) => {
  await brain(page, inbox({ enabled: true, paused: "budget", message: "This month's read budget for the account is used up." }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for Ann Lee" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Reading is paused.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Resume" })).toHaveCount(0);
});

test("an X comment can be liked, reposted and hidden, a mention not hidden", async ({ page }) => {
  const calls: string[] = [];
  const row = (id: string, kind: string) => ({
    id,
    social_account_id: "x1",
    platform: "x",
    kind,
    remote_id: id === "i1" ? "30" : "29",
    remote_url: `https://x.com/bob/status/${id}`,
    convo_id: null,
    post_id: null,
    author: { id: "7", handle: "bob", name: "Bob", avatar_url: null },
    text: kind === "comment" ? "Love this" : "hello @ann_lee",
    received_at: new Date(Date.now() - 300_000).toISOString(),
    state: "open",
    replied_at: null,
    replies: [],
  });
  const items = [row("i1", "comment"), row("i2", "mention")];
  const all = { id: "all", name: "All", is_all: true, account_ids: [], filters: { kinds: [], keywords: [], unanswered: false }, created_at: "", updated_at: "" };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/inboxes", (route) => route.fulfill({ json: [{ ...all, open_count: 2 }] }));
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => route.fulfill({ json: { items, next_cursor: null } }));
  await page.route(/\/v1\/inbox-items\/(i1|i2)$/, (route) => route.fulfill({ json: items.find((i) => route.request().url().endsWith(i.id)) }));
  await page.route(/\/v1\/inbox-items\/[^/]+\/x-action$/, (route) => {
    calls.push(`${route.request().url().split("/").at(-2)} ${route.request().postDataJSON().action}`);
    return route.fulfill({ status: 204 });
  });
  await page.goto("/comments?item=i1");
  await page.getByRole("button", { name: "Like", exact: true }).click();
  await expect(page.getByText("Liked.")).toBeVisible();
  await page.getByRole("button", { name: "Repost" }).click();
  await expect(page.getByText("Reposted.")).toBeVisible();
  await page.getByRole("button", { name: "Hide reply" }).click();
  await expect(page.getByText("Reply hidden.")).toBeVisible();
  expect(calls).toEqual(["i1 like", "i1 repost", "i1 hide"]);
  await page.goto("/comments?item=i2");
  await expect(page.getByRole("button", { name: "Like", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide reply" })).toHaveCount(0);
});

test("a budget typed with a dollar sign is refused on the page, not saved as nothing", async ({ page }) => {
  const seen = await brain(page, inbox({ enabled: true }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for Ann Lee" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Most to spend a month ($)").fill("$5");
  await dialog.getByRole("button", { name: "Save inbox settings" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Write the budget as a number of dollars" })).toBeVisible();
  expect(seen.puts).toEqual([]);
});

test("DMs left on after the permission was lost do not block saving", async ({ page }) => {
  const seen = await brain(page, inbox({ enabled: true, read_dms: true, can_read_dms: false }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for Ann Lee" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Read and send DMs")).not.toBeChecked();
  await dialog.getByLabel("Most to spend a month ($)").fill("3");
  await dialog.getByRole("button", { name: "Save inbox settings" }).click();
  await expect.poll(() => seen.puts).toEqual([{ enabled: true, read_dms: false, poll_minutes: 60, budget_usd: 3 }]);
});
