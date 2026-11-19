import { expect, test, type Page } from "@playwright/test";

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "member" } };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1", "c2"], account_count: 2, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const account = (id: string, provider: string, handle: string) => ({
  id,
  provider,
  external_id: `ext-${id}`,
  handle,
  display_name: handle,
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  created_at: "2026-10-20T10:00:00Z",
});
const alice = account("c1", "bluesky", "alice.bsky.social");
const linked = account("c2", "linkedin", "alice-li");

type Item = { id: string; url: string; name: string; created_at: string; created_by: string };
type Snip = { id: string; kind: "caption" | "hashtags"; name: string; body: string; created_at: string; updated_at: string };
const media = (n: number, extra: Partial<Item> = {}): Item => ({
  id: `m${n}`,
  url: `https://cdn.example.com/photo-${n}.png`,
  name: `Photo ${n}`,
  created_at: "2026-11-01T10:00:00Z",
  created_by: "u-me",
  ...extra,
});
const snip = (id: string, kind: Snip["kind"], name: string, body: string): Snip => ({ id, kind, name, body, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" });

// A brain holding the library in memory: media pages of `limit`, snippets by kind, the contract's refusals.
async function brain(page: Page, { items = [] as Item[], snippets = [] as Snip[], accounts = [alice] } = {}) {
  const state = { items: [...items], snippets: [...snippets], posts: [] as Record<string, unknown>[] };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: accounts }));
  // Pictures from the image hosts: a flat colour per file, so nothing leaves the machine.
  await page.route(/^https:\/\/(cdn\.example\.com|drive\.google\.com\/thumbnail)/, (route) => {
    if (/\.mp4$/.test(route.request().url())) return route.fulfill({ status: 404 });
    const hue = [...route.request().url()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
    return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue} 55% 62%)"/><circle cx="140" cy="60" r="22" fill="hsl(${hue} 70% 85%)"/><path d="M0 200 70 110 120 160 150 130 200 200Z" fill="hsl(${hue} 45% 38%)"/></svg>` });
  });
  await page.route(/\/v1\/(posts|lists)(\?.*)?$/, (route) => {
    if (route.request().method() === "POST") {
      state.posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { id: "p1" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route(/\/v1\/social-sets\/[^/]+\/queue$/, (route) => route.fulfill({ json: { time_zone: "UTC", slots: [], next: [] } }));
  await page.route(/\/v1\/media-library(\/[^/?]+)?(\?.*)?$/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const id = /\/v1\/media-library\/([^/?]+)/.exec(url.pathname)?.[1];
    if (req.method() === "GET") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const limit = Number(url.searchParams.get("limit") ?? 24);
      const from = Number(url.searchParams.get("cursor") ?? 0);
      const all = state.items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.url.includes(q));
      const next = from + limit < all.length ? String(from + limit) : null;
      return route.fulfill({ json: { items: all.slice(from, from + limit), next_cursor: next } });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON() as { url: string; name: string };
      const dup = state.items.find((i) => i.url === body.url);
      if (dup) return route.fulfill({ status: 409, json: { error: "already_in_library", id: dup.id } });
      const added = media(state.items.length + 100, { url: body.url, name: body.name });
      state.items.unshift(added);
      return route.fulfill({ status: 201, json: added });
    }
    if (req.method() === "PATCH") {
      const it = state.items.find((i) => i.id === id)!;
      it.name = (req.postDataJSON() as { name: string }).name;
      return route.fulfill({ json: it });
    }
    state.items = state.items.filter((i) => i.id !== id);
    return route.fulfill({ status: 204 });
  });
  await page.route(/\/v1\/snippets(\/[^/?]+)?(\?.*)?$/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const id = /\/v1\/snippets\/([^/?]+)/.exec(url.pathname)?.[1];
    if (req.method() === "GET") {
      const kind = url.searchParams.get("kind");
      return route.fulfill({ json: { items: state.snippets.filter((s) => s.kind === kind).sort((a, b) => a.name.localeCompare(b.name)) } });
    }
    if (req.method() === "DELETE") {
      state.snippets = state.snippets.filter((s) => s.id !== id);
      return route.fulfill({ status: 204 });
    }
    const body = req.postDataJSON() as Pick<Snip, "kind" | "name" | "body">;
    if (state.snippets.some((s) => s.name === body.name && s.kind === body.kind && s.id !== id)) return route.fulfill({ status: 409, json: { error: "snippet_name_taken" } });
    const saved = snip(id ?? `s${state.snippets.length + 100}`, body.kind, body.name, body.body);
    state.snippets = [...state.snippets.filter((s) => s.id !== id), saved];
    return route.fulfill({ status: id ? 200 : 201, json: saved });
  });
  return state;
}

test("the sidebar links to the library", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  const nav = page.getByRole("navigation", { name: "App" });
  await nav.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL("/t/acme22/library");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Media" })).toHaveAttribute("aria-selected", "true");
});

test("media is added, found, renamed and deleted; a duplicate says so", async ({ page }) => {
  const state = await brain(page, { items: [media(1), media(2, { url: "https://drive.google.com/file/d/abc123/view", name: "" }), media(3, { url: "https://cdn.example.com/clip.mp4", name: "Clip" })] });
  await page.goto("/library");
  const grid = page.getByRole("region", { name: "Media", exact: true }).getByRole("listitem");
  await expect(grid).toHaveCount(3);
  // An image link and a Drive share show their picture; a video a file tile with the host.
  await expect(grid.nth(0).locator("img")).toHaveAttribute("src", "https://cdn.example.com/photo-1.png");
  await expect(grid.nth(1).locator("img")).toHaveAttribute("src", /drive\.google\.com\/thumbnail\?id=abc123/);
  await expect(grid.nth(2)).toContainText("cdn.example.com");

  await page.getByLabel("Link", { exact: true }).fill("https://cdn.example.com/new.jpg");
  await page.getByLabel("Name (optional)").fill("Launch shot");
  await page.getByRole("button", { name: "Add to library" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Launch shot." })).toBeVisible();
  await expect(grid.first()).toContainText("Launch shot");

  await page.getByLabel("Link", { exact: true }).fill("https://cdn.example.com/photo-1.png");
  await page.getByRole("button", { name: "Add to library" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already" })).toHaveText("That link is already in the library.");

  await page.getByLabel("Search media").fill("clip");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(grid).toHaveCount(1);
  await page.getByLabel("Search media").fill("");
  await page.getByLabel("Search media").press("Enter");
  await expect(grid).toHaveCount(4);

  await page.getByRole("button", { name: "Rename Clip" }).click();
  const field = page.getByLabel("New name for Clip");
  await expect(field).toBeFocused();
  await field.fill("Teaser");
  await field.press("Enter");
  await expect(page.getByRole("button", { name: "Rename Teaser" })).toBeFocused();
  expect(state.items.find((i) => i.id === "m3")!.name).toBe("Teaser");

  await page.getByRole("button", { name: "Delete Teaser" }).click();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByRole("button", { name: "Delete Teaser" })).toBeFocused();
  await page.getByRole("button", { name: "Delete Teaser" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted Teaser." })).toBeFocused();
  await expect(grid).toHaveCount(3);
  expect(state.items.some((i) => i.id === "m3")).toBe(false);
});

test("Load more appends the next page", async ({ page }) => {
  await brain(page, { items: Array.from({ length: 30 }, (_, i) => media(i + 1)) });
  await page.goto("/library");
  const grid = page.getByRole("region", { name: "Media", exact: true }).getByRole("listitem");
  await expect(grid).toHaveCount(24);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(grid).toHaveCount(30);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("snippets are created, edited and deleted; a taken name says so", async ({ page }) => {
  const state = await brain(page, { snippets: [snip("s1", "caption", "Sign off", "Thanks for reading!")] });
  await page.goto("/library");
  await page.getByRole("tab", { name: "Media" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Snippets" })).toBeFocused();
  const captions = page.getByRole("region", { name: "Captions" });
  const tags = page.getByRole("region", { name: "Hashtag groups" });
  await expect(captions.getByRole("heading", { name: "Sign off" })).toBeVisible();
  await expect(tags.getByText("No hashtag groups yet.")).toBeVisible();

  await tags.getByText("New hashtag group").click();
  await tags.getByLabel("Name").fill("Launch");
  await tags.getByLabel("Hashtags").fill("#launch #ship");
  await expect(tags.getByText("13 characters")).toBeVisible();
  await tags.getByRole("button", { name: "Save hashtag group" }).click();
  await expect(tags.getByRole("heading", { name: "Launch" })).toBeVisible();
  expect(state.snippets.find((s) => s.name === "Launch")).toMatchObject({ kind: "hashtags", body: "#launch #ship" });

  await captions.getByText("New caption").click();
  await captions.getByLabel("Name").fill("Sign off");
  await captions.getByLabel("Text").fill("Bye");
  await captions.getByRole("button", { name: "Save caption" }).click();
  await expect(captions.getByRole("alert")).toHaveText("Another snippet already has that name. Pick a different one.");

  await captions.getByRole("button", { name: "Edit Sign off" }).click();
  const editName = captions.getByLabel("Name").first();
  await expect(editName).toBeFocused();
  await editName.fill("Outro");
  await captions.getByRole("button", { name: "Save changes" }).click();
  await expect(captions.getByRole("heading", { name: "Outro" })).toBeVisible();
  expect(state.snippets.find((s) => s.id === "s1")!.name).toBe("Outro");

  await captions.getByRole("button", { name: "Delete Outro" }).click();
  await captions.getByRole("button", { name: "Yes, delete" }).click();
  await expect(captions.getByRole("status").filter({ hasText: "Deleted Outro." })).toBeFocused();
  expect(state.snippets.some((s) => s.id === "s1")).toBe(false);
});

test("the composer's picker appends library links up to the free slots", async ({ page }) => {
  await brain(page, { items: Array.from({ length: 6 }, (_, i) => media(i + 1)) });
  await page.goto("/posts/new");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/own.png");
  const open = page.getByRole("button", { name: "Add from library" });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Add from library" });
  await expect(dialog).toBeVisible();
  // Bluesky takes 4: one is used, so 3 can be picked.
  await expect(dialog.getByText("0 of 3 picked")).toBeVisible();
  for (const n of [2, 1, 3]) await dialog.getByRole("checkbox", { name: `Photo ${n}` }).check();
  await expect(dialog.getByRole("checkbox", { name: "Photo 4" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Add 3" }).click();
  await expect(dialog).toBeHidden();
  await expect(open).toHaveCount(0);
  for (const [i, url] of ["https://example.com/own.png", "https://cdn.example.com/photo-2.png", "https://cdn.example.com/photo-1.png", "https://cdn.example.com/photo-3.png"].entries())
    await expect(page.getByLabel(`Image ${i + 1} link`)).toHaveValue(url);

  // Escape closes the picker and focus goes back to its button.
  await page.getByRole("button", { name: "Remove image 4" }).click();
  await page.getByRole("button", { name: "Add from library" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Add from library" })).toBeFocused();
});

test("Save to library saves a composer link and says when it is already there", async ({ page }) => {
  const state = await brain(page, { items: [media(1)] });
  await page.goto("/posts/new");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/fresh.png");
  await page.getByRole("button", { name: "Save image 1 to library" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved image 1 to the library." })).toBeVisible();
  expect(state.items[0]).toMatchObject({ url: "https://example.com/fresh.png" });
  await page.getByLabel("Image 1 link").fill("https://cdn.example.com/photo-1.png");
  await page.getByRole("button", { name: "Save image 1 to library" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Image 1 is already in the library." })).toBeVisible();
});

test("Insert snippet puts the body at the cursor in the shared text and a network's own text", async ({ page }) => {
  await brain(page, { accounts: [alice, linked], snippets: [snip("s1", "caption", "Sign off", "Thanks for reading!"), snip("s2", "hashtags", "Launch", "#launch #ship")] });
  await page.goto("/posts/new");
  const body = page.getByLabel("Post", { exact: true });
  await body.fill("Big news today");
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(8, 8));
  const insert = page.getByRole("button", { name: "Insert snippet into Post" });
  await insert.click();
  const menu = page.getByRole("menu", { name: "Snippets for Post" });
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /Launch/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(body).toHaveValue("Big news #launch #ship today");
  await expect(body).toBeFocused();
  expect(await body.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(22);

  // Escape closes the menu and focus returns to its button.
  await insert.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(insert).toBeFocused();

  await page.getByRole("tab", { name: "LinkedIn" }).click();
  await page.getByRole("button", { name: "Customize for LinkedIn" }).click();
  const own = page.getByLabel("LinkedIn text");
  await expect(own).toHaveValue("Big news #launch #ship today");
  await own.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  await page.getByRole("button", { name: "Insert snippet into LinkedIn text" }).click();
  await page.getByRole("menuitem", { name: /Sign off/ }).click();
  await expect(own).toHaveValue("Big news #launch #ship today\nThanks for reading!");
  await expect(own).toBeFocused();
});
