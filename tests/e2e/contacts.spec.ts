import { expect, test, type Page } from "@playwright/test";

const me = { id: "u-me", email: "me@example.com", name: "Mira", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const members = [
  { id: "u-me", name: "Mira", email: "me@example.com", role: "owner", joined_at: "2026-10-01T10:00:00Z" },
  { id: "u-2", name: "Noor", email: "noor@example.com", role: "member", joined_at: "2026-10-02T10:00:00Z" },
];
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
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
type Assignee = { id: string; name: string } | null;
const item = (id: string, text: string, extra = {}) => ({
  id,
  social_account_id: "c1",
  platform: "bluesky",
  kind: "comment",
  remote_id: `at://did:plc:bob/app.bsky.feed.post/${id}`,
  remote_url: null,
  convo_id: null,
  post_id: null,
  author: { id: "did:plc:bob", handle: "bob.bsky.social", name: "Bob", avatar_url: null },
  text,
  received_at: ago(5),
  state: "open",
  replied_at: null,
  replies: [],
  contact_id: "k1",
  contact_tags: ["vip"],
  assigned_to: null as Assignee,
  ...extra,
});
const contact = (id: string, name: string, extra = {}) => ({
  id,
  platform: "bluesky",
  external_id: `did:plc:${id}`,
  handle: `${name.toLowerCase()}.bsky.social`,
  display_name: name,
  avatar_url: null,
  tags: [] as string[],
  notes: null as string | null,
  first_seen_at: "2026-10-01T10:00:00Z",
  last_seen_at: ago(30),
  items_count: 3,
  ...extra,
});
type Snip = { id: string; kind: string; name: string; body: string };

// A small in-memory brain for contacts, the inbox around them, saved replies and automations.
async function brain(page: Page, role = "owner") {
  const state = {
    contacts: [contact("k1", "Bob", { tags: ["vip"], notes: "Asked about prices." }), contact("k2", "Cara", { platform: "instagram", items_count: 1 })],
    items: [item("p1", "What is the price?"), item("p2", "Second one", { received_at: ago(50) })],
    snippets: [{ id: "s1", kind: "reply", name: "Opening hours", body: "We are open 9 to 5." }] as Snip[],
    contactQueries: [] as URLSearchParams[],
    itemQueries: [] as URLSearchParams[],
    patches: [] as { path: string; body: unknown }[],
    posts: [] as unknown[],
    deleted: [] as string[],
  };
  const path = (url: string) => new URL(url).pathname;
  await page.route("**/auth/me", (route) => route.fulfill({ json: { ...me, current_team: { ...me.current_team, role } } }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [alice] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: members }));
  await page.route("**/v1/contact-tags", (route) => {
    const counts = new Map<string, number>();
    for (const c of state.contacts) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return route.fulfill({ json: [...counts].map(([tag, count]) => ({ tag, count })) });
  });
  await page.route(/\/v1\/contacts(\?.*)?$/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    state.contactQueries.push(q);
    const hit = (c: (typeof state.contacts)[number]) =>
      (!q.get("q") || c.display_name.toLowerCase().includes(q.get("q")!.toLowerCase())) && (!q.get("tag") || c.tags.includes(q.get("tag")!)) && (!q.get("platform") || c.platform === q.get("platform"));
    return route.fulfill({ json: { items: state.contacts.filter(hit), next_cursor: null } });
  });
  await page.route(/\/v1\/contacts\/[^/?]+$/, (route) => {
    const req = route.request();
    const found = state.contacts.find((c) => c.id === path(req.url()).split("/").pop());
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (req.method() === "DELETE") {
      state.deleted.push(found.id);
      state.contacts = state.contacts.filter((c) => c !== found);
      return route.fulfill({ status: 204 });
    }
    if (req.method() === "PATCH") {
      state.patches.push({ path: path(req.url()), body: req.postDataJSON() });
      Object.assign(found, req.postDataJSON());
      for (const i of state.items) if (i.contact_id === found.id) i.contact_tags = found.tags;
      return route.fulfill({ json: found });
    }
    return route.fulfill({ json: { ...found, recent: state.items.filter((i) => i.contact_id === found.id) } });
  });
  await page.route("**/v1/inboxes", (route) =>
    route.fulfill({
      json: [
        { id: "all", name: "All", is_all: true, filters: { account_ids: [], kinds: [], platforms: [], keywords: [], unanswered: false }, open_count: state.items.length, created_at: "", updated_at: "" },
        // A custom inbox holds every kind, as before the Inbox became DMs only; the tests of comments, tags and assignment read it.
        { id: "i2", name: "Everything", is_all: false, account_ids: ["c1"], filters: { kinds: [], keywords: [], unanswered: false }, open_count: state.items.length, created_at: "", updated_at: "" },
      ],
    }),
  );
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    state.itemQueries.push(q);
    const assigned = q.get("assigned");
    const hit = (i: (typeof state.items)[number]) =>
      (!assigned || (assigned === "none" ? !i.assigned_to : i.assigned_to?.id === (assigned === "me" ? me.id : assigned))) && (!q.get("tag") || i.contact_tags.includes(q.get("tag")!));
    return route.fulfill({ json: { items: state.items.filter(hit), next_cursor: null } });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+$/, (route) => {
    const req = route.request();
    const found = state.items.find((i) => i.id === path(req.url()).split("/").pop());
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (req.method() === "PATCH") {
      const body = req.postDataJSON();
      state.patches.push({ path: path(req.url()), body });
      const who = members.find((m) => m.id === body.assigned_to);
      found.assigned_to = who ? { id: who.id, name: who.name } : null;
    }
    return route.fulfill({ json: found });
  });
  await page.route(/\/v1\/snippets(\?.*)?$/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const made = { id: `s${state.snippets.length + 1}`, ...req.postDataJSON() };
      state.posts.push(req.postDataJSON());
      state.snippets.push(made);
      return route.fulfill({ status: 201, json: made });
    }
    const kind = new URL(req.url()).searchParams.get("kind");
    return route.fulfill({ json: { items: state.snippets.filter((s) => s.kind === kind) } });
  });
  await page.route("**/v1/automations", (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fulfill({ json: [] });
    state.posts.push(req.postDataJSON());
    return route.fulfill({ status: 201, json: { id: "a9", activated_at: "", created_by: null, created_at: "", updated_at: "", actions: [], fallback_public_reply: null, steps: null, ...req.postDataJSON() } });
  });
  await page.route(/\/v1\/automations\/a9(\/runs.*)?$/, (route) => route.fulfill({ json: route.request().url().includes("/runs") ? { runs: [], next_cursor: null } : { id: "a9", ...(state.posts.at(-1) as object) } }));
  return state;
}

// The address as the browser has it, whatever host and port the test server runs on.
const query = (page: Page) => new URL(page.url()).searchParams;
const list = (page: Page) => page.getByRole("list", { name: "Contact list" });
const panel = (page: Page) => page.getByRole("region", { name: "Contact", exact: true });
const reader = (page: Page) => page.getByRole("region", { name: "Item" });

test("contacts are listed, searched and filtered by tag and network, all kept in the address", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/contacts");
  await expect(page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Contacts" })).toHaveAttribute("aria-current", "page");
  await expect(list(page).getByRole("listitem")).toHaveCount(2);
  const bob = list(page).getByRole("link", { name: /Bob/ });
  await expect(bob).toContainText("@bob.bsky.social");
  await expect(bob).toContainText("Bluesky");
  await expect(bob).toContainText("vip");
  await expect(bob).toContainText("3 messages");
  await expect(list(page).getByRole("link", { name: /Cara/ })).toContainText("1 message");

  await page.getByRole("searchbox", { name: "Search contacts" }).fill("bo");
  await expect(list(page).getByRole("listitem")).toHaveCount(1);
  await expect.poll(() => query(page).get("q")).toBe("bo");
  await page.getByRole("list", { name: "Tag", exact: true }).getByRole("link", { name: /vip/ }).click();
  await expect.poll(() => query(page).get("tag")).toBe("vip");
  await expect(page.getByRole("list", { name: "Tag", exact: true }).getByRole("link", { name: /vip/ })).toHaveAttribute("aria-current", "true");
  await page.getByLabel("Network").selectOption("instagram");
  await expect.poll(() => query(page).get("platform")).toBe("instagram");
  await expect(page.getByText("No contacts match these filters.")).toBeVisible();
  expect(query(page).get("q")).toBe("bo");
  expect(state.contactQueries.some((q) => q.get("q") === "bo" && q.get("tag") === "vip" && q.get("platform") === "instagram")).toBe(true);

  // A reload asks brain with the same filters.
  state.contactQueries.length = 0;
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Search contacts" })).toHaveValue("bo");
  await expect(page.getByLabel("Network")).toHaveValue("instagram");
  await expect.poll(() => state.contactQueries.some((q) => q.get("q") === "bo" && q.get("tag") === "vip" && q.get("platform") === "instagram")).toBe(true);
});

test("a contact opens in a panel where tags and notes are edited and its conversations link to the inbox", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/contacts");
  await list(page).getByRole("link", { name: /Bob/ }).click();
  await expect.poll(() => query(page).get("contact")).toBe("k1");
  await expect(panel(page).getByRole("heading", { name: "Bob" })).toBeVisible();
  await expect(panel(page).getByLabel("Notes")).toHaveValue("Asked about prices.");

  await panel(page).getByLabel("New tag").fill(" Big, Spender ");
  await panel(page).getByLabel("New tag").press("Enter");
  await expect(panel(page).getByRole("status")).toHaveText("Tags saved.");
  expect(state.patches.at(-1)).toEqual({ path: "/v1/contacts/k1", body: { tags: ["vip", "big spender"] } });
  await expect(list(page).getByRole("link", { name: /Bob/ })).toContainText("big spender");
  await expect(page.getByRole("list", { name: "Tag", exact: true }).getByRole("link", { name: /big spender/ })).toBeVisible();
  await panel(page).getByRole("button", { name: "Remove tag vip" }).click();
  await expect.poll(() => state.patches.at(-1)).toEqual({ path: "/v1/contacts/k1", body: { tags: ["big spender"] } });

  const save = panel(page).getByRole("button", { name: "Save notes" });
  await expect(save).toBeDisabled();
  await panel(page).getByLabel("Notes").fill("Wants the yearly plan.");
  await save.click();
  await expect(panel(page).getByRole("status")).toHaveText("Notes saved.");
  expect(state.patches.at(-1)).toEqual({ path: "/v1/contacts/k1", body: { notes: "Wants the yearly plan." } });
  await panel(page).getByLabel("Notes").fill("");
  await save.click();
  await expect.poll(() => state.patches.at(-1)).toEqual({ path: "/v1/contacts/k1", body: { notes: null } });

  // A tag leads to the inbox items of everyone who has it, a conversation to its item.
  await expect(panel(page).getByRole("link", { name: "big spender" })).toHaveAttribute("href", "/t/acme22/inbox?tag=big%20spender");
  await panel(page).getByRole("list", { name: "Recent conversations" }).getByRole("link", { name: /What is the price/ }).click();
  // The conversation is a comment, which lives on the Comments page now: the old address moves there.
  await expect.poll(() => new URL(page.url()).pathname).toBe("/t/acme22/comments");
  expect(query(page).get("item")).toBe("p1");
  await expect(reader(page).getByRole("heading", { name: "Bob" })).toBeVisible();
});

test("the inbox reader shows the contact's tags, adds one and opens the contact", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/inbox/i2?item=p1");
  await expect(reader(page).getByRole("list", { name: "Tags" }).getByRole("listitem")).toHaveText(["vip"]);
  await reader(page).getByLabel("New tag").fill("Lead");
  await reader(page).getByRole("button", { name: "Add tag" }).click();
  await expect(reader(page).getByRole("status").filter({ hasText: "Tags saved." })).toBeVisible();
  expect(state.patches.at(-1)).toEqual({ path: "/v1/contacts/k1", body: { tags: ["vip", "lead"] } });
  await expect(reader(page).getByRole("list", { name: "Tags" }).getByRole("listitem")).toHaveText(["vip", "lead"]);

  await reader(page).getByRole("link", { name: "Open contact" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/t/acme22/contacts");
  expect(query(page).get("contact")).toBe("k1");
  await expect(panel(page).getByRole("heading", { name: "Bob" })).toBeVisible();
  await expect(panel(page).getByRole("list", { name: "Tags" }).getByRole("listitem")).toHaveText(["vip", "lead"]);
});

test("an item is assigned to a member, to me and to nobody, and its row shows the initial", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/inbox/i2?item=p1");
  const assign = reader(page).getByLabel("Assign");
  const row = page.getByRole("list", { name: "Items" }).getByRole("link", { name: /What is the price/ });
  await expect(assign).toHaveValue("");
  await expect(assign.getByRole("option")).toHaveText(["Unassigned", "Mira", "Noor"]);
  await expect(row.getByText("Assigned to")).toHaveCount(0);

  await assign.selectOption("Noor");
  await expect(reader(page).getByRole("status").filter({ hasText: "Assigned to Noor." })).toBeVisible();
  expect(state.patches.at(-1)).toEqual({ path: "/v1/inbox-items/p1", body: { assigned_to: "u-2" } });
  await expect(row.getByText("Assigned to Noor")).toBeAttached();
  await expect(row.getByTitle("Assigned to Noor")).toContainText("N");

  await reader(page).getByRole("button", { name: "Assign to me" }).click();
  await expect(reader(page).getByRole("status").filter({ hasText: "Assigned to Mira." })).toBeVisible();
  expect(state.patches.at(-1)).toEqual({ path: "/v1/inbox-items/p1", body: { assigned_to: "u-me" } });
  await expect(assign).toHaveValue("u-me");
  await expect(reader(page).getByRole("button", { name: "Assign to me" })).toHaveCount(0);

  await assign.selectOption("Unassigned");
  await expect(reader(page).getByRole("status").filter({ hasText: "Unassigned." })).toBeVisible();
  expect(state.patches.at(-1)).toEqual({ path: "/v1/inbox-items/p1", body: { assigned_to: null } });
  await expect(row.getByText("Assigned to")).toHaveCount(0);
});

test("the Assigned menu and a tag from a contact filter the list through brain and stay in the address", async ({ page }) => {
  const state = await brain(page);
  state.items[1]!.assigned_to = { id: "u-me", name: "Mira" };
  await page.goto("/inbox/i2");
  const rows = page.getByRole("list", { name: "Items" }).getByRole("listitem");
  const chips = page.getByRole("list", { name: "Active filters" });
  const menu = page.getByRole("combobox", { name: "Assigned" });
  await expect(rows).toHaveCount(2);
  await expect(menu.getByRole("option")).toHaveText(["Anyone", "Me", "Unassigned"]);
  await expect(menu).toHaveValue("");

  await menu.selectOption({ label: "Me" });
  await expect(rows).toHaveText([/Second one/]);
  await expect.poll(() => query(page).get("assigned")).toBe("me");
  expect(state.itemQueries.some((q) => q.get("assigned") === "me")).toBe(true);
  await menu.selectOption({ label: "Unassigned" });
  await expect(rows).toHaveText([/What is the price/]);
  await expect.poll(() => query(page).get("assigned")).toBe("none");
  expect(state.itemQueries.some((q) => q.get("assigned") === "none")).toBe(true);

  // Opening an item and searching keep the filter.
  await rows.getByRole("link").click();
  await expect.poll(() => query(page).get("item")).toBe("p1");
  expect(query(page).get("assigned")).toBe("none");

  // From a contact's tag: the list asks for the tag, shows it, and drops it on Clear.
  state.itemQueries.length = 0;
  await page.goto("/inbox/i2?tag=vip&assigned=none");
  await expect(rows).toHaveCount(1);
  expect(state.itemQueries.every((q) => q.get("tag") === "vip" && q.get("assigned") === "none")).toBe(true);
  await expect(chips.getByText("Tag: vip")).toBeVisible();
  await chips.getByRole("link", { name: "Clear the tag filter vip" }).click();
  await expect(chips.getByText("Tag: vip")).toHaveCount(0);
  expect(query(page).get("tag")).toBeNull();
  expect(query(page).get("assigned")).toBe("none");
});

test("a saved reply goes in at the cursor, the typed text is saved as one, and the Library lists them", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/inbox/i2?item=p1");
  const box = reader(page).getByLabel("Reply publicly", { exact: true });
  await box.fill("Hi Bob!");
  await reader(page).getByRole("button", { name: "Insert saved reply into the reply" }).click();
  const menu = page.getByRole("menu", { name: "Saved replies for the reply" });
  await menu.getByRole("menuitem", { name: /Opening hours/ }).click();
  await expect(box).toHaveValue("Hi Bob!\nWe are open 9 to 5.");
  await expect(box).toBeFocused();

  await box.fill("Thanks, the price list is on its way.");
  await reader(page).getByRole("button", { name: "Save as saved reply" }).click();
  await expect(reader(page).getByLabel("Saved reply name")).toBeFocused();
  await page.keyboard.type("Price list");
  // Enter saves the saved reply and sends nothing.
  await page.keyboard.press("Enter");
  await expect(reader(page).getByText("Saved. Find it under Insert saved reply and in the Library.")).toBeVisible();
  expect(state.posts).toEqual([{ kind: "reply", name: "Price list", body: "Thanks, the price list is on its way." }]);
  await expect(box).toHaveValue("Thanks, the price list is on its way.");
  await reader(page).getByRole("button", { name: "Insert saved reply into the reply" }).click();
  await expect(menu.getByRole("menuitem")).toHaveCount(2);

  await page.goto("/library");
  await page.getByRole("tab", { name: "Snippets" }).click();
  const replies = page.getByRole("region", { name: "Saved replies" });
  await expect(replies.getByRole("heading", { name: "Opening hours" })).toBeVisible();
  await expect(replies.getByRole("heading", { name: "Price list" })).toBeVisible();
  await expect(replies.getByText("New saved reply")).toBeVisible();
});

test("an automation tags the contact beside its reply, and a flow takes a tag step that sends nothing", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/automations/new?template=dm-keyword");
  await page.getByLabel("Name", { exact: true }).fill("Price tag");
  const doThis = page.getByRole("group", { name: "Do this" });
  const tags = doThis.getByRole("textbox", { name: "Tag the contact" });
  for (const t of ["VIP", "Lead", "Asked price", "Fourth"]) {
    await tags.fill(t);
    await tags.press("Enter");
  }
  // Three at most, in lower case.
  await expect(doThis.getByRole("list", { name: "Tag the contact" }).getByRole("listitem")).toHaveText(["vip", "lead", "asked price"]);
  await doThis.getByRole("button", { name: "Remove asked price" }).click();
  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview.getByText("Sam gets the tag vip, lead")).toBeVisible();
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toMatchObject({
    name: "Price tag",
    trigger: "dm_received",
    actions: [
      { type: "send_dm", text: "Hi {name}, thanks for asking! Here are our prices: " },
      { type: "tag_contact", tag: "vip" },
      { type: "tag_contact", tag: "lead" },
    ],
  });
  expect(state.posts[0]).not.toHaveProperty("steps");

  // Tags with nothing sent beside them are refused here, in plain words, before brain is asked.
  await page.goto("/automations/new?template=dm-keyword");
  await page.getByLabel("Name", { exact: true }).fill("Only tags");
  await tags.fill("vip");
  await tags.press("Enter");
  await doThis.getByLabel("DM text").fill("  ");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(doThis.getByRole("alert")).toHaveText("A tag needs something sent with it. Write a DM text, or remove the tags.");
  await expect(doThis.getByLabel("DM text")).toBeFocused();
  expect(state.posts).toHaveLength(1);
  await doThis.getByLabel("DM text").fill("Hi!");
  await expect(doThis.getByRole("alert")).toHaveCount(0);

  await page.goto("/automations/new?template=dm-keyword");
  await page.getByLabel("Name", { exact: true }).fill("Tag flow");
  await doThis.getByRole("radio", { name: "A flow of steps" }).check();
  await doThis.getByRole("button", { name: "Tag the contact" }).click();
  const step = doThis.getByRole("listitem", { name: "Step 2: Tag the contact" });
  await expect(step.getByLabel("Tag")).toBeFocused();
  // An empty tag is caught before anything is sent.
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(step.getByRole("alert")).toHaveText("Write the tag: 1 to 30 characters, no commas.");
  expect(state.posts).toHaveLength(1);
  await step.getByLabel("Tag").fill("Asked Price");
  await expect(preview.getByText("Sam gets the tag asked price")).toBeVisible();
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect.poll(() => state.posts.length).toBe(2);
  expect(state.posts[1]).toMatchObject({
    name: "Tag flow",
    steps: [
      { type: "send_dm", text: "Hi {name}, thanks for asking! Here are our prices: " },
      { type: "tag_contact", tag: "asked price" },
    ],
  });
  expect(state.posts[1]).not.toHaveProperty("actions");

  // A flow of only a tag still needs something to send.
  await page.goto("/automations/new?template=dm-keyword");
  await page.getByLabel("Name", { exact: true }).fill("Only a tag");
  await doThis.getByRole("radio", { name: "A flow of steps" }).check();
  await doThis.getByRole("button", { name: "Tag the contact" }).click();
  await doThis.getByRole("listitem", { name: "Step 2: Tag the contact" }).getByLabel("Tag").fill("vip");
  await doThis.getByRole("button", { name: "Remove step 1" }).click();
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(doThis.getByRole("alert").filter({ hasText: "A flow needs at least one step that sends something." })).toBeVisible();
  expect(state.posts).toHaveLength(2);
});

test("an owner deletes a contact after a confirm that says what goes; a member has no such button", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/contacts?tag=vip&contact=k1");
  await expect(panel(page).getByRole("heading", { name: "Bob" })).toBeVisible();
  await panel(page).getByRole("button", { name: "Delete contact" }).click();
  const confirm = panel(page).getByRole("alertdialog", { name: "Delete Bob?" });
  await expect(confirm).toContainText("Their name, tags and notes are removed. Their messages stay in the inbox.");
  await confirm.getByRole("button", { name: "Keep contact" }).click();
  expect(state.deleted).toEqual([]);
  await panel(page).getByRole("button", { name: "Delete contact" }).click();
  await confirm.getByRole("button", { name: "Yes, delete contact" }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(state.deleted).toEqual(["k1"]);
  await expect(list(page).getByRole("link", { name: /Bob/ })).toHaveCount(0);
  // The panel is gone from the address, the filter is not.
  await expect.poll(() => query(page).get("contact")).toBeNull();
  expect(query(page).get("tag")).toBe("vip");

  const member = await page.context().newPage();
  await brain(member, "member");
  await member.goto("/contacts?contact=k2");
  await expect(panel(member).getByRole("heading", { name: "Cara" })).toBeVisible();
  await expect(panel(member).getByLabel("Notes")).toBeVisible();
  await expect(panel(member).getByRole("button", { name: "Delete contact" })).toHaveCount(0);
});
