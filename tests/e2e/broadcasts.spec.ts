import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin", locale: "en-US" });

const me = { id: "u-me", email: "me@example.com", name: "Mira", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const counts = (sent = 0, skipped = 0, failed = 0, pending = 0) => ({ total: sent + skipped + failed + pending, sent, skipped, failed, pending });
const broadcast = (id: string, name: string, extra = {}) => ({
  id,
  name,
  text: "Hi {name}, our spring offer is live.",
  tag: "vip",
  platform: null as string | null,
  status: "draft",
  pause_reason: null as string | null,
  counts: counts(),
  created_by: "u-me",
  created_at: ago(120),
  started_at: null as string | null,
  finished_at: null as string | null,
  ...extra,
});
const preview = (reachable = 12, extra = {}) => ({
  total: 20,
  reachable,
  by_reason: { opted_out: 1, outside_window: 5, no_conversation: 0, account_disconnected: 2, recently_messaged: 0 },
  by_platform: [
    { platform: "bluesky", reachable: reachable - 4 },
    { platform: "instagram", reachable: 4 },
  ],
  sample: [
    { contact_id: "k1", display_name: "Bob", platform: "bluesky" },
    { contact_id: "k2", display_name: "Cara", platform: "instagram" },
  ],
  ...extra,
});
const nobody = { total: 8, reachable: 0, by_reason: { opted_out: 2, outside_window: 6, no_conversation: 0, account_disconnected: 0, recently_messaged: 0 }, by_platform: [], sample: [] };
const recipient = (id: string, name: string, status: string, reason: string | null = null, platform = "bluesky") => ({
  id,
  contact_id: `k-${id}`,
  display_name: name,
  handle: `${name.toLowerCase()}.example`,
  platform,
  status,
  reason,
  updated_at: ago(3),
});
const contact = (id: string, name: string, extra = {}) => ({
  id,
  platform: "bluesky",
  external_id: `did:plc:${id}`,
  handle: `${name.toLowerCase()}.bsky.social`,
  display_name: name,
  avatar_url: null,
  tags: ["vip"],
  notes: null,
  opted_out: false,
  first_seen_at: "2026-10-01T10:00:00Z",
  last_seen_at: ago(30),
  items_count: 3,
  ...extra,
});

const draft = broadcast("b-draft", "Spring offer");
const sending = broadcast("b-sending", "Launch day", { status: "sending", counts: counts(10, 4, 1, 5), started_at: ago(20) });
const paused = broadcast("b-paused", "Weekend sale", { status: "paused", pause_reason: "Instagram said: too many messages, slow down", platform: "instagram", counts: counts(6, 2, 1, 11), started_at: ago(45) });
const sent = broadcast("b-sent", "Thank you note", { status: "sent", counts: counts(30, 3, 0, 0), started_at: ago(600), finished_at: ago(580) });

// A small in-memory brain for broadcasts, and the contacts beside them.
async function brain(page: Page, role = "owner", list = [draft, sending, paused, sent]) {
  const state = {
    broadcasts: list.map((b) => ({ ...b })),
    preview: preview() as ReturnType<typeof preview> | typeof nobody,
    // What /send answers with next: a new preview makes it 409 audience_changed.
    changedTo: null as ReturnType<typeof preview> | null,
    recipients: [recipient("r1", "Bob", "sent"), recipient("r2", "Cara", "skipped", "outside_window", "instagram"), recipient("r3", "Dana", "failed", "interrupted"), recipient("r4", "Eli", "pending"), recipient("r5", "Finn", "skipped", "opted_out")],
    contacts: [contact("k1", "Bob"), contact("k2", "Cara", { opted_out: true })],
    created: [] as unknown[],
    updated: [] as unknown[],
    sends: [] as unknown[],
    previews: 0,
    posts: [] as string[],
    deleted: [] as string[],
    recipientQueries: [] as string[],
    patches: [] as unknown[],
  };
  const parts = (url: string) => new URL(url).pathname.split("/");
  await page.route("**/auth/me", (route) => route.fulfill({ json: { ...me, current_team: { ...me.current_team, role } } }));
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [me.current_team] }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/contact-tags", (route) =>
    route.fulfill({
      json: [
        { tag: "vip", count: 20 },
        { tag: "lead", count: 1 },
      ],
    }),
  );
  await page.route(/\/v1\/contacts(\?.*)?$/, (route) => route.fulfill({ json: { items: state.contacts, next_cursor: null } }));
  await page.route(/\/v1\/contacts\/[^/?]+$/, (route) => {
    const req = route.request();
    const found = state.contacts.find((c) => c.id === parts(req.url()).pop())!;
    if (req.method() === "PATCH") {
      state.patches.push(req.postDataJSON());
      Object.assign(found, req.postDataJSON());
      return route.fulfill({ json: found });
    }
    return route.fulfill({ json: { ...found, recent: [] } });
  });
  await page.route(/\/v1\/broadcasts$/, (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fulfill({ json: state.broadcasts });
    state.created.push(req.postDataJSON());
    const made = broadcast("b-new", "", req.postDataJSON());
    state.broadcasts.unshift(made);
    return route.fulfill({ status: 201, json: made });
  });
  await page.route(/\/v1\/broadcasts\/[^/?]+$/, (route) => {
    const req = route.request();
    const found = state.broadcasts.find((b) => b.id === parts(req.url()).pop());
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (req.method() === "PUT") {
      state.updated.push(req.postDataJSON());
      Object.assign(found, req.postDataJSON());
    }
    if (req.method() === "DELETE") {
      state.deleted.push(found.id);
      state.broadcasts = state.broadcasts.filter((b) => b !== found);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: found });
  });
  await page.route(/\/v1\/broadcasts\/[^/]+\/(preview|send|cancel|resume)$/, (route) => {
    const req = route.request();
    const [id, action] = parts(req.url()).slice(-2);
    const found = state.broadcasts.find((b) => b.id === id)!;
    state.posts.push(action);
    if (action === "preview") {
      state.previews += 1;
      return route.fulfill({ json: state.preview });
    }
    if (action === "send") {
      state.sends.push(req.postDataJSON());
      if (state.changedTo) {
        state.preview = state.changedTo;
        state.changedTo = null;
        return route.fulfill({ status: 409, json: { error: "audience_changed", preview: state.preview } });
      }
      Object.assign(found, { status: "sending", started_at: new Date().toISOString(), counts: counts(0, 0, 0, state.preview.reachable) });
    }
    if (action === "cancel") Object.assign(found, { status: "cancelled", pause_reason: null, finished_at: new Date().toISOString(), counts: counts(found.counts.sent, found.counts.skipped + found.counts.pending, found.counts.failed, 0) });
    if (action === "resume") Object.assign(found, { status: "sending", pause_reason: null });
    return route.fulfill({ json: found });
  });
  await page.route(/\/v1\/broadcasts\/[^/]+\/recipients(\?.*)?$/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    state.recipientQueries.push(q.toString());
    const hit = state.recipients.filter((r) => !q.get("status") || r.status === q.get("status"));
    // Two pages of the unfiltered list: the first three, then the rest.
    if (q.get("status")) return route.fulfill({ json: { items: hit, next_cursor: null } });
    return route.fulfill({ json: q.get("cursor") ? { items: hit.slice(3), next_cursor: null } : { items: hit.slice(0, 3), next_cursor: "r3" } });
  });
  return state;
}

// Next's route announcer is an alert too.
const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const nav = (page: Page) => page.getByRole("navigation", { name: "App" });
const cards = (page: Page) => page.getByRole("list", { name: "Broadcasts" }).getByRole("listitem");
const reach = (page: Page) => page.getByTestId("reach");
const rows = (page: Page) => page.getByRole("region", { name: "Recipients" }).locator("tbody tr");

test("the sidebar links to Broadcasts, after Contacts", async ({ page }) => {
  await brain(page);
  await page.goto("/contacts");
  const links = nav(page).getByRole("link");
  await expect(links.filter({ hasText: /^(Inbox|Contacts|Broadcasts|Automations)$/ })).toHaveText(["Inbox", "Contacts", "Broadcasts", "Automations"]);
  await nav(page).getByRole("link", { name: "Broadcasts", exact: true }).click();
  await expect(page).toHaveURL(/\/t\/acme22\/broadcasts$/);
  await expect(nav(page).getByRole("link", { name: "Broadcasts", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(cards(page)).toHaveCount(4);
});

test("an empty list says what a broadcast is and the rules", async ({ page }) => {
  await brain(page, "owner", []);
  await page.goto("/broadcasts");
  await expect(page.getByText("No broadcasts yet.")).toBeVisible();
  await expect(page.getByText("A broadcast sends one message, as a DM, to everyone with a contact tag")).toBeVisible();
  const rules = page.getByRole("region", { name: "How broadcasts work" });
  await expect(rules.getByRole("listitem")).toHaveCount(6);
  await expect(rules).toContainText("within 24 hours of their last message");
  await expect(rules).toContainText('replies "stop"');
  await expect(rules).toContainText("3 broadcasts a day, each to at most 1000 people");
  await page.getByRole("link", { name: "Write your first broadcast" }).click();
  await expect(page).toHaveURL(/\/broadcasts\/new$/);
});

test("the list shows each broadcast with its status and progress", async ({ page }) => {
  await brain(page);
  await page.goto("/broadcasts");
  await expect(cards(page)).toHaveCount(4);
  const launch = cards(page).filter({ hasText: "Launch day" });
  await expect(launch.getByText("Sending", { exact: true })).toBeVisible();
  await expect(launch.getByText("vip")).toBeVisible();
  await expect(launch.getByRole("img")).toHaveAccessibleName("75% done: 10 sent, 4 skipped, 1 failed, 5 waiting");
  await expect(launch.locator("dl")).toHaveText(/Sent10Skipped4Failed1Waiting5Of20/);
  await expect(launch.getByText(/Started 20 minutes ago/)).toBeVisible();
  await expect(cards(page).filter({ hasText: "Weekend sale" })).toContainText("Paused: Instagram said: too many messages, slow down");
  await expect(cards(page).filter({ hasText: "Spring offer" })).toContainText("Not sent yet");
  await expect(page.getByRole("link", { name: "New broadcast" })).toBeVisible();
});

test("a failed load offers Retry", async ({ page }) => {
  await brain(page);
  let fail = true;
  await page.route(/\/v1\/broadcasts$/, (route) => (fail ? route.fulfill({ status: 500 }) : route.fallback()));
  await page.goto("/broadcasts");
  await expect(alert(page)).toContainText("Broadcasts couldn't be loaded.");
  fail = false;
  await page.getByRole("button", { name: "Retry broadcasts" }).click();
  await expect(cards(page)).toHaveCount(4);
});

test("a new draft is saved with its name, tag, network and message", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/broadcasts/new");
  await page.getByLabel("Name", { exact: true }).fill("  Autumn news ");
  const tag = page.getByLabel("Send to everyone tagged");
  await expect(tag.getByRole("option")).toHaveText(["Pick a tag", "vip (20 people)", "lead (1 person)"]);
  await tag.selectOption("vip");
  await page.getByLabel("Network").selectOption("instagram");
  const text = page.getByLabel("Message", { exact: true });
  await text.fill("Hi !");
  await text.press("ArrowLeft");
  await page.getByRole("button", { name: "Insert {name}" }).click();
  await expect(text).toHaveValue("Hi {name}!");
  await expect(text).toBeFocused();
  await expect(page.getByLabel("Characters used")).toHaveText("68 / 1000");
  await expect(page.getByRole("group", { name: "Example message" })).toContainText("Hi Sam!");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => state.created).toEqual([{ name: "Autumn news", text: "Hi {name}!", tag: "vip", platform: "instagram" }]);
  // Saving sends nothing: the review step opens.
  await expect(page).toHaveURL(/\/broadcasts\/b-new$/);
  await expect(reach(page)).toHaveText("12 of 20 people will get this");
  expect(state.sends).toEqual([]);
});

test("a message past the limit is not saved, and brain's refusal lands on its field", async ({ page }) => {
  const state = await brain(page);
  await page.route(/\/v1\/broadcasts$/, (route) => (route.request().method() === "POST" ? route.fulfill({ status: 422, json: { error: "invalid_broadcast", field: "tag" } }) : route.fallback()));
  await page.goto("/broadcasts/new");
  await page.getByLabel("Name", { exact: true }).fill("Long one");
  await page.getByLabel("Send to everyone tagged").selectOption("lead");
  await page.getByLabel("Message", { exact: true }).fill(`${"x".repeat(940)}{name}`);
  await expect(page.getByLabel("Characters used")).toHaveText("1004 / 1000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(alert(page)).toContainText("keep it within 1000 characters");
  expect(state.created).toEqual([]);
  await page.getByLabel("Message", { exact: true }).fill("Short");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(alert(page)).toHaveText("Pick the tag of the people to message.");
  await expect(page.getByLabel("Send to everyone tagged")).toHaveAttribute("aria-invalid", "true");
});

test("a draft can be edited: all three networks are sent as null", async ({ page }) => {
  const state = await brain(page, "owner", [broadcast("b-draft", "Spring offer", { platform: "bluesky" })]);
  await page.goto("/broadcasts/b-draft");
  await page.getByRole("link", { name: "Edit draft" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Spring offer");
  await expect(page.getByLabel("Network")).toHaveValue("bluesky");
  await page.getByLabel("Network").selectOption("");
  await page.getByLabel("Name", { exact: true }).fill("Spring offer 2");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => state.updated).toEqual([{ name: "Spring offer 2", text: "Hi {name}, our spring offer is live.", tag: "vip", platform: null }]);
  await expect(page).toHaveURL(/\/broadcasts\/b-draft$/);
  await expect(page.getByRole("heading", { name: "Spring offer 2" })).toBeVisible();
});

test("the review step shows who gets it, who does not and why, and the message", async ({ page }) => {
  await brain(page);
  await page.goto("/broadcasts/b-draft");
  await expect(reach(page)).toHaveText("12 of 20 people will get this");
  await expect(page.getByRole("list", { name: "Who will not get it" }).getByRole("listitem")).toHaveText([
    "5 last wrote more than 24 hours ago, and Facebook and Instagram allow no message after that",
    "2 wrote to an account that is disconnected or needs a reconnect",
    "1 opted out of broadcasts",
  ]);
  await expect(page.getByRole("list", { name: "By network" }).getByRole("listitem")).toHaveText([/Bluesky\s*8/, /Instagram\s*4/]);
  await expect(page.getByRole("list", { name: "For example" }).getByRole("listitem")).toHaveText([/Bob/, /Cara/]);
  const message = page.getByRole("region", { name: "Message" });
  await expect(message).toContainText("As Bob will see it");
  await expect(message).toContainText("Hi Bob, our spring offer is live.");
  await expect(page.getByRole("button", { name: "Send to 12 people" })).toBeEnabled();
});

test("Send asks again with the number, and sends it as confirm_total", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/broadcasts/b-draft");
  await page.getByRole("button", { name: "Send to 12 people" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Send to 12 people?" });
  await expect(confirm).toContainText("can't be taken back");
  // The safe answer has the focus, and nothing went out yet.
  await expect(confirm.getByRole("button", { name: "Not yet" })).toBeFocused();
  expect(state.sends).toEqual([]);
  await confirm.getByRole("button", { name: "Not yet" }).click();
  await expect(confirm).toBeHidden();
  expect(state.sends).toEqual([]);
  await page.getByRole("button", { name: "Send to 12 people" }).click();
  await confirm.getByRole("button", { name: "Yes, send to 12 people" }).click();
  await expect.poll(() => state.sends).toEqual([{ confirm_total: 12 }]);
  await expect(page.getByRole("region", { name: "Status" })).toContainText("refresh every 10 seconds");
  await expect(page.getByText("Sending", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send to/ })).toHaveCount(0);
});

test("a changed audience shows the new numbers and does not send again", async ({ page }) => {
  const state = await brain(page);
  state.changedTo = preview(9, { by_reason: { opted_out: 4, outside_window: 5, no_conversation: 0, account_disconnected: 2, recently_messaged: 0 } });
  await page.goto("/broadcasts/b-draft");
  await page.getByRole("button", { name: "Send to 12 people" }).click();
  await page.getByRole("button", { name: "Yes, send to 12 people" }).click();
  await expect(reach(page)).toHaveText("9 of 20 people will get this");
  await expect(alert(page)).toContainText("changed while you were looking, so nothing was sent");
  await expect(page.getByRole("list", { name: "Who will not get it" })).toContainText("4 opted out of broadcasts");
  // Asked once, and the answer is asked for again: no confirm is open and nothing was resent.
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send to 9 people" })).toBeVisible();
  expect(state.sends).toEqual([{ confirm_total: 12 }]);
  await page.getByRole("button", { name: "Send to 9 people" }).click();
  await page.getByRole("button", { name: "Yes, send to 9 people" }).click();
  await expect.poll(() => state.sends).toEqual([{ confirm_total: 12 }, { confirm_total: 9 }]);
  await expect(page.getByText("Sending", { exact: true })).toBeVisible();
});

test("with nobody reachable Send is off and says why", async ({ page }) => {
  const state = await brain(page);
  state.preview = nobody;
  await page.goto("/broadcasts/b-draft");
  await expect(reach(page)).toHaveText("0 of 8 people will get this");
  const send = page.getByRole("button", { name: "Send to 0 people" });
  await expect(send).toBeDisabled();
  await expect(send).toHaveAccessibleDescription("Nobody can get this right now, so there is nothing to send.");
  await expect(page.getByRole("list", { name: "Who will not get it" }).getByRole("listitem")).toHaveCount(2);
  // Count again asks brain once more.
  const before = state.previews;
  state.preview = preview(3);
  await page.getByRole("button", { name: "Count again" }).click();
  await expect(page.getByRole("button", { name: "Send to 3 people" })).toBeEnabled();
  expect(state.previews).toBe(before + 1);
});

test("a refused send is worded plainly", async ({ page }) => {
  await brain(page);
  await page.route(/\/send$/, (route) => route.fulfill({ status: 429, json: { error: "too_many_broadcasts" } }));
  await page.goto("/broadcasts/b-draft");
  await page.getByRole("button", { name: "Send to 12 people" }).click();
  await page.getByRole("button", { name: "Yes, send to 12 people" }).click();
  await expect(alert(page)).toHaveText("This team already started 3 broadcasts in the last 24 hours, the most allowed. Try again later.");
});

test("a paused broadcast shows why, and Resume sets it going", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/broadcasts/b-paused");
  const alert = page.getByRole("alert", { name: "Paused" });
  await expect(alert).toContainText("This broadcast paused itself");
  await expect(page.getByTestId("pause-reason")).toHaveText("Instagram said: too many messages, slow down");
  await expect(alert).toContainText("11 people still wait");
  await alert.getByRole("button", { name: "Resume sending" }).click();
  await expect.poll(() => state.posts.filter((p) => p === "resume")).toHaveLength(1);
  await expect(alert).toHaveCount(0);
  await expect(page.getByText("Sending", { exact: true })).toBeVisible();
});

test("a refused resume says why", async ({ page }) => {
  await brain(page);
  await page.route(/\/resume$/, (route) => route.fulfill({ status: 409, json: { error: "another_sending" } }));
  await page.goto("/broadcasts/b-paused");
  await page.getByRole("button", { name: "Resume sending" }).click();
  await expect(page.getByRole("region", { name: "Status" }).getByRole("alert")).toContainText("Another broadcast of this team is still going out.");
});

test("Cancel asks first, then stops the broadcast", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/broadcasts/b-sending");
  await page.getByRole("button", { name: "Cancel broadcast", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Cancel this broadcast?" });
  await expect(confirm).toContainText("5 people still waiting will not get it");
  expect(state.posts).not.toContain("cancel");
  await confirm.getByRole("button", { name: "Keep it" }).click();
  await expect(confirm).toBeHidden();
  expect(state.posts).not.toContain("cancel");
  await page.getByRole("button", { name: "Cancel broadcast", exact: true }).click();
  await confirm.getByRole("button", { name: "Yes, cancel broadcast" }).click();
  await expect.poll(() => state.posts.filter((p) => p === "cancel")).toHaveLength(1);
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel broadcast", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete broadcast" })).toBeVisible();
});

test("the progress refreshes every 10 seconds while it sends", async ({ page }) => {
  const state = await brain(page);
  await page.clock.install();
  await page.goto("/broadcasts/b-sending");
  const bar = page.getByRole("region", { name: "Status" }).getByRole("img");
  await expect(bar).toHaveAccessibleName(/10 sent, 4 skipped, 1 failed, 5 waiting/);
  Object.assign(state.broadcasts.find((b) => b.id === "b-sending")!, { status: "sent", counts: counts(15, 4, 1, 0), finished_at: new Date().toISOString() });
  await page.clock.runFor(10_500);
  await expect(bar).toHaveAccessibleName("100% done: 15 sent, 4 skipped, 1 failed, 0 waiting");
  await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Status" })).toContainText("Finished");
});

test("recipients filter by status, with reasons in plain words, and load more", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/broadcasts/b-sent");
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(1)).toContainText("Cara");
  await expect(rows(page).nth(1)).toContainText("Skipped");
  await expect(rows(page).nth(1)).toContainText("Last wrote more than 24 hours ago");
  await expect(rows(page).nth(2)).toContainText("Cut off while sending, not tried again");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(state.recipientQueries).toContain("cursor=r3");
  const chips = page.getByRole("group", { name: "Status" });
  await expect(chips.getByRole("button")).toHaveText([/All\s*33/, /Waiting\s*0/, /Sent\s*30/, /Skipped\s*3/, /Failed\s*0/]);
  await chips.getByRole("button", { name: /Skipped/ }).click();
  await expect(chips.getByRole("button", { name: /Skipped/ })).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(1)).toContainText("Opted out of broadcasts");
  expect(state.recipientQueries).toContain("status=skipped");
  await chips.getByRole("button", { name: /Waiting/ }).click();
  await expect(rows(page)).toHaveText([/Eli/]);
  expect(state.recipientQueries).toContain("status=pending");
});

test("a finished broadcast can be deleted after a confirm", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/broadcasts/b-sent");
  await page.getByRole("button", { name: "Delete broadcast" }).click();
  expect(state.deleted).toEqual([]);
  await page.getByRole("button", { name: "Yes, delete broadcast" }).click();
  await expect(page).toHaveURL(/\/broadcasts$/);
  expect(state.deleted).toEqual(["b-sent"]);
  await expect(cards(page)).toHaveCount(3);
});

test("a member reads broadcasts and sees no write controls", async ({ page }) => {
  const state = await brain(page, "member");
  await page.goto("/broadcasts");
  await expect(cards(page)).toHaveCount(4);
  await expect(page.getByRole("link", { name: "New broadcast" })).toHaveCount(0);

  await page.goto("/broadcasts/b-paused");
  await expect(page.getByTestId("pause-reason")).toBeVisible();
  for (const name of ["Resume sending", "Cancel broadcast", "Delete broadcast"]) await expect(page.getByRole("button", { name })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Recipients" })).toHaveCount(0);

  await page.goto("/broadcasts/b-draft?edit=1");
  await expect(page.getByText("Only team owners and admins can review and send broadcasts.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit draft" })).toHaveCount(0);
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);

  await page.goto("/broadcasts/new");
  await expect(page.getByText("Only team owners and admins can write and send broadcasts.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  // Nothing an owner or admin alone may call was called.
  expect(state.posts).toEqual([]);
  expect(state.recipientQueries).toEqual([]);
});

test("an owner switches a contact's opt-out on and off", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/contacts");
  // The list marks who opted out.
  const list = page.getByRole("list", { name: "Contact list" }).getByRole("listitem");
  await expect(list.filter({ hasText: "Cara" })).toContainText("Opted out");
  await expect(list.filter({ hasText: "Bob" })).not.toContainText("Opted out");
  await page.goto("/contacts?contact=k1");
  const toggle = page.getByRole("switch", { name: "Opted out of broadcasts" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("status")).toHaveText("They are opted out of broadcasts.");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(state.patches).toEqual([{ opted_out: true }, { opted_out: false }]);
});

test("a member can opt a contact out but not back in", async ({ page }) => {
  const state = await brain(page, "member");
  await page.goto("/contacts?contact=k1");
  const toggle = page.getByRole("switch", { name: "Opted out of broadcasts" });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAccessibleDescription("Only team owners and admins can turn this off.");
  expect(state.patches).toEqual([{ opted_out: true }]);
  await page.goto("/contacts?contact=k2");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(toggle).toBeDisabled();
});

test("the review step fits a phone and is reachable by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await brain(page);
  await page.goto("/broadcasts/b-draft");
  await expect(reach(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const send = page.getByRole("button", { name: "Send to 12 people" });
  await send.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Not yet" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(send).toBeVisible();
  await page.goto("/broadcasts/b-sent");
  await expect(rows(page)).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
