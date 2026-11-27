import { expect, test, type Page } from "@playwright/test";

const me = {
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" },
};
const account = {
  id: "y1",
  provider: "youtube",
  external_id: "UCus",
  handle: "nomadic",
  display_name: "The Nomadic Dev",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["s1"],
  created_at: "2026-10-20T10:00:00Z",
};
const inbox = (extra = {}) => ({
  enabled: false,
  poll_minutes: 30,
  daily_units: 300,
  units_today: 0,
  write_units_today: 0,
  paused: null,
  message: null,
  last_error: null,
  last_read_at: null,
  reconnect: false,
  reconnect_for_comments: false,
  shared_exhausted: false,
  idle_units_per_day: 48,
  write_units: 50,
  limits: { min_poll_minutes: 10, max_poll_minutes: 1440, default_poll_minutes: 30, min_daily_units: 20, max_daily_units: 5000, default_daily_units: 300 },
  ...extra,
});

async function brain(page: Page, state: ReturnType<typeof inbox>) {
  const seen = { puts: [] as unknown[], resumes: 0 };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account] }));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: [{ provider: "youtube", configured: true }] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "s1", name: "All sets", is_default: true, account_ids: ["y1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/connections/y1/youtube-inbox", (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON();
      seen.puts.push(body);
      return route.fulfill({ json: { ...state, ...body } });
    }
    return route.fulfill({ json: state });
  });
  await page.route("**/v1/connections/y1/youtube-inbox/resume", (route) => {
    seen.resumes++;
    return route.fulfill({ json: { ...state, paused: null, message: null } });
  });
  return seen;
}

test("the YouTube inbox is off until a team turns it on, says what it uses, and saves the choices", async ({ page }) => {
  const seen = await brain(page, inbox({ units_today: 12, write_units_today: 50 }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for The Nomadic Dev" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("group", { name: "YouTube inbox" })).toBeVisible();
  await expect(dialog.getByLabel("Read this channel's comments")).not.toBeChecked();
  await expect(dialog.getByText("about 48 a day at this pace")).toBeVisible();
  await expect(dialog.getByText("Today (Pacific time):")).toContainText("12 of 300 used reading, 50 on replies and moderation");
  await dialog.getByLabel("Read this channel's comments").check();
  await dialog.getByLabel("Read every").selectOption("60");
  await dialog.getByLabel("Most units to spend a day").selectOption("600");
  await dialog.getByRole("button", { name: "Save inbox settings" }).click();
  await expect.poll(() => seen.puts).toEqual([{ enabled: true, poll_minutes: 60, daily_units: 600 }]);
  await expect(dialog.getByText("Saved.")).toBeVisible();
});

test("a channel connected without the comments permission is asked to reconnect", async ({ page }) => {
  await brain(page, inbox({ reconnect_for_comments: true }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for The Nomadic Dev" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Reconnect to enable comments.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Reconnect", exact: true })).toHaveAttribute("href", /\/connections\/youtube\/redirect/);
});

test("a used-up budget says when reading goes on, and a quota pause has a Resume that asks brain once", async ({ page }) => {
  const seen = await brain(page, inbox({ enabled: true, paused: "quota", message: "YouTube's daily quota for this app is used up. Try again after midnight Pacific time.", shared_exhausted: true }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "Settings for The Nomadic Dev" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("All channels together used today's share of YouTube's quota.")).toBeVisible();
  await expect(dialog.getByRole("alert").filter({ hasText: "Reading is paused." })).toContainText("daily quota for this app is used up");
  await dialog.getByRole("button", { name: "Resume" }).click();
  await expect.poll(() => seen.resumes).toBe(1);
});

test("a YouTube comment shows its video and, for a reply, the comment it answers", async ({ page }) => {
  const row = (id: string, extra = {}) => ({
    id,
    social_account_id: "y1",
    platform: "youtube",
    kind: "comment",
    remote_id: id === "i1" ? "UgxT1" : "UgxT1.R1",
    remote_url: "https://www.youtube.com/watch?v=vid_12345A&lc=UgxT1",
    convo_id: null,
    post_id: null,
    author: { id: "UCann", handle: "ann", name: "Ann", avatar_url: null },
    text: id === "i1" ? "Great video" : "Agreed!",
    received_at: new Date(Date.now() - 300_000).toISOString(),
    state: "open",
    replied_at: null,
    replies: [],
    video: { id: "vid_12345A", title: "Ten tips for the road", thumbnail_url: "https://i.ytimg.com/vi/x/mq.jpg", url: "https://www.youtube.com/watch?v=vid_12345A" },
    ...extra,
  });
  const items = [row("i1"), row("i2", { reply_to: { author_name: "Ann", text: "Great video" } })];
  const all = { id: "all", name: "All", is_all: true, account_ids: [], filters: { kinds: [], keywords: [], unanswered: false }, created_at: "", updated_at: "" };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/inboxes", (route) => route.fulfill({ json: [{ ...all, open_count: 2 }] }));
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => route.fulfill({ json: { items, next_cursor: null } }));
  await page.route(/\/v1\/inbox-items\/(i1|i2)$/, (route) => route.fulfill({ json: items.find((i) => route.request().url().endsWith(i.id)) }));
  await page.goto("/inbox?item=i1");
  await expect(page.getByRole("link", { name: /Ten tips for the road/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=vid_12345A");
  await expect(page.getByText("In reply to")).toHaveCount(0);
  await page.goto("/inbox?item=i2");
  await expect(page.getByText("In reply to Ann")).toBeVisible();
  await expect(page.getByText("Great video").first()).toBeVisible();
});

test("a YouTube comment can be held, published again, rejected for good, and our reply deleted", async ({ page }) => {
  const calls: unknown[] = [];
  let item = {
    id: "i1",
    social_account_id: "y1",
    platform: "youtube",
    kind: "comment",
    remote_id: "UgxT1",
    remote_url: "https://www.youtube.com/watch?v=vid_12345A&lc=UgxT1",
    convo_id: null,
    post_id: null,
    author: { id: "UCann", handle: "ann", name: "Ann", avatar_url: null },
    text: "Great video",
    received_at: new Date(Date.now() - 300_000).toISOString(),
    state: "open",
    replied_at: new Date().toISOString(),
    replies: [{ id: "r1", kind: "public", text: "Thanks!", remote_id: "UgxT1.OUR", remote_url: null, sent_by: "u-me", automation_id: null, created_at: new Date().toISOString() }] as unknown[],
    moderation: { hidden: false, liked: false, deleted: false, can: ["hold", "reject", "ban"] },
  };
  const all = { id: "all", name: "All", is_all: true, account_ids: [], filters: { kinds: [], keywords: [], unanswered: false }, created_at: "", updated_at: "" };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/inboxes", (route) => route.fulfill({ json: [{ ...all, open_count: 1 }] }));
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => route.fulfill({ json: { items: [item], next_cursor: null } }));
  await page.route(/\/v1\/inbox-items\/i1$/, (route) => route.fulfill({ json: item }));
  await page.route(/\/v1\/inbox-items\/i1\/moderate$/, (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.action === "hold") item = { ...item, moderation: { hidden: true, liked: false, deleted: false, can: ["publish", "reject", "ban"] } };
    if (body.action === "publish") item = { ...item, moderation: { hidden: false, liked: false, deleted: false, can: ["hold", "reject", "ban"] } };
    if (body.action === "reject") item = { ...item, state: "done", moderation: { hidden: false, liked: false, deleted: true, can: [] } };
    if (body.action === "delete_reply") item = { ...item, replies: [], replied_at: null as never };
    return route.fulfill({ json: item });
  });
  await page.goto("/inbox?item=i1");
  await expect(page.getByText("Like: not available on YouTube")).toBeVisible();
  await page.getByRole("button", { name: "Hold for review" }).click();
  await expect(page.getByText("Held for review. It is hidden on YouTube until you publish it.")).toBeVisible();
  await page.getByRole("button", { name: "Publish again" }).click();
  await expect(page.getByText("Published again.")).toBeVisible();
  await page.getByRole("button", { name: "Delete reply" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("Thanks!")).toHaveCount(0);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByText("A rejected comment cannot be published again.")).toBeVisible();
  await page.getByRole("button", { name: "Yes, reject", exact: true }).click();
  await expect(page.getByText("Rejected. YouTube hides it for good.")).toBeVisible();
  expect(calls).toEqual([{ action: "hold" }, { action: "publish" }, { action: "delete_reply", reply_id: "r1" }, { action: "reject" }]);
  await expect(page.getByText("Hold for review")).toHaveCount(0);
});
