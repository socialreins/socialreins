import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin", locale: "en-US" });

const sender = { name: "Acme Bakery", address: "12 Mill Lane\n10115 Berlin\nGermany" };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const counts = (sent = 0, failed = 0, pending = 0) => ({ total: sent + failed + pending, sent, failed, pending });
const newsletter = (id: string, subject: string, extra = {}) => ({
  id,
  subject,
  body: "Hello readers.\n\nOur **spring menu** is live: https://acme.example/menu",
  status: "draft",
  pause_reason: null as string | null,
  tested_at: null as string | null,
  counts: counts(),
  created_by: "u-me",
  created_at: ago(120),
  started_at: null as string | null,
  finished_at: null as string | null,
  ...extra,
});
const sub = (id: string, extra = {}) => ({ id, email: `${id}@example.com`, confirmed: true, subscribed_at: "2026-11-18T10:00:00Z", unsubscribed_at: null as string | null, ...extra });

const draft = newsletter("n-draft", "Spring menu");
const tested = newsletter("n-tested", "Tested and ready", { tested_at: "2026-11-19T09:30:00Z" });
const sending = newsletter("n-sending", "Launch day", { status: "sending", tested_at: ago(60), counts: counts(10, 1, 9), started_at: ago(20) });
const paused = newsletter("n-paused", "Weekend sale", { status: "paused", tested_at: ago(90), pause_reason: "The mail service said: daily limit reached", counts: counts(6, 1, 13), started_at: ago(45) });
const sent = newsletter("n-sent", "Thank you", { status: "sent", tested_at: ago(700), counts: counts(30, 2, 0), started_at: ago(600), finished_at: ago(580) });

type Options = { role?: string; list?: ReturnType<typeof newsletter>[]; team?: Record<string, unknown> };

// A small in-memory brain for newsletters.
async function brain(page: Page, { role = "owner", list = [draft, tested, sending, paused, sent], team = {} }: Options = {}) {
  const state = {
    team: { id: "t1", name: "Acme", code: "acme22", role, public_pages: true, newsletter: true, newsletter_sender: sender as typeof sender | null, ...team },
    newsletters: list.map((n) => ({ ...n })),
    // ann and bob get it; cy has not confirmed and dee unsubscribed.
    subs: [sub("ann"), sub("bob"), sub("cy", { confirmed: false }), sub("dee", { unsubscribed_at: "2026-11-19T08:00:00Z" })],
    // What the next call answers instead of working: a refusal for PATCH /v1/team, a save or one of the actions.
    refuse: null as { status: number; json: Record<string, unknown> } | null,
    patches: [] as unknown[],
    created: [] as unknown[],
    updated: [] as unknown[],
    sends: [] as unknown[],
    actions: [] as string[],
    deleted: [] as string[],
    reads: 0,
  };
  const refused = () => {
    const r = state.refuse;
    state.refuse = null;
    return r;
  };
  const parts = (url: string) => new URL(url).pathname.split("/");
  await page.route("**/auth/me", (route) => route.fulfill({ json: { id: "u-me", email: "me@example.com", name: "Mira", username: null, current_team: state.team } }));
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [state.team] }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/team/invitations", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/team", (route) => {
    state.patches.push(route.request().postDataJSON());
    const no = refused();
    if (no) return route.fulfill(no);
    Object.assign(state.team, route.request().postDataJSON());
    return route.fulfill({ json: state.team });
  });
  await page.route("**/v1/subscribers", (route) => route.fulfill({ json: { subscribers: state.subs } }));
  await page.route(/\/v1\/newsletters$/, (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fulfill({ json: state.newsletters });
    state.created.push(req.postDataJSON());
    const no = refused();
    if (no) return route.fulfill(no);
    const made = newsletter("n-new", "", req.postDataJSON());
    state.newsletters.unshift(made);
    return route.fulfill({ status: 201, json: made });
  });
  await page.route(/\/v1\/newsletters\/[^/?]+$/, (route) => {
    const req = route.request();
    const found = state.newsletters.find((n) => n.id === parts(req.url()).pop());
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (req.method() === "GET") state.reads += 1;
    if (req.method() === "PUT") {
      state.updated.push(req.postDataJSON());
      const no = refused();
      if (no) return route.fulfill(no);
      Object.assign(found, req.postDataJSON(), { tested_at: null });
    }
    if (req.method() === "DELETE") {
      state.deleted.push(found.id);
      state.newsletters = state.newsletters.filter((n) => n !== found);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: found });
  });
  await page.route(/\/v1\/newsletters\/[^/]+\/(test|send|cancel|resume)$/, (route) => {
    const req = route.request();
    const [id, action] = parts(req.url()).slice(-2);
    const found = state.newsletters.find((n) => n.id === id)!;
    state.actions.push(action);
    if (action === "send") state.sends.push(req.postDataJSON());
    const no = refused();
    if (no) return route.fulfill(no);
    if (action === "test") Object.assign(found, { tested_at: new Date().toISOString() });
    if (action === "send") Object.assign(found, { status: "sending", started_at: new Date().toISOString(), counts: counts(0, 0, req.postDataJSON().confirm_total) });
    if (action === "cancel") Object.assign(found, { status: "cancelled", pause_reason: null, finished_at: new Date().toISOString() });
    if (action === "resume") Object.assign(found, { status: "sending", pause_reason: null });
    return route.fulfill({ json: found });
  });
  return state;
}

// Next's route announcer is an alert too.
const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const nav = (page: Page) => page.getByRole("navigation", { name: "App" });
const cards = (page: Page) => page.getByRole("list", { name: "Newsletters" }).getByRole("listitem");
const preview = (page: Page) => page.getByRole("region", { name: "Email preview" });
const step = (page: Page, n: number) => page.getByRole("listitem", { name: new RegExp(`^Step ${n}:`) });
const testButton = (page: Page) => page.getByRole("button", { name: "Send a test to me@example.com" });
const sendButton = (page: Page) => step(page, 3).getByRole("button", { name: /^Send/ });

test("owners and admins get Newsletters in the sidebar after Broadcasts, with status, counts and dates in the list", async ({ page }) => {
  await brain(page, { role: "admin" });
  await page.goto("/broadcasts");
  await expect(nav(page).getByRole("link").filter({ hasText: /^(Contacts|Broadcasts|Newsletters|Automations)$/ })).toHaveText(["Contacts", "Broadcasts", "Newsletters", "Automations"]);
  await nav(page).getByRole("link", { name: "Newsletters", exact: true }).click();
  await expect(page).toHaveURL(/\/t\/acme22\/newsletters$/);
  await expect(nav(page).getByRole("link", { name: "Newsletters", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(cards(page)).toHaveCount(5);
  await expect(page.getByTestId("audience")).toContainText("2 confirmed subscribers.");

  const launch = cards(page).filter({ hasText: "Launch day" });
  await expect(launch.locator(".badge")).toHaveText("Sending");
  await expect(launch.getByRole("img")).toHaveAccessibleName("55% done: 10 sent, 1 failed, 9 waiting");
  await expect(launch).toContainText("Started 20 minutes ago");
  await expect(cards(page).filter({ hasText: "Weekend sale" })).toContainText("Paused: The mail service said: daily limit reached");
  await expect(cards(page).filter({ hasText: "Thank you" })).toContainText("Finished");
  await expect(cards(page).filter({ hasText: "Spring menu" })).toContainText("Not sent yet. Open it to test and send.");
});

test("a member has no sidebar link and only reads that owners and admins send newsletters", async ({ page }) => {
  const state = await brain(page, { role: "member" });
  await page.goto("/broadcasts");
  await expect(nav(page).getByRole("link", { name: "Broadcasts", exact: true })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Newsletters", exact: true })).toHaveCount(0);
  for (const path of ["/newsletters", "/newsletters/new", "/newsletters/n-draft"]) {
    await page.goto(path);
    await expect(page.getByText("Only team owners and admins can write and send newsletters.")).toBeVisible();
    await expect(page.getByRole("button")).not.toContainText(["Save draft"]);
  }
  await expect(page.getByRole("textbox", { name: "Subject" })).toHaveCount(0);
  expect(state.reads).toBe(0);
});

test("an empty list says who gets a newsletter, with the count and a link to Sharing when the sign-up is off", async ({ page }) => {
  await brain(page, { list: [], team: { newsletter: false } });
  await page.goto("/newsletters");
  await expect(page.getByText("No newsletters yet.")).toBeVisible();
  await expect(page.getByText("A newsletter is one email to the people who signed up on your public pages and confirmed their address.")).toBeVisible();
  await expect(page.getByTestId("audience")).toContainText("2 confirmed subscribers.");
  await expect(page.getByTestId("audience")).toContainText("The newsletter sign-up is switched off");
  await page.getByRole("link", { name: "Team, Sharing" }).click();
  await expect(page).toHaveURL(/\/t\/acme22\/team$/);
});

test("the sender form shows until it is set, sends name and address, and puts brain's refusal under its field", async ({ page }) => {
  const state = await brain(page, { team: { newsletter_sender: null } });
  await page.goto("/newsletters");
  const form = page.getByRole("form", { name: "Sender details" });
  await expect(form).toContainText("The law requires both in every email");
  await form.getByLabel("Sender name").fill("  Acme Bakery ");
  await form.getByLabel("Postal address").fill("12 Mill Lane\n10115 Berlin");
  state.refuse = { status: 422, json: { error: "invalid_sender", field: "address" } };
  await form.getByRole("button", { name: "Save sender details" }).click();
  await expect(alert(page)).toHaveText("Write a postal address of 10 to 300 characters.");
  await expect(form.getByLabel("Postal address")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByLabel("Sender name")).not.toHaveAttribute("aria-invalid", "true");

  state.refuse = { status: 422, json: { error: "invalid_sender", field: "name" } };
  await form.getByRole("button", { name: "Save sender details" }).click();
  await expect(alert(page)).toHaveText("Give the sender a name of 1 to 80 characters.");
  await expect(form.getByLabel("Sender name")).toHaveAttribute("aria-invalid", "true");

  await form.getByRole("button", { name: "Save sender details" }).click();
  await expect(form).toHaveCount(0);
  const card = page.getByRole("region", { name: "Sender" });
  await expect(card).toContainText("Acme Bakery");
  await expect(card).toContainText("12 Mill Lane");
  expect(state.patches).toHaveLength(3);
  expect(state.patches[2]).toEqual({ newsletter_sender: { name: "Acme Bakery", address: "12 Mill Lane\n10115 Berlin" } });

  // Editable later.
  await card.getByRole("button", { name: "Edit sender details" }).click();
  await expect(page.getByLabel("Sender name")).toHaveValue("Acme Bakery");
  await page.getByLabel("Sender name").fill("Acme");
  await page.getByRole("button", { name: "Save sender details" }).click();
  await expect(card.getByRole("button", { name: "Edit sender details" })).toBeVisible();
  expect(state.patches[3]).toEqual({ newsletter_sender: { name: "Acme", address: "12 Mill Lane\n10115 Berlin" } });
});

test("compose shows the email as it will read, counts as you type, and saves a draft", async ({ page }) => {
  const state = await brain(page, { list: [] });
  await page.goto("/newsletters/new");
  await expect(preview(page).getByTestId("preview-body")).toHaveText("Your newsletter shows here as you type.");
  await page.getByRole("textbox", { name: "Subject" }).fill("Spring menu");
  await page.getByRole("textbox", { name: "Newsletter" }).fill('Hello <b>readers</b> <img src=x onerror="window.pwned=1">\n\nOur **spring menu** is live:\nhttps://acme.example/menu.\n\nNot links: http://plain.example javascript:alert(1)');

  await expect(preview(page).getByTestId("preview-subject")).toHaveText("Spring menu");
  const body = preview(page).getByTestId("preview-body");
  await expect(body.locator("p")).toHaveCount(3);
  // HTML is shown as typed, never run.
  await expect(body.locator("p").first()).toHaveText('Hello <b>readers</b> <img src=x onerror="window.pwned=1">');
  await expect(body.locator("b, img, script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  await expect(body.locator("strong")).toHaveText("spring menu");
  await expect(body.getByRole("link")).toHaveCount(1);
  await expect(body.getByRole("link")).toHaveAttribute("href", "https://acme.example/menu");
  await expect(body.locator("p").nth(2)).toHaveText("Not links: http://plain.example javascript:alert(1)");

  // The foot, as it will read.
  const foot = preview(page).getByTestId("preview-footer");
  await expect(foot.locator("span")).toHaveText(["Acme Bakery", "12 Mill Lane\n10115 Berlin\nGermany", "You get this because you signed up on a Acme page.", "Unsubscribe"], { useInnerText: true });

  await expect(page.getByLabel("Subject characters")).toHaveText("11 / 150");
  await expect(page.getByLabel("Links", { exact: true })).toHaveText("1 / 20");
  await expect(page.getByLabel("Newsletter characters")).toContainText("/ 20,000");

  // Too long a subject is refused here, before brain.
  await page.getByRole("textbox", { name: "Subject" }).fill("x".repeat(151));
  await expect(page.getByLabel("Subject characters")).toHaveText("151 / 150");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(alert(page)).toHaveText("Write a subject of 1 to 150 characters, on one line.");
  expect(state.created).toEqual([]);

  // brain's own refusal lands under its field.
  await page.getByRole("textbox", { name: "Subject" }).fill(" Spring menu ");
  state.refuse = { status: 422, json: { error: "invalid_newsletter", field: "body" } };
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(alert(page)).toHaveText("Write the newsletter, and keep it within 20,000 characters.");
  await expect(page.getByRole("textbox", { name: "Newsletter" })).toHaveAttribute("aria-invalid", "true");

  await page.getByRole("textbox", { name: "Newsletter" }).fill("Hello readers.\n\nBye");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/newsletters\/n-new$/);
  expect(state.created[1]).toEqual({ subject: "Spring menu", body: "Hello readers.\n\nBye" });
  await expect(page.getByRole("textbox", { name: "Subject" })).toHaveValue("Spring menu");
  expect(state.actions).toEqual([]);
});

test("Send stays disabled until a test went to your own email, and an edit after the test asks for a new one", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/newsletters/n-draft");
  await expect(step(page, 1).getByTestId("test-state")).toContainText("Not tested yet. A test is required before sending");
  await expect(step(page, 2).getByTestId("reach")).toHaveText("This goes to 2 confirmed subscribers");
  await expect(sendButton(page)).toHaveText("Send to 2 people");
  await expect(sendButton(page)).toBeDisabled();
  await expect(step(page, 3)).toContainText("Send yourself a test first (step 1).");

  await testButton(page).click();
  await expect(step(page, 1).getByRole("status")).toHaveText("The test is on its way to me@example.com.");
  await expect(step(page, 1).getByTestId("test-state")).toContainText("Tested ");
  expect(state.actions).toEqual(["test"]);
  await expect(sendButton(page)).toBeEnabled();

  // Typing alone already blocks the send: the saved text is not the one on screen.
  await page.getByRole("textbox", { name: "Subject" }).fill("Spring menu, take two");
  await expect(sendButton(page)).toBeDisabled();
  await expect(testButton(page)).toBeDisabled();
  await expect(step(page, 1).getByTestId("test-state")).toContainText("You have changes that are not saved.");
  await expect(step(page, 3)).toContainText("Save the draft first.");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  expect(state.updated).toEqual([{ subject: "Spring menu, take two", body: draft.body }]);
  await expect(step(page, 1).getByTestId("test-state")).toHaveText("You changed the newsletter after the last test, so a new test is needed.");
  await expect(sendButton(page)).toBeDisabled();

  // More than 10 tests a day.
  state.refuse = { status: 429, json: { error: "rate_limited" } };
  await testButton(page).click();
  await expect(alert(page)).toHaveText("You sent 10 tests today, the most allowed. Try again tomorrow.");
  await expect(sendButton(page)).toBeDisabled();

  await testButton(page).click();
  await expect(sendButton(page)).toBeEnabled();
  expect(state.sends).toEqual([]);
});

test("the review shows what goes out, and only the second answer sends, with confirm_total", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/newsletters/n-tested");
  await expect(step(page, 1).getByTestId("test-state")).toHaveText("Tested Nov 19, 2026, 10:30 AM. Read it in your inbox before you go on.");
  await expect(step(page, 2).getByTestId("reach")).toHaveText("This goes to 2 confirmed subscribers");
  const review = step(page, 2).getByRole("region", { name: "What will be sent" });
  await expect(review.getByTestId("preview-subject")).toHaveText("Tested and ready");
  await expect(review.getByTestId("preview-body").locator("strong")).toHaveText("spring menu");
  await expect(review.getByTestId("preview-footer")).toContainText("Unsubscribe");

  await sendButton(page).click();
  const ask = page.getByRole("alertdialog", { name: "Send to 2 people?" });
  await expect(ask).toContainText("Each of the 2 confirmed subscribers gets this email, starting now.");
  await expect(ask.getByRole("button", { name: "Not yet" })).toBeFocused();
  await ask.getByRole("button", { name: "Not yet" }).click();
  await expect(ask).toHaveCount(0);
  expect(state.sends).toEqual([]);

  await sendButton(page).click();
  await ask.getByRole("button", { name: "Yes, send to 2 people" }).click();
  await expect(page.getByRole("region", { name: "Status" })).toContainText("Going out a few at a time.");
  expect(state.sends).toEqual([{ confirm_total: 2 }]);
  await expect(page.locator(".badge").filter({ hasText: "Sending" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Subject" })).toHaveCount(0);
});

test("when the audience changed, nothing is sent, the new number shows and the question is asked again", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/newsletters/n-tested");
  state.refuse = { status: 409, json: { error: "audience_changed", total: 3 } };
  await sendButton(page).click();
  await page.getByRole("button", { name: "Yes, send to 2 people" }).click();
  await expect(alert(page)).toContainText("changed while you were looking, so nothing was sent. It is now 3.");
  await expect(step(page, 2).getByTestId("reach")).toHaveText("This goes to 3 confirmed subscribers");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  // Never sent again by itself.
  expect(state.sends).toEqual([{ confirm_total: 2 }]);

  await sendButton(page).click();
  await page.getByRole("alertdialog", { name: "Send to 3 people?" }).getByRole("button", { name: "Yes, send to 3 people" }).click();
  await expect(page.getByRole("region", { name: "Status" })).toBeVisible();
  expect(state.sends).toEqual([{ confirm_total: 2 }, { confirm_total: 3 }]);
});

test("a list cut off at 5000 sign-ups shows at least N, and sends after brain's own count is confirmed", async ({ page }) => {
  const state = await brain(page);
  // 5000 rows is brain's limit: 4999 of them confirmed, and more that this page never sees.
  state.subs = [sub("cy", { confirmed: false }), ...Array.from({ length: 4999 }, (_, i) => sub(`s${i}`))];
  await page.goto("/newsletters");
  await expect(page.getByTestId("audience")).toContainText("at least 4999 confirmed subscribers.");

  await page.goto("/newsletters/n-tested");
  await expect(step(page, 2).getByTestId("reach")).toHaveText("This goes to at least 4999 confirmed subscribers");
  await expect(step(page, 2).getByTestId("reach-note")).toContainText("The exact number is counted when you send");
  state.refuse = { status: 409, json: { error: "audience_changed", total: 5000 } };
  await sendButton(page).click();
  await page.getByRole("button", { name: "Yes, send to at least 4999 people" }).click();
  await expect(alert(page)).toContainText("The confirmed subscribers are counted now, so nothing was sent. It is now 5000.");
  await expect(step(page, 2).getByTestId("reach")).toHaveText("This goes to 5000 confirmed subscribers");
  await expect(step(page, 2).getByTestId("reach-note")).toHaveCount(0);

  await sendButton(page).click();
  await page.getByRole("alertdialog", { name: "Send to 5000 people?" }).getByRole("button", { name: "Yes, send to 5000 people" }).click();
  await expect(page.getByRole("region", { name: "Status" })).toBeVisible();
  expect(state.sends).toEqual([{ confirm_total: 4999 }, { confirm_total: 5000 }]);
});

const refusals: [number, string, RegExp][] = [
  [422, "sender_required", /Add your sender name and postal address first/],
  [422, "test_required", /Send yourself a test of this exact text first/],
  [422, "no_recipients", /Nobody has a confirmed subscription right now, so nothing was sent/],
  [429, "too_many_newsletters", /already sent a newsletter in the last 24 hours, and one a day is the most allowed/],
  [422, "too_many_recipients", /at most 5,000 people/],
];
test("every refusal of a send reads in plain words and is never sent again by itself", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/newsletters/n-tested");
  for (const [status, error, words] of refusals) {
    state.refuse = { status, json: { error } };
    await sendButton(page).click();
    await page.getByRole("button", { name: "Yes, send to 2 people" }).click();
    await expect(alert(page)).toHaveText(words);
    await expect(sendButton(page)).toBeEnabled();
  }
  expect(state.sends).toHaveLength(refusals.length);

  // Started in another tab: the page shows what brain has instead of sending.
  Object.assign(state.newsletters.find((n) => n.id === "n-tested")!, { status: "sending", started_at: ago(1), counts: counts(0, 0, 2) });
  await sendButton(page).click();
  await page.getByRole("button", { name: "Yes, send to 2 people" }).click();
  await expect(page.getByRole("region", { name: "Status" })).toBeVisible();
  expect(state.sends).toHaveLength(refusals.length);
});

test("a draft someone else changed is read again before sending, and nothing goes out", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/newsletters/n-tested");
  await expect(sendButton(page)).toBeEnabled();
  Object.assign(state.newsletters.find((n) => n.id === "n-tested")!, { subject: "Changed elsewhere", tested_at: null });
  await sendButton(page).click();
  await page.getByRole("button", { name: "Yes, send to 2 people" }).click();
  await expect(alert(page)).toContainText("This draft changed while you were looking, so nothing was sent.");
  await expect(page.getByRole("textbox", { name: "Subject" })).toHaveValue("Changed elsewhere");
  await expect(sendButton(page)).toBeDisabled();
  expect(state.sends).toEqual([]);
});

test("Send is off with nobody confirmed, and without sender details", async ({ page }) => {
  const state = await brain(page, { team: { newsletter_sender: null } });
  await page.goto("/newsletters/n-tested");
  await expect(step(page, 2)).toContainText("Add your sender name and postal address");
  await expect(sendButton(page)).toBeDisabled();
  await expect(preview(page).getByTestId("preview-footer")).toContainText("Your postal address");

  state.team.newsletter_sender = sender;
  state.subs = state.subs.filter((s) => !s.confirmed || s.unsubscribed_at);
  await page.goto("/newsletters/n-tested");
  await expect(step(page, 2).getByTestId("reach")).toHaveText("This goes to 0 confirmed subscribers");
  await expect(sendButton(page)).toBeDisabled();
  await expect(step(page, 3)).toContainText("Nobody has a confirmed subscription yet");
});

test("a draft is deleted only after a confirm", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/newsletters/n-draft");
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("button", { name: "Keep it" }).click();
  expect(state.deleted).toEqual([]);
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("button", { name: "Yes, delete draft" }).click();
  await expect(page).toHaveURL(/\/newsletters$/);
  expect(state.deleted).toEqual(["n-draft"]);
});

test("a sending newsletter reads its progress again every 10 seconds", async ({ page }) => {
  const state = await brain(page);
  await page.clock.install();
  await page.goto("/newsletters/n-sending");
  const bar = page.getByRole("region", { name: "Status" }).getByRole("img");
  await expect(bar).toHaveAccessibleName("55% done: 10 sent, 1 failed, 9 waiting");
  Object.assign(state.newsletters.find((n) => n.id === "n-sending")!, { status: "sent", counts: counts(19, 1, 0), finished_at: new Date().toISOString() });
  await page.clock.runFor(10_500);
  await expect(bar).toHaveAccessibleName("100% done: 19 sent, 1 failed, 0 waiting");
  await expect(page.getByRole("button", { name: "Cancel newsletter" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "What was sent" }).getByTestId("preview-subject")).toHaveText("Launch day");
});

test("a paused newsletter says why and resumes, and Cancel asks first", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/newsletters/n-paused");
  const note = page.getByRole("alert", { name: "Paused" });
  await expect(note.getByTestId("pause-reason")).toHaveText("The mail service said: daily limit reached");
  await expect(note).toContainText("13 people still wait.");
  await note.getByRole("button", { name: "Resume sending" }).click();
  await expect(note).toHaveCount(0);
  await expect(page.locator(".badge").filter({ hasText: "Sending" })).toBeVisible();
  expect(state.actions).toEqual(["resume"]);

  await page.getByRole("button", { name: "Cancel newsletter" }).click();
  const ask = page.getByRole("alertdialog", { name: "Cancel this newsletter?" });
  await expect(ask).toContainText("13 people still waiting will not get it.");
  await ask.getByRole("button", { name: "Keep it" }).click();
  expect(state.actions).toEqual(["resume"]);
  await page.getByRole("button", { name: "Cancel newsletter" }).click();
  await ask.getByRole("button", { name: "Yes, cancel newsletter" }).click();
  await expect(page.locator(".badge").filter({ hasText: "Cancelled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel newsletter" })).toHaveCount(0);
  expect(state.actions).toEqual(["resume", "cancel"]);

  // A refused resume says why.
  state.refuse = { status: 409, json: { error: "not_paused" } };
  Object.assign(state.newsletters.find((n) => n.id === "n-paused")!, { status: "paused", pause_reason: "Again", finished_at: null });
  await page.goto("/newsletters/n-paused");
  await page.getByRole("button", { name: "Resume sending" }).click();
  await expect(alert(page).filter({ hasText: "not paused" })).toHaveText("This newsletter is not paused. Reload to see it.");
});

test("Team, Sharing marks who unsubscribed and keeps them out of the CSV", async ({ page }) => {
  await brain(page);
  await page.goto("/team");
  await expect(page.getByText("2 confirmed, 1 waiting for the email link, 1 unsubscribed.")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "dee@example.com" });
  await expect(row.locator(".badge")).toHaveText("Unsubscribed");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the confirmed ones (CSV)" }).click();
  const csv = readFileSync((await (await download).path())!, "utf8");
  expect(csv).toBe("email,subscribed_at\r\nann@example.com,2026-11-18T10:00:00Z\r\nbob@example.com,2026-11-18T10:00:00Z\r\n");
});

test("the unsubscribe page posts the token only on a click, says the same for any token, and is not indexed", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  const posted: unknown[] = [];
  await page.route("**/v1/public/newsletter/unsubscribe", (route) => {
    posted.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: "ok" } });
  });
  for (const token of ["real-token", "made-up"]) {
    await page.goto(`/newsletter/unsubscribe?token=${token}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Unsubscribe from this newsletter?");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await page.waitForLoadState("networkidle");
    expect(posted.filter((p) => (p as { token: string }).token === token)).toEqual([]);
    await page.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "You are unsubscribed" })).toBeFocused();
    await expect(page.getByText("You will get no more emails from this newsletter.")).toBeVisible();
    expect(posted.filter((p) => (p as { token: string }).token === token)).toEqual([{ token }]);
    // No sign-in, and no analytics on a page whose address carries a token.
    await expect(page).toHaveURL(new RegExp(`/newsletter/unsubscribe\\?token=${token}$`));
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  }

  await page.unroute("**/v1/public/newsletter/unsubscribe");
  await page.route("**/v1/public/newsletter/unsubscribe", (route) => route.fulfill({ status: 429, json: { error: "rate_limited" } }));
  await page.goto("/newsletter/unsubscribe?token=x");
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByText(/Wait a minute, then try again/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Unsubscribe from this newsletter?");
});
