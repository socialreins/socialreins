import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin" });

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role },
});
const alice = {
  id: "c1",
  provider: "bluesky",
  external_id: "did:plc:alice",
  handle: "alice.bsky.social",
  display_name: "Alice",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  dm_access: true,
  created_at: "2026-10-20T10:00:00Z",
};
const automation = (id: string, name: string, extra = {}) => ({
  id,
  name,
  active: true,
  activated_at: "2026-10-28T10:00:00Z",
  trigger: "comment_received",
  conditions: { social_set_id: null, account_ids: [], post_remote_ids: [], keywords: ["price", "link"], first_per_author: false },
  actions: [{ type: "send_dm", text: "Hi {name}, here it is" }],
  fallback_public_reply: "Check your DMs, {name}",
  created_by: "u-me",
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T10:00:00Z",
  ...extra,
});
const run = (id: string, status: string, reason: string | null, results: unknown[]) => ({
  id,
  automation_id: "a1",
  inbox_item_id: "p1",
  status,
  reason,
  results,
  created_at: "2026-10-29T10:00:00Z",
  updated_at: "2026-10-29T10:00:00Z",
});
const stats = { sent: 12, skipped: 3, failed: 1, running: 0, total: 16, count: 16, last_at: "2026-10-29T10:00:00Z" };
const runs = [
  run("r1", "sent", "dm_not_allowed", [
    { type: "send_dm", status: "skipped", reason: "dm_not_allowed", remote_id: null },
    { type: "fallback_public_reply", status: "sent", reason: null, remote_id: "at://x" },
  ]),
  run("r2", "skipped", "no_dm_access", [{ type: "send_dm", status: "skipped", reason: "no_dm_access", remote_id: null }]),
  run("r3", "skipped", "daily_cap", []),
];
const older = { ...run("r4", "failed", "meta_failed", [{ type: "send_dm", status: "failed", reason: "meta_failed", remote_id: null }]), inbox_item_id: "gone" };
const noScope = { social_set_id: null, account_ids: [] };

// As brain answers a save: a flow with `actions: []` and no fallback, a simple one with `steps: null`.
const answer = (body: { steps?: unknown }) => ({ ...(body.steps ? { actions: [], fallback_public_reply: null } : { steps: null }), ...body });
// A flow as brain stores it: no `buttons` on a DM without any.
const flowSteps = [
  { type: "send_dm", text: "Want the guide, {name}?", buttons: [{ label: "Yes please", payload: "guide_yes" }, { label: "No", payload: "no" }] },
  { type: "reply_publicly", text: "Check your DMs, {name}" },
  { type: "wait", minutes: 1440 },
  { type: "send_dm", text: "Still there?" },
];
const flowConditions = { social_set_id: null, account_ids: ["c1"], post_remote_ids: [], keywords: ["guide"], first_per_author: false };
const guideFlow = (extra = {}) => automation("flow", "Guide flow", { conditions: flowConditions, actions: [], fallback_public_reply: null, steps: flowSteps, ...extra });

async function brain(page: Page, role: Role) {
  const state = { list: [automation("a1", "Price to DM", { runs: stats })], bodies: [] as unknown[] };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [alice] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/automations", (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      state.bodies.push(req.postDataJSON());
      const made = automation("a2", req.postDataJSON().name, answer(req.postDataJSON()));
      state.list.push(made);
      return route.fulfill({ status: 201, json: made });
    }
    return route.fulfill({ json: state.list });
  });
  await page.route(/\/v1\/automations\/(a1|a2|flow)$/, (route) => {
    const req = route.request();
    const id = req.url().split("/").pop()!;
    if (req.method() === "DELETE") {
      state.list = state.list.filter((a) => a.id !== id);
      return route.fulfill({ status: 204 });
    }
    if (req.method() === "PUT") {
      state.bodies.push(req.postDataJSON());
      return route.fulfill({ json: automation(id, req.postDataJSON().name, answer(req.postDataJSON())) });
    }
    return route.fulfill({ json: state.list.find((a) => a.id === id) });
  });
  await page.route(/\/v1\/automations\/(a1|flow)\/(enable|disable)$/, (route) => {
    const [id, verb] = route.request().url().split("/").slice(-2);
    const at = state.list.findIndex((a) => a.id === id);
    state.list[at] = { ...state.list[at]!, active: verb === "enable" };
    return route.fulfill({ json: state.list[at] });
  });
  await page.route(/\/v1\/automations\/(a1|a2|flow)\/runs/, (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.includes("/a1/")) return route.fulfill({ json: { runs: [], next_cursor: null } });
    return route.fulfill({ json: url.searchParams.get("cursor") === "r3" ? { runs: [older], next_cursor: null } : { runs, next_cursor: "r3" } });
  });
  // Who a run answered comes from its inbox item.
  await page.route(/\/v1\/inbox-items\/[^/]+$/, (route) =>
    route.request().url().endsWith("/p1")
      ? route.fulfill({ json: { id: "p1", kind: "comment", author: { id: "did:plc:bob", handle: "bob.bsky.social", name: "Bob", avatar_url: null }, text: "price?", state: "open", replies: [] } })
      : route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
  return state;
}

test("lists automations with the trigger in words, keywords, stats and a switch", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(
    automation("a2", "Welcome", { trigger: "dm_received", conditions: { ...noScope, keywords: [], first_message: true }, fallback_public_reply: null, runs: { ...stats, sent: 0, skipped: 0, failed: 0, last_at: null } }),
    automation("a3", "Thanks for following", { trigger: "new_follower", conditions: noScope, fallback_public_reply: null, active: false }),
    automation("a4", "Mentions", { trigger: "mention_received", conditions: { ...noScope, keywords: [] }, actions: [{ type: "reply_publicly", text: "Thanks!" }], fallback_public_reply: null }),
  );
  await page.goto("/automations");
  const card = page.getByRole("listitem").filter({ hasText: "Price to DM" });
  await expect(card).toContainText("When someone comments");
  await expect(card.getByRole("list", { name: "Keywords" }).getByRole("listitem")).toHaveText(["price", "link"]);
  await expect(card).toContainText("All accounts. Sends a DM, or replies publicly if it can't.");
  const figures = card.getByRole("definition");
  await expect(figures).toHaveText(["12", "3", "1"]);
  await expect(card.getByRole("term")).toHaveText(["Sent", "Skipped", "Failed"]);
  await expect(card).toContainText("Last run");
  const welcome = page.getByRole("listitem").filter({ hasText: "Welcome" });
  await expect(welcome).toContainText("When someone sends a DM");
  await expect(welcome).toContainText("All accounts. First message only. Sends a DM.");
  await expect(welcome).toContainText("No runs yet");
  await expect(page.getByRole("listitem").filter({ hasText: "Thanks for following" })).toContainText("When someone follows you");
  await expect(page.getByRole("listitem").filter({ hasText: "Mentions" })).toContainText("When someone mentions you");
  await expect(page.getByRole("listitem").filter({ hasText: "Mentions" })).toContainText("All accounts. Replies publicly.");

  const toggle = card.getByRole("switch", { name: "Price to DM" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(figures).toHaveText(["12", "3", "1"]);
  expect(state.list[0]!.active).toBe(false);
});

test("members see automations but can't change them", async ({ page }) => {
  await brain(page, "member");
  await page.goto("/automations");
  await expect(page.getByText("Price to DM")).toBeVisible();
  await expect(page.getByRole("link", { name: "New automation" })).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await page.getByRole("link", { name: "Price to DM" }).click();
  await expect(page.getByRole("heading", { name: "Run history" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

// What each template sends when created as it opens: only the conditions and actions its trigger takes.
const templates = [
  { title: "Comment to DM", trigger: "comment_received", conditions: { ...noScope, keywords: ["link"], post_remote_ids: [], first_per_author: false }, actions: ["send_dm"] },
  { title: "DM keyword reply", trigger: "dm_received", conditions: { ...noScope, keywords: ["price"], first_message: false }, actions: ["send_dm"] },
  { title: "Welcome message", trigger: "dm_received", conditions: { ...noScope, keywords: [], first_message: true }, actions: ["send_dm"] },
  { title: "New follower DM", trigger: "new_follower", conditions: noScope, actions: ["send_dm"] },
  { title: "Mention reply", trigger: "mention_received", conditions: { ...noScope, keywords: [] }, actions: ["reply_publicly"] },
  { title: "Story reply", trigger: "story_reply", conditions: { ...noScope, keywords: [] }, actions: ["send_dm"] },
];
for (const t of templates) {
  test(`the ${t.title} template creates a ${t.trigger} automation`, async ({ page }) => {
    const state = await brain(page, "owner");
    await page.goto("/automations");
    await page.getByRole("link", { name: "New automation" }).click();
    await expect(page).toHaveURL("/t/acme22/automations/new");
    await expect(page.getByRole("heading", { name: "Start from a template" })).toBeVisible();
    // Seven templates and Start from scratch.
    await expect(page.getByRole("region", { name: "Start from a template" }).getByRole("link")).toHaveCount(8);
    await page.getByRole("link", { name: t.title }).click();
    await expect(page.getByLabel("Name")).toHaveValue(t.title);
    await page.getByRole("button", { name: "Create automation" }).click();
    await expect(page).toHaveURL("/t/acme22/automations/a2");
    const body = state.bodies[0] as { conditions: unknown; actions: { type: string; text: string }[] };
    expect(body).toMatchObject({ name: t.title, trigger: t.trigger, active: true, fallback_public_reply: null });
    expect(body.conditions).toEqual(t.conditions);
    expect(body.actions.map((a) => a.type)).toEqual(t.actions);
    expect(body.actions[0]!.text).toContain("{name}");
  });
}

test("the builder shows what the trigger takes, its networks note and a preview", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/automations/new?template=welcome");
  await expect(page.getByRole("group", { name: "When" }).getByRole("radio", { name: "When someone sends a DM" })).toBeChecked();
  const onlyIf = page.getByRole("group", { name: "Only if" });
  await expect(onlyIf.getByLabel("Only their first message ever")).toBeChecked();
  await expect(onlyIf.getByLabel("First comment per person only")).toHaveCount(0);
  await expect(onlyIf.getByLabel("Specific posts")).toHaveCount(0);
  const doThis = page.getByRole("group", { name: "Do this" });
  await expect(doThis.getByLabel("Public reply")).toHaveCount(0);
  await expect(doThis.getByRole("button", { name: "{page}" })).toHaveCount(0);
  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview).toContainText("Sam sent you a DM");
  await expect(preview).toContainText("Hi Sam, thanks for your message! We will get back to you soon.");

  await doThis.getByLabel("DM text").fill("Hello");
  await doThis.getByRole("button", { name: "{name}" }).click();
  await expect(doThis.getByLabel("DM text")).toHaveValue("Hello {name}");
  await expect(doThis.getByText("70 of 1000 characters")).toBeVisible();
  await expect(preview).toContainText("Hello Sam");

  await page.getByText("When someone follows you").click();
  await expect(page.getByText("Bluesky only.")).toBeVisible();
  await expect(onlyIf.getByRole("textbox", { name: "Contains" })).toHaveCount(0);
  await expect(preview).toContainText("Sam followed you");
  await page.getByText("When someone replies to your story").click();
  await expect(page.getByText("Instagram only, and still in testing.")).toBeVisible();
});

test("switching the trigger drops what the new one does not take, and says so", async ({ page }) => {
  const state = await brain(page, "admin");
  await page.goto("/automations/new?template=comment-to-dm");
  await page.getByLabel("Specific posts").check();
  await page.getByLabel("Post links").fill("https://bsky.app/profile/alice.bsky.social/post/3abc");
  await page.getByLabel("First comment per person only").check();
  await page.getByLabel("DM text").fill("Hi {name}, see {page}");
  await page.getByLabel("Public reply").fill("Sent you a DM!");
  await page.getByLabel("If the DM can't be delivered, reply publicly instead").check();
  await page.getByLabel("Fallback reply").fill("Follow us first");

  await page.getByText("When someone sends a DM").click();
  await expect(page.getByRole("status").filter({ hasText: "were removed" })).toHaveText(
    "This trigger doesn't take them, so they were removed: specific posts, first comment per person, public reply, fallback reply, {page} in the DM.",
  );
  await expect(page.getByLabel("Public reply")).toHaveCount(0);
  await expect(page.getByLabel("Specific posts")).toHaveCount(0);
  await expect(page.getByLabel("DM text")).toHaveValue("Hi {name}, see");
  await expect(page.getByRole("list", { name: "Contains" })).toContainText("link");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  expect(state.bodies[0]).toEqual({
    name: "Comment to DM",
    trigger: "dm_received",
    conditions: { ...noScope, keywords: ["link"], first_message: false },
    actions: [{ type: "send_dm", text: "Hi {name}, see" }],
    active: true,
    fallback_public_reply: null,
  });
});

test("creates a comment-to-DM automation with post links", async ({ page }) => {
  const state = await brain(page, "admin");
  await page.goto("/automations/new?template=comment-to-dm");
  await page.getByLabel("Name").fill("Guide");
  await page.getByRole("button", { name: "Remove link" }).click();
  await page.getByRole("textbox", { name: "Contains" }).fill("guide");
  await page.getByRole("textbox", { name: "Contains" }).press("Enter");
  await page.getByLabel("Specific posts").check();
  await page.getByLabel("Post links").fill("https://bsky.app/profile/alice.bsky.social/post/3abc\nhttps://bsky.app/profile/stranger.bsky.social/post/3def");
  await page.getByLabel("DM text").fill("Hi {name}, the guide: https://example.com");
  await expect(page.getByText("Hi Sam, the guide: https://example.com")).toBeVisible();
  await expect(page.getByText("99 of 1000 characters")).toBeVisible();
  await page.getByLabel("If the DM can't be delivered, reply publicly instead").check();
  await page.getByLabel("Fallback reply").fill("Sent you a DM!");
  await page.getByLabel("First comment per person only").check();
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "isn't a post" })).toContainText("stranger.bsky.social");
  await expect(page.getByLabel("Post links")).toBeFocused();
  expect(state.bodies).toHaveLength(0);
  await page.getByLabel("Post links").fill("https://bsky.app/profile/alice.bsky.social/post/3abc\nat://did:plc:bob/app.bsky.feed.post/3xyz");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  expect(state.bodies[0]).toEqual({
    name: "Guide",
    trigger: "comment_received",
    conditions: {
      social_set_id: null,
      account_ids: [],
      post_remote_ids: ["at://did:plc:alice/app.bsky.feed.post/3abc", "at://did:plc:bob/app.bsky.feed.post/3xyz"],
      keywords: ["guide"],
      first_per_author: true,
    },
    actions: [{ type: "send_dm", text: "Hi {name}, the guide: https://example.com" }],
    active: true,
    fallback_public_reply: "Sent you a DM!",
  });
});

test("detail shows stats and the run history with who, readable reasons and Load more", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/automations/a1");
  await expect(page.getByRole("region", { name: "Price to DM" }).getByLabel("Runs").getByRole("definition")).toHaveText(["12", "3", "1"]);
  const history = page.getByRole("region", { name: "Run history" });
  await expect(history.getByRole("columnheader")).toHaveText(["Status", "Who", "When", "What happened", "Inbox"]);
  const rows = history.getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText("Sent");
  await expect(rows.nth(1)).toContainText("Bob");
  await expect(rows.nth(1)).toContainText("They only accept DMs from people they follow");
  await expect(rows.nth(1)).toContainText("Fallback reply: sent");
  await expect(rows.nth(2)).toContainText("Skipped");
  await expect(rows.nth(2)).toContainText("Reconnect with an app password that allows DMs");
  await expect(rows.nth(3)).toContainText("The team reached 500 automation runs today");
  await expect(history.getByRole("link", { name: "Open in inbox" }).first()).toHaveAttribute("href", "/t/acme22/inbox?item=p1");

  await history.getByRole("button", { name: "Load more" }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(4)).toContainText("Failed");
  await expect(rows.nth(4)).toContainText("Meta refused it");
  // Its inbox item is gone, so nobody can be named.
  await expect(rows.nth(4)).toContainText("Unknown");
  await expect(history.getByRole("button", { name: "Load more" })).toHaveCount(0);

  // On a phone the table scrolls sideways inside its card; the page does not.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("editing keeps a fallback next to a public reply, then deletes", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/automations/a1");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("radio", { name: "When someone comments" })).toBeChecked();
  await expect(page.getByLabel("If the DM can't be delivered, reply publicly instead")).toBeChecked();
  await expect(page.getByLabel("Fallback reply")).toHaveValue("Check your DMs, {name}");
  await page.getByLabel("Public reply").fill("Thanks, {name}!");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies[0]).toMatchObject({
    trigger: "comment_received",
    actions: [
      { type: "send_dm", text: "Hi {name}, here it is" },
      { type: "reply_publicly", text: "Thanks, {name}!" },
    ],
    fallback_public_reply: "Check your DMs, {name}",
  });
  await expect(page.getByText("Sends a DM and replies publicly")).toBeVisible();
  // The saved answer has no run counts; the ones on screen stay.
  await expect(page.getByRole("region", { name: "Price to DM" }).getByLabel("Runs").getByRole("definition")).toHaveText(["12", "3", "1"]);

  // Opened again, both the reply and the fallback are there, and unticking the fallback drops only it.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Public reply")).toHaveValue("Thanks, {name}!");
  await page.getByLabel("If the DM can't be delivered, reply publicly instead").uncheck();
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies[1]).toMatchObject({ actions: [{ type: "send_dm" }, { type: "reply_publicly", text: "Thanks, {name}!" }], fallback_public_reply: null });

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL("/t/acme22/automations");
  await expect(page.getByText("No automations yet")).toBeVisible();
});

test("post ids the automation came with are saved as they are, whatever they look like", async ({ page }) => {
  const state = await brain(page, "owner");
  const ids = ["1234567890_987654321", "at://did:plc:bob/app.bsky.graph.list/3abc"];
  state.list[0] = automation("a1", "Price to DM", { conditions: { ...noScope, post_remote_ids: ids, keywords: ["price"], first_per_author: false }, runs: stats });
  await page.goto("/automations/a1");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Post links")).toHaveValue(ids.join("\n"));
  await page.getByLabel("Name").fill("Renamed");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies[0]).toMatchObject({ name: "Renamed", conditions: { post_remote_ids: ids } });

  // A line added by hand is still checked, and the old ones still pass.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Post links").fill(`${ids[0]}\n5550001_42\nhttps://bsky.app/profile/alice.bsky.social/post/3abc`);
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "isn't a post" })).toContainText("5550001_42");
  expect(state.bodies).toHaveLength(1);
  await page.getByLabel("Post links").fill(`${ids[0]}\nhttps://bsky.app/profile/alice.bsky.social/post/3abc`);
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies[1]).toMatchObject({ conditions: { post_remote_ids: [ids[0], "at://did:plc:alice/app.bsky.feed.post/3abc"] } });
});

test("a who lookup that failed is tried again on Load more, four at a time at most", async ({ page }) => {
  await brain(page, "owner");
  let calls = 0;
  let open = 0;
  let most = 0;
  await page.route(/\/v1\/inbox-items\/[^/]+$/, async (route) => {
    calls += 1;
    const first = calls === 1;
    most = Math.max(most, ++open);
    await new Promise((r) => setTimeout(r, 50));
    open -= 1;
    if (first) return route.fulfill({ status: 500, json: { error: "internal" } });
    return route.fulfill({ json: { id: "x", kind: "comment", author: { id: "did:plc:bob", handle: "bob.bsky.social", name: "Bob", avatar_url: null }, text: "", state: "open", replies: [] } });
  });
  // Twelve runs on twelve items, so the lookups would all start at once without a limit.
  await page.route(/\/v1\/automations\/a1\/runs/, (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.get("cursor")
        ? { runs: [older], next_cursor: null }
        : { runs: Array.from({ length: 12 }, (_, i) => ({ ...run(`r${i}`, "sent", null, []), inbox_item_id: `p${i}` })), next_cursor: "r11" },
    }),
  );
  await page.goto("/automations/a1");
  const rows = page.getByRole("region", { name: "Run history" }).getByRole("row");
  await expect(rows.filter({ hasText: "Bob" })).toHaveCount(11);
  await expect(rows.filter({ hasText: "Unknown" })).toHaveCount(1);
  expect(most).toBeLessThanOrEqual(4);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(rows.filter({ hasText: "Bob" })).toHaveCount(13);
  await expect(rows.filter({ hasText: "Unknown" })).toHaveCount(0);
  expect(most).toBeLessThanOrEqual(4);
});

test("an automation with a trigger and steps in a shape this page doesn't know shows as made over the API and can't be edited", async ({ page }) => {
  const state = await brain(page, "owner");
  const flow = {
    ...automation("flow", "Button flow", { trigger: "button_clicked", conditions: { button_id: "b1" }, actions: [], fallback_public_reply: null, runs: { ...stats, sent: 5, skipped: 0, failed: 0 } }),
    steps: [{ type: "send_dm", text: "Hi", buttons: [{ id: "b1", label: "More" }] }, { type: "wait", minutes: 5 }],
  };
  state.list.push(flow as unknown as (typeof state.list)[number]);
  await page.goto("/automations");
  await expect(page.getByRole("listitem").filter({ hasText: "Price to DM" })).toContainText("When someone comments");
  const card = page.getByRole("listitem").filter({ hasText: "Button flow" });
  await expect(card).toContainText("Made over the API");
  await expect(card.getByRole("definition")).toHaveText(["5", "0", "0"]);
  const toggle = card.getByRole("switch", { name: "Button flow" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await card.getByRole("link", { name: "Button flow" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/flow");
  const summary = page.getByRole("region", { name: "Button flow" });
  await expect(summary).toContainText("Made over the API");
  await expect(summary.getByRole("note")).toContainText("can't be edited here yet");
  await expect(summary.getByLabel("Runs").getByRole("definition")).toHaveText(["5", "0", "0"]);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run history" })).toBeVisible();
});

const step = (page: Page, n: number) => page.getByRole("group", { name: "Do this" }).getByRole("listitem", { name: new RegExp(`^Step ${n}:`) });

test("builds a flow of three steps with a wait and buttons, and saves steps without actions or a fallback", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/automations/new?template=dm-keyword");
  await page.getByLabel("Name").fill("Price flow");
  const doThis = page.getByRole("group", { name: "Do this" });
  await expect(doThis.getByRole("radio", { name: "One reply" })).toBeChecked();
  await doThis.getByLabel("DM text").fill("Hi {name}, want the price list?");
  await doThis.getByRole("radio", { name: "A flow of steps" }).check();
  // The DM became the first step, with nothing to warn about.
  await expect(doThis.getByRole("alert")).toHaveCount(0);
  await expect(step(page, 1).getByLabel("DM text")).toHaveValue("Hi {name}, want the price list?");
  // A DM trigger has no thread to reply under.
  await expect(doThis.getByRole("button", { name: "Reply publicly" })).toHaveCount(0);

  await step(page, 1).getByRole("button", { name: "Add a button" }).click();
  await expect(step(page, 1).getByLabel("Button 1 label")).toBeFocused();
  await page.keyboard.type("Yes, please!");
  await step(page, 1).getByRole("button", { name: "Add a button" }).click();
  await step(page, 1).getByLabel("Button 2 label").fill("No thanks");
  await step(page, 1).getByText("Advanced").first().click();
  await expect(step(page, 1).getByLabel("Payload").first()).toHaveValue("yes-please");
  // The labels go out with the text, so they count: 25 + 64 for {name}, plus "\n1. Yes, please!" and "\n2. No thanks".
  await expect(step(page, 1).getByText("118 of 1000 characters")).toBeVisible();

  await doThis.getByRole("button", { name: "Wait", exact: true }).click();
  await expect(step(page, 2).getByLabel("Wait for")).toBeFocused();
  await step(page, 2).getByLabel("Wait for").fill("2");
  await step(page, 2).getByLabel("Unit").selectOption("hours");
  await doThis.getByRole("button", { name: "Send a DM", exact: true }).click();
  await step(page, 3).getByLabel("DM text").fill("Still thinking, {name}?");
  // The same label again gets a payload of its own.
  await step(page, 3).getByRole("button", { name: "Add a button" }).click();
  await step(page, 3).getByLabel("Button 1 label").fill("Yes, please!");
  await expect(doThis.getByText("3 of 10 steps")).toBeVisible();
  await expect(doThis.getByRole("list", { name: "Good to know" })).toContainText("On Bluesky buttons are shown as numbered lines");
  await expect(doThis.getByRole("list", { name: "Good to know" })).toContainText("more than 24 hours after the person's last message is refused");

  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview).toContainText("Hi Sam, want the price list?");
  await expect(preview).toContainText("Wait 2 hours");
  await expect(preview).toContainText("Still thinking, Sam?");
  await expect(preview.getByRole("list", { name: "Buttons" }).first().getByRole("listitem")).toHaveText(["Yes, please!", "No thanks"]);
  await expect(preview).toContainText("On Bluesky the buttons show as numbered lines");

  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  expect(state.bodies[0]).toEqual({
    name: "Price flow",
    trigger: "dm_received",
    conditions: { ...noScope, keywords: ["price"], first_message: false },
    steps: [
      { type: "send_dm", text: "Hi {name}, want the price list?", buttons: [{ label: "Yes, please!", payload: "yes-please" }, { label: "No thanks", payload: "no-thanks" }] },
      { type: "wait", minutes: 120 },
      { type: "send_dm", text: "Still thinking, {name}?", buttons: [{ label: "Yes, please!", payload: "yes-please-2" }] },
    ],
    active: true,
  });
  expect(state.bodies[0]).not.toHaveProperty("actions");
  expect(state.bodies[0]).not.toHaveProperty("fallback_public_reply");
  const summary = page.getByRole("region", { name: "Price flow" });
  await expect(summary).toContainText("3 steps: DM, wait 2 hours, DM.");
  await expect(summary.getByRole("list", { name: "Steps" })).toContainText("Wait 2 hours");
});

test("a flow says what is wrong before it saves, and maps brain's refusals", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/automations/new?template=comment-to-dm");
  const doThis = page.getByRole("group", { name: "Do this" });
  await doThis.getByRole("radio", { name: "A flow of steps" }).check();
  await expect(doThis.getByRole("list", { name: "Good to know" })).toContainText("a flow started by a comment can send only one DM");
  await doThis.getByRole("button", { name: "Wait", exact: true }).click();
  await step(page, 2).getByLabel("Wait for").fill("8");
  await step(page, 1).getByRole("button", { name: "Add a button" }).click();
  // Nothing is said until a save is tried.
  await expect(doThis.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(doThis.getByRole("alert").filter({ hasText: "A flow can't end with a wait" })).toBeVisible();
  await expect(step(page, 1).getByRole("alert")).toHaveText("Give every button a label.");
  await expect(step(page, 2).getByRole("alert")).toHaveText("Wait between 1 minute and 7 days, as a whole number.");
  expect(state.bodies).toHaveLength(0);

  // Moving by keyboard keeps the focus on the step that moved.
  await step(page, 2).getByRole("button", { name: "Move step 2 up" }).focus();
  await page.keyboard.press("Enter");
  await expect(step(page, 1)).toHaveAccessibleName("Step 1: Wait");
  await expect(step(page, 1).getByRole("button", { name: "Move step 1 down" })).toBeFocused();
  await expect(step(page, 1).getByRole("button", { name: "Move step 1 up" })).toBeDisabled();
  await expect(doThis.getByRole("alert").filter({ hasText: "A flow can't start with a wait" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(step(page, 2)).toHaveAccessibleName("Step 2: Wait");
  await expect(step(page, 2).getByRole("button", { name: "Move step 2 up" })).toBeFocused();

  // Removing every step leaves nothing to send.
  await step(page, 2).getByRole("button", { name: "Remove step 2" }).click();
  await step(page, 1).getByRole("button", { name: "Remove step 1" }).click();
  await expect(doThis.getByRole("alert")).toHaveText("A flow needs at least one step that sends something. Add a DM.");
  await expect(doThis.getByRole("button", { name: "Send a DM", exact: true })).toBeFocused();

  // Ten steps at most.
  for (let n = 0; n < 10; n++) await doThis.getByRole("button", { name: "Reply publicly", exact: true }).click();
  await expect(doThis.getByText("10 of 10 steps")).toBeVisible();
  for (const name of ["Send a DM", "Reply publicly", "Wait"]) await expect(doThis.getByRole("button", { name, exact: true })).toBeDisabled();
  for (let n = 10; n > 1; n--) await step(page, n).getByRole("button", { name: `Remove step ${n}` }).click();
  await step(page, 1).getByLabel("Public reply").fill("Thanks, {name}!");
  await expect(doThis.getByRole("alert")).toHaveCount(0);

  // What brain still refuses reads in plain words.
  for (const [code, text] of [["invalid_steps", "A step does not work."], ["actions_and_steps", "one reply or a flow of steps, not both"]] as const) {
    await page.route("**/v1/automations", (route) => route.fulfill({ status: 422, json: { error: code } }), { times: 1 });
    await page.getByRole("button", { name: "Create automation" }).click();
    await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
  }
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  expect(state.bodies).toEqual([expect.objectContaining({ steps: [{ type: "reply_publicly", text: "Thanks, {name}!" }] })]);
});

test("switching between one reply and a flow converts what it can and warns before dropping", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/automations/new?template=comment-to-dm");
  const doThis = page.getByRole("group", { name: "Do this" });
  const one = doThis.getByRole("radio", { name: "One reply" });
  const flow = doThis.getByRole("radio", { name: "A flow of steps" });
  await doThis.getByLabel("DM text").fill("Hi {name}, here it is");
  await doThis.getByLabel("Public reply").fill("Sent you a DM!");
  await doThis.getByLabel("If the DM can't be delivered, reply publicly instead").check();
  await doThis.getByLabel("Fallback reply").fill("Follow us first");

  // A flow has no fallback, so it asks first and stays as it is until the answer.
  await flow.click();
  await expect(doThis.getByRole("alert")).toContainText("Switching drops: the fallback reply.");
  await expect(one).toBeChecked();
  await doThis.getByRole("button", { name: "Keep one reply" }).click();
  await expect(doThis.getByLabel("Fallback reply")).toHaveValue("Follow us first");
  await flow.click();
  await doThis.getByRole("button", { name: "Switch and drop them" }).click();
  await expect(flow).toBeChecked();
  await expect(step(page, 1).getByLabel("DM text")).toHaveValue("Hi {name}, here it is");
  await expect(step(page, 2).getByLabel("Public reply")).toHaveValue("Sent you a DM!");
  await expect(step(page, 3)).toHaveCount(0);

  // A DM and a public reply go back as they are, and forth again.
  await one.check();
  await expect(doThis.getByRole("alert")).toHaveCount(0);
  await expect(doThis.getByLabel("DM text")).toHaveValue("Hi {name}, here it is");
  await expect(doThis.getByLabel("Public reply")).toHaveValue("Sent you a DM!");
  await expect(doThis.getByLabel("If the DM can't be delivered, reply publicly instead")).not.toBeChecked();
  await flow.check();
  await expect(step(page, 2).getByLabel("Public reply")).toHaveValue("Sent you a DM!");

  // More than one reply can hold: it names what would go.
  await doThis.getByRole("button", { name: "Wait", exact: true }).click();
  await doThis.getByRole("button", { name: "Send a DM", exact: true }).click();
  await step(page, 4).getByLabel("DM text").fill("One more thing");
  await step(page, 4).getByRole("button", { name: "Add a button" }).click();
  await step(page, 4).getByLabel("Button 1 label").fill("Ok");
  await one.click();
  await expect(doThis.getByRole("alert")).toContainText("Switching drops: 1 wait, 1 button, 1 more DM.");
  await doThis.getByRole("button", { name: "Keep the flow" }).click();
  await expect(flow).toBeChecked();
  await expect(step(page, 4).getByLabel("DM text")).toHaveValue("One more thing");
  await one.click();
  await doThis.getByRole("button", { name: "Switch and drop them" }).click();
  await expect(one).toBeChecked();
  await expect(doThis.getByLabel("DM text")).toHaveValue("Hi {name}, here it is");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  expect(state.bodies[0]).toMatchObject({
    actions: [{ type: "send_dm", text: "Hi {name}, here it is" }, { type: "reply_publicly", text: "Sent you a DM!" }],
    fallback_public_reply: null,
  });
  expect(state.bodies[0]).not.toHaveProperty("steps");
});

test("a flow shows its steps on the card, opens in the editor and saves unchanged", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow({ runs: { ...stats, waiting: 2 } }));
  await page.goto("/automations");
  const card = page.getByRole("listitem").filter({ hasText: "Guide flow" });
  await expect(card).toContainText("Alice. 4 steps: DM, public reply, wait 1 day, DM.");
  await expect(card.getByRole("term")).toHaveText(["Sent", "Skipped", "Failed", "Waiting"]);
  await expect(card.getByRole("definition")).toHaveText(["12", "3", "1", "2"]);
  // Nothing waits on a simple automation, so its card has no Waiting figure.
  await expect(page.getByRole("listitem").filter({ hasText: "Price to DM" }).getByRole("term")).toHaveText(["Sent", "Skipped", "Failed"]);

  await card.getByRole("link", { name: "Guide flow" }).click();
  const summary = page.getByRole("region", { name: "Guide flow" });
  await expect(summary.getByRole("note")).toHaveCount(0);
  await expect(summary.getByRole("list", { name: "Steps" }).locator("> li")).toHaveText([/Send a DM.*Want the guide, \{name\}\?.*Yes please.*No/, /Reply publicly/, "Wait 1 day", /Send a DM.*Still there\?/]);
  await page.getByRole("button", { name: "Edit" }).click();
  const doThis = page.getByRole("group", { name: "Do this" });
  await expect(doThis.getByRole("radio", { name: "A flow of steps" })).toBeChecked();
  await expect(step(page, 1).getByLabel("Button 1 label")).toHaveValue("Yes please");
  await expect(step(page, 3).getByLabel("Wait for")).toHaveValue("1");
  await expect(step(page, 3).getByLabel("Unit")).toHaveValue("days");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies[0]).toEqual({ name: "Guide flow", trigger: "comment_received", conditions: flowConditions, steps: flowSteps, active: true });

  // A new label leaves the payload the flow came with, since a follow-up may listen for it.
  await page.getByRole("button", { name: "Edit" }).click();
  await step(page, 1).getByLabel("Button 1 label").fill("Send it");
  await page.getByRole("button", { name: "Save automation" }).click();
  // Two people wait in this flow, and a new label is a new step.
  await page.getByRole("alertdialog").getByRole("button", { name: "Save and stop them" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies[1]).toMatchObject({ steps: [{ buttons: [{ label: "Send it", payload: "guide_yes" }, { label: "No", payload: "no" }] }, {}, {}, {}] });
});

test("a button's follow-up link opens the builder on the button trigger with its payload and scope", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow());
  await page.goto("/automations/flow");
  await page.getByRole("button", { name: "Edit" }).click();
  const link = step(page, 1).getByRole("link", { name: /When clicked: create a follow-up automation for Yes please/ });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("href", "/t/acme22/automations/new?template=button-follow-up&payload=guide_yes&accounts=c1");

  await page.goto((await link.getAttribute("href"))!);
  await expect(page.getByRole("radio", { name: "When someone taps a button" })).toBeChecked();
  await expect(page.getByText("Facebook and Instagram only.")).toBeVisible();
  const onlyIf = page.getByRole("group", { name: "Only if" });
  await expect(onlyIf.getByRole("list", { name: "Button payloads" }).getByRole("listitem")).toHaveText(["guide_yes"]);
  await expect(onlyIf.getByRole("textbox", { name: "Contains" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Preview" })).toContainText("Sam tapped a button");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  expect(state.bodies[0]).toEqual({
    name: "Button follow-up",
    trigger: "button_clicked",
    conditions: { social_set_id: null, account_ids: ["c1"], payloads: ["guide_yes"] },
    actions: [{ type: "send_dm", text: "Thanks, {name}! Here is more: " }],
    active: true,
    fallback_public_reply: null,
  });
  // The saved one opens in the editor too, with its payloads on the card.
  const summary = page.getByRole("region", { name: "Button follow-up" });
  await expect(summary).toContainText("When someone taps a button");
  await expect(summary.getByRole("list", { name: "Button payloads" }).getByRole("listitem")).toHaveText(["guide_yes"]);
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("the Button follow-up template needs a payload, typed as a chip", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/automations/new");
  await page.getByRole("link", { name: "Button follow-up" }).click();
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add at least one button payload." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Button payloads" })).toBeFocused();
  expect(state.bodies).toHaveLength(0);
  await page.keyboard.type("Yes Please");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Button payloads" }).getByRole("listitem")).toHaveText(["yes-please"]);
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  expect(state.bodies[0]).toMatchObject({ trigger: "button_clicked", conditions: { ...noScope, payloads: ["yes-please"] } });
});

test("run history shows a waiting run with its time and step, and a stopped one in plain words", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow({ runs: { ...stats, waiting: 1 } }));
  const sent = { type: "send_dm", status: "sent", reason: null, remote_id: "m1" };
  await page.route(/\/v1\/automations\/flow\/runs/, (route) =>
    route.fulfill({
      json: {
        runs: [
          { ...run("w1", "waiting", null, [sent, { ...sent, type: "reply_publicly" }]), step_index: 2, resume_at: "2026-10-30T10:00:00Z" },
          { ...run("w2", "skipped", "automation_changed", [sent]), step_index: 2, resume_at: null },
          { ...run("w3", "sent", null, [sent, sent]), step_index: 3, resume_at: null },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.goto("/automations/flow");
  await expect(page.getByRole("region", { name: "Guide flow" }).getByLabel("Runs").getByRole("term")).toHaveText(["Sent", "Skipped", "Failed", "Waiting"]);
  const rows = page.getByRole("region", { name: "Run history" }).getByRole("row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1).getByRole("cell").first()).toHaveText("Waiting");
  await expect(rows.nth(1)).toContainText("Waiting until");
  await expect(rows.nth(1).locator("time[datetime='2026-10-30T10:00:00Z']")).toBeVisible();
  await expect(rows.nth(1)).toContainText("Step 3 of 4");
  await expect(rows.nth(1)).toContainText("Public reply: sent");
  await expect(rows.nth(2)).toContainText("Skipped");
  await expect(rows.nth(2)).toContainText("Stopped: the automation was changed or switched off before the flow finished");
  await expect(rows.nth(3)).toContainText("Step 4 of 4");
});

test("run history says in plain words what happened to a tag", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow());
  const sent = { type: "send_dm", status: "sent", reason: null, remote_id: "m1" };
  const tag = (status: string, why: string | null) => ({ type: "tag_contact", status, reason: why, remote_id: null });
  await page.route(/\/v1\/automations\/flow\/runs/, (route) =>
    route.fulfill({
      json: {
        runs: [
          run("t1", "sent", null, [sent, tag("done", null)]),
          run("t2", "sent", null, [sent, tag("skipped", "already_tagged")]),
          run("t3", "sent", null, [sent, tag("skipped", "tag_limit")]),
          run("t4", "sent", null, [sent, tag("skipped", "no_contact")]),
        ],
        next_cursor: null,
      },
    }),
  );
  await page.goto("/automations/flow");
  const history = page.getByRole("region", { name: "Run history" });
  await expect(history.getByRole("row")).toHaveCount(5);
  for (const said of [
    "Tag: done",
    "Tag: skipped (They already had this tag)",
    "Tag: skipped (The contact already has 20 tags, the most allowed)",
    "Tag: skipped (There is no contact behind this item to tag)",
  ])
    await expect(history.getByRole("listitem").filter({ hasText: said })).toHaveCount(1);
});

test("the list shows skeleton cards while it loads, then the cards with a bar of the shares", async ({ page }) => {
  await brain(page, "owner");
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/v1/automations", async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto("/automations");
  await expect(page.getByRole("status").filter({ hasText: "Loading automations..." })).toBeAttached();
  await expect(page.locator(".skeleton").first()).toBeVisible();
  await expect(page.getByText("Price to DM")).toHaveCount(0);
  release();
  const card = page.getByRole("listitem").filter({ hasText: "Price to DM" });
  await expect(card).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
  await expect(card.getByRole("img", { name: "75% sent, 19% skipped, 6% failed" })).toBeVisible();
  await expect(card.locator("time")).toHaveAttribute("datetime", stats.last_at);
  // A failure in its runs marks the card, with a way to the failed runs.
  await card.getByRole("link", { name: "1 failed run: see why" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a1?runs=failed");
  await expect(page.getByRole("list", { name: "Show runs" }).getByRole("button", { name: "Failed" })).toHaveAttribute("aria-pressed", "true");
});

test("the switch flips at once and goes back when brain refuses", async ({ page }) => {
  const state = await brain(page, "owner");
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/v1\/automations\/a1\/disable$/, async (route) => {
    await gate;
    await route.fulfill({ status: 500, json: { error: "internal" } });
  });
  await page.goto("/automations");
  const card = page.getByRole("listitem").filter({ hasText: "Price to DM" });
  const toggle = card.getByRole("switch", { name: "Price to DM" });
  await toggle.click();
  // Off on screen while brain has not answered yet.
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(card.getByRole("alert")).toHaveCount(0);
  release();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(card.getByRole("alert")).toContainText("Not switched.");
  expect(state.list[0]!.active).toBe(true);

  // The menu's Turn off is the same switch, and this time brain takes it.
  await page.unroute(/\/v1\/automations\/a1\/disable$/);
  await card.getByLabel("Actions for Price to DM").click();
  await card.getByRole("button", { name: "Turn off" }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(card.getByRole("status").filter({ hasText: "Price to DM is off." })).toBeAttached();
  await expect(card.getByRole("alert")).toHaveCount(0);
  expect(state.list[0]!.active).toBe(false);
});

test("a card's menu closes on Escape, duplicates into a prefilled builder that saves a new one switched off, and deletes after a confirm", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow({ runs: stats }));
  await page.goto("/automations");
  // The copy made below is called "Guide flow (copy)", so the original goes by its exact name.
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Guide flow", exact: true }) });
  const menu = card.getByLabel("Actions for Guide flow", { exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(card.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/t/acme22/automations/flow?edit=1");
  await page.keyboard.press("Escape");
  await expect(card.getByRole("link", { name: "Duplicate" })).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await card.getByRole("link", { name: "Duplicate" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/new?from=flow");
  await expect(page.getByLabel("Name")).toHaveValue("Guide flow (copy)");
  await expect(page.getByRole("switch", { name: "On" })).toHaveAttribute("aria-checked", "false");
  await expect(step(page, 1).getByLabel("Button 1 label")).toHaveValue("Yes please");
  await expect(step(page, 3).getByLabel("Wait for")).toHaveValue("1");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  // One save, a create: the original is untouched and the copy's buttons have payloads of their own.
  expect(state.bodies).toEqual([
    {
      name: "Guide flow (copy)",
      trigger: "comment_received",
      conditions: flowConditions,
      steps: [{ ...flowSteps[0], buttons: [{ label: "Yes please", payload: "guide_yes-2" }, { label: "No", payload: "no-2" }] }, ...flowSteps.slice(1)],
      active: false,
    },
  ]);
  expect(state.list.map((a) => a.id)).toEqual(["a1", "flow", "a2"]);

  await page.goto("/automations");
  await menu.click();
  await card.getByRole("button", { name: "Delete" }).click();
  await expect(card.getByRole("button", { name: "Yes, delete" })).toBeFocused();
  expect(state.list).toHaveLength(3);
  await page.keyboard.press("Enter");
  await expect(card).toHaveCount(0);
  expect(state.list.map((a) => a.id)).toEqual(["a1", "a2"]);
});

test("more than six automations get filter chips: all, on, off and by trigger", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/automations");
  await expect(page.getByRole("list", { name: "Show" })).toHaveCount(0);
  for (let n = 2; n <= 7; n++) state.list.push(automation(`x${n}`, `Extra ${n}`, n === 7 ? { active: false, trigger: "dm_received", conditions: { ...noScope, keywords: [], first_message: false } } : {}));
  await page.reload();
  const chips = page.getByRole("list", { name: "Show" });
  await expect(chips.getByRole("button")).toHaveText(["All7", "On6", "Off1", "Comments6", "DMs1"]);
  const cards = page.locator("ul > li.card");
  await expect(cards).toHaveCount(7);
  await chips.getByRole("button", { name: "Off" }).click();
  await expect(cards).toHaveText([/Extra 7/]);
  await chips.getByRole("button", { name: "Comments" }).click();
  await expect(cards).toHaveCount(6);
});

test("the gallery groups the templates, marks the popular ones and the networks, and starts from scratch", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list = [];
  // With no automation yet the list page is the gallery itself.
  await page.goto("/automations");
  await expect(page.getByText("No automations yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start from scratch" })).toBeVisible();

  await page.goto("/automations/new");
  const groups = { "Reply to comments": ["Comment to DM"], "Reply to DMs": ["DM keyword reply", "Welcome message"], Grow: ["New follower DM", "Mention reply", "Story reply"], "Follow up": ["Button follow-up"] };
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([...Object.keys(groups), "Your own"]);
  for (const [group, titles] of Object.entries(groups)) await expect(page.getByRole("region", { name: group }).getByRole("link").locator("strong")).toHaveText(titles);
  await expect(page.getByRole("link").filter({ hasText: "Popular" }).locator("strong")).toHaveText(["Comment to DM", "Welcome message"]);
  await expect(page.getByRole("link", { name: "Story reply" })).toContainText("Works on Instagram");
  await expect(page.getByRole("link", { name: "Button follow-up" })).toContainText("Works on Facebook, Instagram");

  await page.getByRole("link", { name: "Start from scratch" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/new?template=blank");
  await expect(page.getByLabel("Name")).toHaveValue("");
  await expect(page.getByRole("radio", { name: "When someone comments" })).toBeChecked();
  // The bar counts what is missing and jumps to the first of it.
  await page.getByRole("button", { name: "2 problems" }).click();
  await expect(page.getByLabel("Name")).toBeFocused();
  await page.getByLabel("Name").fill("My own");
  await page.getByRole("button", { name: "1 problem" }).click();
  await expect(page.getByLabel("DM text")).toBeFocused();
  await page.getByLabel("DM text").fill("Hello {name}");
  await expect(page.getByRole("button", { name: /problem/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/t/acme22/automations/a2");
  expect(state.bodies[0]).toMatchObject({ name: "My own", trigger: "comment_received", actions: [{ type: "send_dm", text: "Hello {name}" }], active: true });
});

test("a step inserted between two steps is saved at that place", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow());
  await page.goto("/automations/flow?edit=1");
  const doThis = page.getByRole("group", { name: "Do this" });
  await expect(doThis.getByRole("listitem", { name: /^Step \d+:/ })).toHaveCount(4);
  // After the last step there is the Add step row, so no insert there.
  await expect(doThis.getByLabel(/^Insert a step after step/)).toHaveCount(3);
  await doThis.getByLabel("Insert a step after step 1").click();
  await doThis.getByRole("button", { name: "Tag the contact" }).first().click();
  await expect(step(page, 2)).toHaveAccessibleName("Step 2: Tag the contact");
  await expect(step(page, 2).getByLabel("Tag")).toBeFocused();
  await page.keyboard.type("Asked");
  await expect(step(page, 3)).toHaveAccessibleName("Step 3: Reply publicly");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect((state.bodies[0] as { steps: unknown[] }).steps).toEqual([flowSteps[0], { type: "tag_contact", tag: "asked" }, flowSteps[1], flowSteps[2], flowSteps[3]]);
  // The saved flow reads as a timeline: the trigger, then each step, the wait as a pill.
  await expect(page.getByRole("region", { name: "Guide flow" }).getByRole("list", { name: "Steps" }).locator("> li")).toHaveText([/Send a DM/, /Tag the contact.*asked/, /Reply publicly/, "Wait 1 day", /Send a DM/]);
});

test("a problem shows on its step and in the summary under the flow", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/automations/new?template=dm-keyword");
  const doThis = page.getByRole("group", { name: "Do this" });
  await doThis.getByRole("radio", { name: "A flow of steps" }).check();
  await doThis.getByRole("button", { name: "Tag the contact", exact: true }).click();
  await page.getByRole("button", { name: "1 problem" }).click();
  await expect(step(page, 2).getByRole("alert")).toHaveText("Write the tag: 1 to 30 characters, no commas.");
  await expect(step(page, 2).getByLabel("Tag")).toBeFocused();
  await step(page, 1).getByLabel("DM text").focus();
  await doThis.getByRole("list", { name: "Problems in the steps" }).getByRole("button", { name: "Step 2: Write the tag: 1 to 30 characters, no commas." }).click();
  await expect(step(page, 2).getByLabel("Tag")).toBeFocused();
});

test("saving changed steps asks first when people wait in the flow, and only then", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow({ runs: { ...stats, waiting: 2 } }));
  await page.goto("/automations/flow?edit=1");
  // A new name leaves the steps alone, so nothing is asked.
  await page.getByLabel("Name").fill("Guide flow 2");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies).toHaveLength(1);

  await page.getByRole("button", { name: "Edit" }).click();
  await step(page, 4).getByLabel("DM text").fill("Still there, {name}?");
  await page.getByRole("button", { name: "Save automation" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("2 people are waiting in this flow. Saving new steps stops those runs.");
  await expect(ask.getByRole("button", { name: "Save and stop them" })).toBeFocused();
  expect(state.bodies).toHaveLength(1);
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole("button", { name: "Save automation" }).click();
  await ask.getByRole("button", { name: "Save and stop them" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies[1]).toMatchObject({ steps: [{}, {}, {}, { type: "send_dm", text: "Still there, {name}?" }] });
});

test("a flow nobody waits in saves changed steps without asking", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow({ runs: stats }));
  await page.goto("/automations/flow?edit=1");
  await step(page, 4).getByLabel("DM text").fill("Hello again");
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies).toHaveLength(1);
});

test("leaving the builder with unsaved changes asks first", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/automations/new?template=welcome");
  const unload = () =>
    page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  await expect(page.getByLabel("Name")).toHaveValue("Welcome message");
  expect(await unload()).toBe(false);
  await page.getByLabel("Name").fill("Hello there");
  expect(await unload()).toBe(true);

  const asked: string[] = [];
  page.once("dialog", (d) => {
    asked.push(d.message());
    d.dismiss();
  });
  await page.getByRole("main").getByRole("link", { name: "Templates" }).click();
  expect(asked).toEqual(["Leave without saving? Your changes to this automation will be lost."]);
  await expect(page).toHaveURL("/t/acme22/automations/new?template=welcome");
  await expect(page.getByLabel("Name")).toHaveValue("Hello there");

  // Cancel asks the same, and a yes leaves.
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Hello there");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("main").getByRole("link", { name: "Templates" }).click();
  await expect(page.getByRole("heading", { name: "Start from a template" })).toBeVisible();
});

test("run history filters the loaded runs by chips and says why where it can", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/automations/a1");
  const history = page.getByRole("region", { name: "Run history" });
  const chips = history.getByRole("list", { name: "Show runs" });
  const rows = history.getByRole("row");
  await expect(chips.getByRole("button")).toHaveText(["All3", "Sent1", "Skipped2", "Failed0", "Waiting0"]);
  await expect(rows.nth(1)).toContainText("Why: This person does not accept DMs from accounts they don't follow.");
  await expect(rows.nth(3)).toContainText("Why: A team's automations run at most 500 times a day.");
  await chips.getByRole("button", { name: "Skipped" }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("Reconnect with an app password that allows DMs");
  await chips.getByRole("button", { name: "Failed" }).click();
  await expect(history.getByText("No failed runs among the 3 loaded. Load more to look further back.")).toBeVisible();
  await expect(history.getByRole("table")).toBeHidden();
  // The filter stays as more runs load.
  await history.getByRole("button", { name: "Load more" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("Meta refused it");
  // A reason with nothing more to say has no hint.
  await expect(rows.nth(1)).not.toContainText("Why:");
  await expect(chips.getByRole("button", { name: "All" })).toHaveText("All4");
});

test("the automation pages have no sideways scroll on a 375 wide phone", async ({ page }) => {
  const state = await brain(page, "owner");
  state.list.push(guideFlow({ runs: { ...stats, waiting: 2 } }));
  await page.setViewportSize({ width: 375, height: 800 });
  const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.goto("/automations");
  await expect(page.getByText("Guide flow")).toBeVisible();
  await fits();
  await page.getByLabel("Actions for Guide flow").click();
  await expect(page.getByRole("link", { name: "Duplicate" })).toBeVisible();
  await fits();
  await page.goto("/automations/new");
  await expect(page.getByRole("link", { name: "Start from scratch" })).toBeVisible();
  await fits();
  await page.goto("/automations/flow");
  await expect(page.getByRole("heading", { name: "Run history" })).toBeVisible();
  await fits();
  await page.goto("/automations/flow?edit=1");
  await expect(step(page, 3).getByLabel("Wait for")).toBeVisible();
  await fits();
  await page.getByLabel("Insert a step after step 1").click();
  await expect(page.getByRole("button", { name: "Tag the contact" }).first()).toBeVisible();
  await fits();
});
