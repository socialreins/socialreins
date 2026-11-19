import { expect, test, type Page } from "@playwright/test";

// Recurring posts: the Repeat control in the composer and on a saved scheduled post, and the Repeats badge.
test.use({ timezoneId: "Europe/Berlin" });
// Set SHOTS to a folder to save screenshots of the new UI.
const shots = process.env.SHOTS;

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "member" } };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const account = (id: string, provider: string, name: string) => ({ id, provider, external_id: id, handle: null, display_name: name, avatar_url: null, token_expires_at: null, set_ids: ["d"], created_at: "2026-10-20T10:00:00Z" });
const alice = account("c1", "bluesky", "Alice");
const threadsAcc = account("c2", "threads", "Alice on Threads");
const tiktokAcc = account("c8", "tiktok", "Alice on TikTok");
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  social_set_id: "d",
  platform: "bluesky",
  body: `Body of ${id}`,
  media: [] as string[],
  thread: [],
  status: "scheduled",
  scheduled_at: "2026-11-20T08:30:00Z",
  published_at: null,
  error: null,
  created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [],
  lists: [],
  group_id: null as string | null,
  repeat: null as unknown,
  ...extra,
});
const weekly = { every: "week", interval: 1, until: null, remaining: null };

// brain with `accounts`; every call that creates a post or changes a repeat is recorded in order.
// `repeat` answers PUT and DELETE /v1/posts/{id}/repeat in place of the default (the post with the rule).
async function brain(page: Page, accounts: unknown[] = [alice], repeat?: { status: number; json: unknown }) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const note = (r: { method: () => string; url: () => string; postDataJSON: () => unknown }) => calls.push({ method: r.method(), path: new URL(r.url()).pathname, body: r.postDataJSON() });
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: accounts }));
  await page.route(/\/v1\/social-sets\/d\/queue$/, (route) => route.fulfill({ json: { time_zone: "UTC", slots: [{ weekday: 1, time: "08:00" }], next: ["2026-11-23T08:00:00Z"] } }));
  await page.route("**/v1/posts", (route) => {
    note(route.request());
    return route.fulfill({ status: 201, json: post("p1", { body: "Weekly tip" }) });
  });
  await page.route("**/v1/post-groups", (route) => {
    note(route.request());
    return route.fulfill({ status: 201, json: { group_id: "g1", posts: [post("g-b", { group_id: "g1" }), post("g-t", { group_id: "g1", platform: "threads" })] } });
  });
  await page.route(/\/v1\/posts\?group_id=g1$/, (route) => route.fulfill({ json: [post("g-b", { group_id: "g1" }), post("g-t", { group_id: "g1", platform: "threads" })] }));
  await page.route(/\/v1\/posts\/[\w-]+\/repeat$/, (route) => {
    const req = route.request();
    note(req);
    const id = req.url().split("/").at(-2)!;
    return route.fulfill(repeat ?? { json: post(id, { repeat: req.method() === "PUT" ? req.postDataJSON() : null }) });
  });
  return calls;
}

test("scheduling with a repeat creates the post, then sets the rule on it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await brain(page);
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Weekly tip");
  await page.getByLabel("Publish at").fill("2026-11-20T09:30");
  await expect(page.getByLabel("Ends")).toHaveCount(0);
  await page.getByLabel("Repeat", { exact: true }).selectOption("Custom");
  await page.getByLabel("every", { exact: true }).fill("2");
  await page.getByLabel("Repeat unit").selectOption("weeks");
  await page.getByLabel("Ends").selectOption("After a number of posts");
  await page.getByLabel("More posts").fill("5");
  if (shots) await page.screenshot({ path: `${shots}/composer-repeat.png` });
  // Nothing is sent before the post exists.
  expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText("Repeats every 2 weeks, 5 more times.")).toBeVisible();
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/posts", "PUT /v1/posts/p1/repeat"]);
  expect(calls[1]!.body).toEqual({ every: "week", interval: 2, until: null, remaining: 5 });
  // The saved post's control shows the rule.
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue("custom");
});

test("a queued post for several platforms sends one repeat call, on its first post", async ({ page }) => {
  const calls = await brain(page, [alice, threadsAcc]);
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Hello all");
  await page.getByLabel("Repeat", { exact: true }).selectOption("Every month");
  await page.getByLabel("Ends").selectOption("On a date");
  await page.getByLabel("Repeat until").fill("2026-12-31");
  await page.getByRole("button", { name: "Add to queue" }).click();
  await expect(page.getByText("Repeats every month until Dec 31, 2026.")).toBeVisible();
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/post-groups", "PUT /v1/posts/g-b/repeat"]);
  expect(calls[0]!.body).toMatchObject({ queue: true, platforms: ["bluesky", "threads"] });
  expect(calls[1]!.body).toEqual({ every: "month", interval: 1, until: "2026-12-31", remaining: null });
});

test("a draft or Publish now sends no repeat", async ({ page }) => {
  const calls = await brain(page);
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Weekly tip");
  await page.getByLabel("Repeat", { exact: true }).selectOption("Every day");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/t/acme22/posts/p1");
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/posts"]);
});

test("a saved scheduled post saves each change of the repeat, and clears it", async ({ page }) => {
  const calls = await brain(page);
  await page.route("**/v1/posts/p7", (route) => route.fulfill({ json: post("p7") }));
  await page.goto("/posts/p7");
  const repeat = page.getByLabel("Repeat", { exact: true });
  await expect(repeat).toHaveValue("none");
  await repeat.selectOption("Every week");
  await expect(page.getByRole("status").filter({ hasText: "Repeats every week." })).toBeVisible();
  // "On a date" waits for the date.
  await page.getByLabel("Ends").selectOption("On a date");
  await page.getByLabel("Repeat until").fill("2027-01-31");
  await page.getByLabel("Repeat until").blur();
  await expect(page.getByRole("status").filter({ hasText: "Repeats every week until Jan 31, 2027." })).toBeVisible();
  await repeat.selectOption("Does not repeat");
  await expect(page.getByRole("status").filter({ hasText: "This post no longer repeats." })).toBeVisible();
  expect(calls).toEqual([
    { method: "PUT", path: "/v1/posts/p7/repeat", body: weekly },
    { method: "PUT", path: "/v1/posts/p7/repeat", body: { ...weekly, until: "2027-01-31" } },
    { method: "DELETE", path: "/v1/posts/p7/repeat", body: null },
  ]);
});

test("a saved draft has the control switched off", async ({ page }) => {
  await brain(page);
  await page.route("**/v1/posts/p8", (route) => route.fulfill({ json: post("p8", { status: "draft", scheduled_at: null }) }));
  await page.goto("/posts/p8");
  await expect(page.getByLabel("Repeat", { exact: true })).toBeDisabled();
});

test("TikTok among the networks hides the control and says why", async ({ page }) => {
  await brain(page, [alice, tiktokAcc]);
  await page.route("**/v1/connections/c8/tiktok", (route) => route.fulfill({ status: 502, json: { error: "tiktok_failed" } }));
  await page.goto("/posts/new");
  await expect(page.getByText("A post that goes to TikTok can't repeat: TikTok needs a person to confirm each post.")).toBeVisible();
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveCount(0);
  await page.getByRole("group", { name: "Post to" }).getByRole("checkbox", { name: /TikTok/ }).uncheck();
  await expect(page.getByLabel("Repeat", { exact: true })).toBeVisible();
});

test("a refused repeat leaves the post scheduled and says why", async ({ page }) => {
  const calls = await brain(page, [alice], { status: 422, json: { error: "invalid_repeat", field: "until" } });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Weekly tip");
  await page.getByLabel("Publish at").fill("2026-11-20T09:30");
  await page.getByLabel("Repeat", { exact: true }).selectOption("Every week");
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The post is scheduled, but the repeat was not saved. That repeat isn't valid." })).toBeVisible();
  await expect(page.getByText(/^Scheduled for .*20, 2026/).first()).toBeVisible();
  await expect(page).toHaveURL("/t/acme22/posts/p1");
  expect(calls).toHaveLength(2);
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue("none");
});

for (const [code, text] of [
  ["not_scheduled", "Only a scheduled post can repeat."],
  ["repeat_not_supported", "TikTok posts can't repeat"],
  ["too_many_repeats", "Too many repeating posts."],
] as const)
  test(`a saved post words ${code} and puts the control back`, async ({ page }) => {
    await brain(page, [alice], { status: code === "not_scheduled" ? 409 : 422, json: { error: code } });
    await page.route("**/v1/posts/p7", (route) => route.fulfill({ json: post("p7") }));
    await page.goto("/posts/p7");
    await page.getByLabel("Repeat", { exact: true }).selectOption("Every day");
    await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
    await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue("none");
  });

test("a repeating post has a Repeats badge in the list and a repeat mark on its calendar chip", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+01:00"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await brain(page);
  const rule = { every: "week", interval: 2, until: null, remaining: 5 };
  const day = (n: number, extra: Record<string, unknown> = {}) => post(`p-${n}`, { scheduled_at: `2026-11-12T${String(8 + n).padStart(2, "0")}:00:00Z`, body: `Tip ${n}`, ...extra });
  await page.route(/\/v1\/posts(\?.*)?$/, (route) =>
    route.fulfill({ json: new URL(route.request().url()).searchParams.get("status") === "draft" ? [] : [day(1, { repeat: rule }), day(2), day(3), day(4), day(5, { repeat: { ...weekly, every: "month" } })] }),
  );
  await page.goto("/posts");
  const list = page.getByRole("list", { name: "Posts in November 2026" });
  await expect(list.getByText(/^Repeats: /)).toHaveCount(2);
  await expect(list.getByTitle("Repeats every 2 weeks, 5 more times")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/list-repeats-badge.png` });

  await page.goto("/calendar");
  const table = page.getByRole("table", { name: "Posts in November 2026" });
  await expect(table.getByRole("link", { name: /Repeats every 2 weeks, 5 more times.*Tip 1/ })).toBeVisible();
  // The fifth post of the day sits behind "+2 more", whose rows carry the badge.
  await table.getByRole("button", { name: /^Show all 5 posts/ }).click();
  await expect(page.getByRole("dialog").getByTitle("Repeats every month")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/calendar-repeats.png` });
});
