import { expect, test, type Page } from "@playwright/test";

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

async function brain(page: Page, role: Role) {
  const state = { list: [automation("a1", "Price to DM", { runs: stats })], bodies: [] as unknown[] };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [alice] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/automations", (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      state.bodies.push(req.postDataJSON());
      const made = automation("a2", req.postDataJSON().name, req.postDataJSON());
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
      return route.fulfill({ json: automation(id, req.postDataJSON().name, req.postDataJSON()) });
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
    await expect(page.getByRole("region", { name: "Start from a template" }).getByRole("link")).toHaveCount(6);
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

test("an automation with a trigger and steps this page doesn't know shows as made over the API and can't be edited", async ({ page }) => {
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
