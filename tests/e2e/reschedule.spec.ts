import { expect, test, type Page } from "@playwright/test";

// Drag to reschedule and "Move to..." on the calendar, and Duplicate. Fixed zone and clock: 10 November 2026, noon in Berlin.
test.use({ timezoneId: "Europe/Berlin" });
// Set SHOTS to a folder to save screenshots of the new UI.
const shots = process.env.SHOTS;

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "member" } };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const account = (id: string, provider: string, name: string) => ({
  id,
  provider,
  external_id: id,
  handle: null,
  display_name: name,
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  created_at: "2026-10-20T10:00:00Z",
});
const alice = account("c1", "bluesky", "Alice");
const threadsAcc = account("c2", "threads", "Alice on Threads");
const tiktokAcc = account("c8", "tiktok", "Alice on TikTok");
const tiktokSettings = { privacy_level: "SELF_ONLY", allow_comment: true, allow_duet: false, allow_stitch: false, commercial_content: false, your_brand: false, branded_content: false, ai_generated: true };
type Post = ReturnType<typeof post>;
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  social_set_id: "d",
  platform: "bluesky",
  body: `Body of ${id}`,
  media: [] as string[],
  thread: [] as { body: string; media: string[] }[],
  first_comment: null as string | null,
  cover: null as string | null,
  tiktok: null as unknown,
  youtube: null as unknown,
  status: "scheduled",
  scheduled_at: "2026-11-12T09:30:00Z" as string | null,
  published_at: null as string | null,
  error: null as string | null,
  created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [] as Record<string, unknown>[],
  lists: [] as { id: string; name: string; position: number }[],
  group_id: null as string | null,
  ...extra,
});

// The month's posts in `state`; PUT /v1/posts/{id} saves into it unless `refuse` answers for that id.
async function calendar(page: Page, state: Post[], refuse: Record<string, { status: number; json: unknown }> = {}) {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+01:00"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [alice, threadsAcc] }));
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.get("status") === "draft" ? [] : state }));
  const puts: { id: string; body: Record<string, unknown> }[] = [];
  await page.route(/\/v1\/posts\/[^/?]+$/, (route) => {
    const id = route.request().url().split("/").at(-1)!;
    if (route.request().method() !== "PUT") return route.fulfill({ json: state.find((p) => p.id === id) });
    const body = route.request().postDataJSON();
    puts.push({ id, body });
    if (refuse[id]) return route.fulfill(refuse[id]);
    state.splice(state.findIndex((p) => p.id === id), 1, { ...state.find((p) => p.id === id)!, ...body });
    return route.fulfill({ json: state.find((p) => p.id === id) });
  });
  await page.goto("/calendar");
  const table = page.getByRole("table", { name: "Posts in November 2026" });
  const cell = (day: number) => table.locator("td", { has: page.locator("p", { hasText: new RegExp(`^${day}$`) }) });
  return { puts, table, cell };
}

// What the editor would send for the unchanged post, as PUT replaces it whole.
const unchanged = (p: Post) => ({ social_set_id: p.social_set_id, platform: p.platform, body: p.body, media: p.media, thread: p.thread });

test("dragging a chip to another day moves every version of the post, keeping the rest of each", async ({ page }) => {
  const group = [
    post("g-b", { group_id: "g1", body: "Launch day", media: ["https://example.com/a.jpg"], thread: [{ body: "More", media: [] }] }),
    post("g-t", { group_id: "g1", platform: "threads", body: "Launch day on Threads", media: ["https://example.com/a.jpg"] }),
  ];
  const before = structuredClone(group);
  const { puts, table, cell } = await calendar(page, group);
  const chip = table.locator("li[data-movable]").filter({ hasText: "Launch day" });
  await expect(chip).toHaveCount(1);

  await chip.hover();
  await page.mouse.down();
  await cell(20).hover();
  await cell(20).hover({ position: { x: 20, y: 60 } });
  await expect(cell(20)).toHaveAttribute("data-drop", "ok");
  await expect(cell(5)).toHaveAttribute("data-drop", "no");
  await expect(cell(12)).toHaveAttribute("data-drop", "no");
  if (shots) await page.screenshot({ path: `${shots}/calendar-mid-drag.png` });
  await page.mouse.up();

  await expect(page.getByRole("status").filter({ hasText: "Moved to Fri, Nov 20, 10:30 AM." })).toBeVisible();
  expect(puts.map((p) => p.id)).toEqual(["g-b", "g-t"]);
  for (const [i, p] of before.entries()) {
    const { scheduled_at, ...rest } = puts[i]!.body;
    expect(scheduled_at).toBe("2026-11-20T09:30:00.000Z");
    expect(rest).toEqual(i === 0 ? unchanged(p) : { ...unchanged(p), thread: [] });
  }
  await expect(cell(20).getByRole("link", { name: /Launch day$/ })).toBeVisible();
  await expect(cell(12).getByRole("link", { name: /Launch day$/ })).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/calendar-moved.png` });
});

test.describe("with the browser in New York and the set in Sydney", () => {
  test.use({ timezoneId: "America/New_York" });
  test("posts sit on, drag to and Move to the set's days", async ({ page }) => {
    await page.route(/\/v1\/social-sets\/d\/queue$/, (route) => route.fulfill({ json: { time_zone: "Australia/Sydney", slots: [{ weekday: 1, time: "09:00" }], next: [] } }));
    // 09:00 on 12 November in Sydney is 17:00 on the 11th in New York.
    const { puts, table, cell } = await calendar(page, [post("p1", { body: "Launch day", scheduled_at: "2026-11-11T22:00:00Z" })]);
    await expect(cell(12).getByRole("link", { name: /Launch day$/ })).toBeVisible();
    await expect(cell(12)).toContainText("9:00");
    await table.getByRole("button", { name: "Move to... Launch day" }).click();
    const picker = page.getByRole("dialog", { name: "Move Launch day" });
    await expect(picker.getByLabel("New date")).toHaveValue("2026-11-12");
    await expect(picker.getByText("It keeps its time, 9:00 AM in Australia/Sydney.")).toBeVisible();
    await picker.getByRole("button", { name: "Cancel" }).click();
    await table.locator("li[data-movable]").dragTo(cell(20));
    await expect(page.getByRole("status").filter({ hasText: "Moved to Fri, Nov 20, 9:00 AM." })).toBeVisible();
    expect(puts[0]!.body.scheduled_at).toBe("2026-11-19T22:00:00.000Z");
    await expect(cell(20).getByRole("link", { name: /Launch day$/ })).toBeVisible();
    await expect(cell(19).getByRole("link")).toHaveCount(0);
  });
});

test("a move brain refuses goes back to its day and says why", async ({ page }) => {
  const { puts, table, cell } = await calendar(page, [post("p1", { body: "Launch day" })], { p1: { status: 422, json: { error: "not_editable" } } });
  await table.locator("li[data-movable]").dragTo(cell(20));
  await expect(page.getByRole("alert").filter({ hasText: "Not moved on Bluesky: This post is publishing or already went out" })).toBeVisible();
  expect(puts).toHaveLength(1);
  await expect(cell(12).getByRole("link", { name: /Launch day$/ })).toBeVisible();
  await expect(cell(20).getByRole("link")).toHaveCount(0);
});

test("a chip can't go to a past day, and only scheduled chips drag", async ({ page }) => {
  const { puts, table, cell } = await calendar(page, [
    post("p1", { body: "Launch day" }),
    post("p2", { status: "published", scheduled_at: "2026-11-03T08:00:00Z", published_at: "2026-11-03T08:00:00Z", body: "Out already" }),
  ]);
  await expect(table.locator("li").filter({ hasText: "Out already" })).not.toHaveAttribute("draggable", "true");
  await expect(table.getByRole("button", { name: "Move to... Out already" })).toHaveCount(0);
  await table.locator("li[data-movable]").dragTo(cell(5));
  await page.waitForTimeout(300);
  expect(puts).toHaveLength(0);
  await expect(cell(12).getByRole("link", { name: /Launch day$/ })).toBeVisible();
});

test("Move to... picks a day with the keyboard, from a chip and from a busy day's list", async ({ page }) => {
  const busy = Array.from({ length: 4 }, (_, i) => post(`p-${i}`, { scheduled_at: `2026-11-12T0${i + 1}:00:00Z`, body: `Busy post ${i}` }));
  const { puts, table } = await calendar(page, busy);

  await table.getByRole("button", { name: "Move to... Busy post 0" }).focus();
  await page.keyboard.press("Enter");
  const picker = page.getByRole("dialog", { name: "Move Busy post 0" });
  const date = picker.getByLabel("New date");
  await expect(date).toBeFocused();
  await expect(date).toHaveValue("2026-11-12");
  await date.fill("2026-11-01");
  await expect(picker.getByText("That is in the past. Pick a later day.")).toBeVisible();
  await expect(picker.getByRole("button", { name: "Move" })).toBeDisabled();
  await date.fill("2026-11-25");
  if (shots) await page.screenshot({ path: `${shots}/move-to-picker.png` });
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Moved to Wed, Nov 25, 2:00 AM." })).toBeVisible();
  expect(puts.at(-1)).toMatchObject({ id: "p-0", body: { scheduled_at: "2026-11-25T01:00:00.000Z", body: "Busy post 0" } });

  // Three are left on the 12th; add one more so the day has a "+N more" list.
  busy.push(post("p-9", { scheduled_at: "2026-11-12T09:00:00Z", body: "Busy post 9" }));
  await page.reload();
  await table.getByRole("button", { name: /^Show all 4 posts on/ }).click();
  const day = page.getByRole("dialog", { name: /Thursday, November 12/ });
  await expect(day.getByRole("link", { name: "Duplicate Busy post 9" })).toHaveAttribute("href", "/t/acme22/posts/new?from=p-9");
  await day.getByRole("button", { name: "Move to... Busy post 9" }).click();
  await page.getByRole("dialog", { name: "Move Busy post 9" }).getByLabel("New date").fill("2026-11-13");
  await page.getByRole("dialog", { name: "Move Busy post 9" }).getByRole("button", { name: "Move" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Moved to Fri, Nov 13, 10:00 AM." })).toBeVisible();
  expect(puts.at(-1)).toMatchObject({ id: "p-9", body: { scheduled_at: "2026-11-13T09:00:00.000Z" } });
});

test("Duplicate opens the composer with the post and its group, no time and no TikTok privacy, and saves a new post", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [alice, tiktokAcc] }));
  await page.route("**/v1/connections/c8/tiktok", (route) =>
    route.fulfill({ json: { nickname: "Ann Lee", username: "annlee", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], comment_disabled: false, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: 600, can_post: true, reason: null } }),
  );
  const video = "https://example.com/clip.mp4";
  const group = [
    post("g-b", { group_id: "g1", body: "Launch clip", media: [video], thread: [{ body: "Part two", media: [] }] }),
    post("g-k", { group_id: "g1", platform: "tiktok", body: "Launch clip for TikTok", media: [video], tiktok: tiktokSettings }),
  ];
  await page.route(/\/v1\/posts\?group_id=g1$/, (route) => route.fulfill({ json: group }));
  await page.route(/\/v1\/posts\/g-.$/, (route) => route.fulfill({ json: group.find((p) => route.request().url().endsWith(p.id)) }));
  const sent: { url: string; method: string; body: Record<string, unknown> }[] = [];
  await page.route(/\/v1\/(posts|post-groups)$/, (route) => {
    const body = route.request().postDataJSON();
    sent.push({ url: route.request().url(), method: route.request().method(), body });
    return route.fulfill({ status: 201, json: { group_id: "g2", posts: [post("n-b", { ...body, platform: "bluesky", status: "draft", scheduled_at: null })] } });
  });

  await page.goto("/posts/g-b");
  await page.getByRole("link", { name: "Duplicate" }).click();
  await expect(page).toHaveURL("/t/acme22/posts/new?from=g-b");
  await expect(page.getByText("Copied from Launch clip.")).toBeVisible();
  await expect(page.getByLabel("Post", { exact: true })).toHaveValue("Launch clip");
  await expect(page.getByRole("checkbox", { name: /Bluesky/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /TikTok/ })).toBeChecked();
  await expect(page.getByLabel("Publish at")).toHaveValue("");
  await page.getByRole("tab", { name: "TikTok" }).click();
  await expect(page.getByRole("textbox", { name: "TikTok text" })).toHaveValue("Launch clip for TikTok");
  await expect(page.getByLabel("Who can view this video")).toHaveValue("");
  await expect(page.getByLabel("This video is AI-generated")).toBeChecked();
  if (shots) await page.screenshot({ path: `${shots}/duplicate-composer.png`, fullPage: true });

  // TikTok's privacy has to be chosen again before anything is sent.
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose who can view the TikTok post." })).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.getByLabel("Who can view this video").selectOption("SELF_ONLY");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]!.method).toBe("POST");
  expect(sent[0]!.url).toMatch(/\/v1\/post-groups$/);
  expect(sent[0]!.body.scheduled_at ?? null).toBeNull();
  expect(sent[0]!.body).toMatchObject({ platforms: ["bluesky", "tiktok"], body: "Launch clip", media: [video], thread: [{ body: "Part two", media: [] }], tiktok: { privacy_level: "SELF_ONLY", ai_generated: true } });
  expect(sent[0]!.body.overrides).toMatchObject({ tiktok: { body: "Launch clip for TikTok" } });
});

test("Duplicate of a single post saves it with POST, not PUT, and the Posts list offers it per row", async ({ page }) => {
  const one = post("p1", { body: "Solo post", scheduled_at: "2026-11-12T09:30:00Z" });
  await calendar(page, [one]);
  await page.goto("/posts");
  await expect(page.getByRole("link", { name: "Duplicate Solo post" })).toHaveAttribute("href", "/t/acme22/posts/new?from=p1");
  const methods: string[] = [];
  let body: Record<string, unknown> = {};
  await page.route(/\/v1\/posts$/, (route) => {
    methods.push(route.request().method());
    body = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p2", { ...body, status: "draft", scheduled_at: null }) });
  });
  await page.getByRole("link", { name: "Duplicate Solo post" }).click();
  await expect(page.getByLabel("Post", { exact: true })).toHaveValue("Solo post");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL("/t/acme22/posts/p2");
  expect(methods).toEqual(["POST"]);
  expect(body.scheduled_at ?? null).toBeNull();
  expect(body).toMatchObject({ platform: "bluesky", body: "Solo post" });
});
