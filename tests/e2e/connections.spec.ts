import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,

  current_team: { id: "t1", name: "Acme", role },
});
const alice = {
  id: "c1",
  provider: "bluesky",
  external_id: "did:plc:alice",
  handle: "alice.bsky.social",
  display_name: "Alice",
  avatar_url: "https://cdn.bsky.app/img/avatar/plain/did:plc:alice/a@jpeg",
  token_expires_at: null,
  set_ids: ["s1"],
  created_at: "2026-10-20T10:00:00Z",
};
const providers = [
  { provider: "bluesky", configured: true },
  { provider: "meta", configured: true },
  { provider: "threads", configured: false },
  { provider: "linkedin", configured: false },
  { provider: "x", configured: false },
  { provider: "tiktok", configured: false },
  { provider: "youtube", configured: false },
];

async function signedIn(page: Page, role: Role, accounts: unknown[] = [alice]) {
  const loads = { list: 0 };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => {
    loads.list++;
    return route.fulfill({ json: loads.list === 1 ? accounts : [...accounts, { ...alice, id: "c2", handle: "bob.bsky.social", display_name: null, avatar_url: null }] });
  });
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: providers }));
  // Avatars come from Bluesky's CDN; keep tests offline.
  await page.route("https://cdn.bsky.app/**", (route) => route.fulfill({ status: 404 }));
  return loads;
}

const openAdd = (page: Page) => page.getByRole("button", { name: "Add account" }).click();
const openBluesky = async (page: Page) => {
  await openAdd(page);
  await page.getByRole("dialog").getByRole("button", { name: "Bluesky" }).click();
};
const openSettings = (page: Page, name: string) => page.getByRole("button", { name: `Settings for ${name}` }).click();

test("accounts show one network at a time, as tabs", async ({ page }) => {
  const fb = { ...alice, id: "f1", provider: "facebook", handle: null, display_name: "Page One", avatar_url: null };
  await signedIn(page, "owner", [alice, fb]);
  await page.goto("/connections");
  const tabs = page.getByRole("tablist", { name: "Networks" }).getByRole("tab");
  await expect(tabs).toHaveText([/^Facebook\s*1$/, /^Bluesky\s*1$/]);
  // The first network shows; the others wait behind their tabs.
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Page One");
  await expect(page.getByRole("tabpanel")).not.toContainText("Alice");
  await tabs.nth(1).click();
  await expect(page.getByRole("tabpanel")).toContainText("Alice");
  await expect(page.getByRole("tabpanel")).not.toContainText("Page One");
  // Arrow keys move between tabs and wrap around.
  await page.keyboard.press("ArrowRight");
  await expect(tabs.first()).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("Page One");
});

test("coming back from a connect opens that network's tab", async ({ page }) => {
  const x = { ...alice, id: "x1", provider: "x", handle: "alice_x", display_name: "Alice X", avatar_url: null };
  await signedIn(page, "owner", [alice, x]);
  await page.goto("/connections");
  await expect(page.getByRole("tab", { name: /Bluesky/ })).toHaveAttribute("aria-selected", "true");
  await page.goto("/connections?connected=x");
  await expect(page.getByRole("tab", { name: /^X/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Alice X");
});

test("app links to connected accounts", async ({ page }) => {
  await signedIn(page, "owner");
  await page.goto("/home");
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page).toHaveURL("/connections");
});

test("connections sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/connections");
  await expect(page).toHaveURL("/login");
});

test("lists accounts and the provider grid", async ({ page }) => {
  await signedIn(page, "admin");
  await page.goto("/connections");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByText(/Bluesky, @alice\.bsky\.social\. Connected .*\./)).toBeVisible();
  await openAdd(page);
  const dialog = page.getByRole("dialog");
  // Facebook and Instagram connect together through Meta.
  for (const name of ["Facebook", "Instagram"]) {
    await expect(dialog.getByRole("link", { name })).toHaveAttribute("href", "http://localhost:8080/connections/meta/redirect");
  }
  await expect(dialog.getByRole("listitem").filter({ hasText: "YouTube" })).toContainText("Not set up");
  await expect(dialog.getByRole("link", { name: "YouTube" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Bluesky" }).click();
  const link = page.getByRole("link", { name: "open App passwords" });
  await expect(link).toHaveAttribute("href", "https://bsky.app/settings/app-passwords");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("connect Bluesky explains a refused password, clears it, then connects", async ({ page }) => {
  const loads = await signedIn(page, "owner");
  const bodies: unknown[] = [];
  await page.route("**/v1/connections/bluesky", (route) => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1
      ? route.fulfill({ status: 422, json: { error: "invalid_credentials" } })
      : route.fulfill({ status: 201, json: { ...alice, id: "c2", handle: "bob.bsky.social" } });
  });
  await page.goto("/connections");
  await openBluesky(page);
  await page.getByLabel("Bluesky handle").fill("@bob.bsky.social");
  await page.getByLabel("App password").fill("my-main-password");
  await page.getByRole("button", { name: "Connect Bluesky" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not your main Bluesky password" })).toBeVisible();
  await expect(page.getByLabel("App password")).toHaveValue("");
  await expect(page.getByLabel("App password")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("App password").fill("abcd-efgh-ijkl-mnop");
  await page.getByRole("button", { name: "Connect Bluesky" }).click();
  await expect(page.getByText("Connected @bob.bsky.social.")).toBeFocused();
  await expect(page.getByText("@bob.bsky.social", { exact: true })).toBeVisible();
  expect(loads.list).toBe(2);
  expect(bodies).toEqual([
    { handle: "@bob.bsky.social", app_password: "my-main-password" },
    { handle: "@bob.bsky.social", app_password: "abcd-efgh-ijkl-mnop" },
  ]);
});

for (const [code, status, text] of [
  ["invalid_handle", 422, "wasn't found on Bluesky"],
  ["unsupported_pds", 422, "can't connect to"],
  ["bluesky_unreachable", 502, "Bluesky couldn't be reached"],
  ["rate_limited", 429, "Too many connection attempts"],
  ["forbidden", 403, "Only team owners and admins"],
] as const) {
  test(`connect Bluesky explains ${code}`, async ({ page }) => {
    await signedIn(page, "owner");
    await page.route("**/v1/connections/bluesky", (route) => route.fulfill({ status, json: { error: code } }));
    await page.goto("/connections");
    await openBluesky(page);
    await page.getByLabel("Bluesky handle").fill("alice.bsky.social");
    await page.getByLabel("App password").fill("abcd-efgh-ijkl-mnop");
    await page.getByRole("button", { name: "Connect Bluesky" }).click();
    await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
    await expect(page.getByLabel("App password")).toHaveValue("");
  });
}

test("Connect Threads goes through brain and says how it went", async ({ page }) => {
  await signedIn(page, "owner");
  const threadsOn = providers.map((p) => (p.provider === "threads" ? { ...p, configured: true } : p));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: threadsOn }));
  await page.goto("/connections");
  // brain sends the browser to Threads and back; here it comes straight back connected.
  const back = new URL("/connections?connected=threads", page.url()).href;
  await page.route("http://localhost:8080/connections/threads/redirect", (route) =>
    route.fulfill({ status: 303, headers: { location: back } }),
  );
  await openAdd(page);
  const link = page.getByRole("dialog").getByRole("link", { name: "Threads", exact: true });
  await expect(link).toHaveAttribute("href", "http://localhost:8080/connections/threads/redirect");
  await link.click();
  await expect(page.getByRole("status").filter({ hasText: "Connected your Threads account." })).toBeVisible();
  // The flags are dropped, so a reload doesn't repeat the message.
  await expect(page).toHaveURL("/connections");
});

test("an account connected while a set is picked joins that set too", async ({ page }) => {
  await signedIn(page, "owner");
  const threadsOn = providers.map((p) => (p.provider === "threads" ? { ...p, configured: true } : p));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: threadsOn }));
  const set = (id: string, name: string) => ({ id, name, is_default: id === "s1", account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null });
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [set("s1", "Default"), set("s2", "English")] }));
  const puts: unknown[] = [];
  await page.route(/\/v1\/connections\/[^/]+\/sets$/, (route) => {
    puts.push([route.request().url().split("/").at(-2), route.request().postDataJSON()]);
    return route.fulfill({ json: { ...alice, id: "c2", set_ids: ["s1", "s2"] } });
  });
  await page.addInitScript(() => localStorage.setItem("current-set:t1", "s2"));
  await page.goto("/connections");
  const back = new URL("/connections?connected=threads", page.url()).href;
  await page.route("http://localhost:8080/connections/threads/redirect", (route) =>
    route.fulfill({ status: 303, headers: { location: back } }),
  );
  await openAdd(page);
  await page.getByRole("dialog").getByRole("link", { name: "Threads", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Connected your Threads account." })).toBeVisible();
  // Only the account that wasn't there before the connect (c2), not the old one (c1).
  await expect.poll(() => puts).toEqual([["c2", { set_ids: ["s1", "s2"] }]]);
  // A plain reload is not a connect, so nothing more is added.
  await page.reload();
  await expect(page.getByText("alice.bsky.social").first()).toBeVisible();
  expect(puts).toHaveLength(1);
});

test("Connect LinkedIn goes through brain and says how it went", async ({ page }) => {
  await signedIn(page, "owner");
  const on = providers.map((p) => (p.provider === "linkedin" ? { ...p, configured: true } : p));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: on }));
  await page.goto("/connections");
  const back = new URL("/connections?connected=linkedin", page.url()).href;
  await page.route("http://localhost:8080/connections/linkedin/redirect", (route) =>
    route.fulfill({ status: 303, headers: { location: back } }),
  );
  await openAdd(page);
  const link = page.getByRole("dialog").getByRole("link", { name: "LinkedIn", exact: true });
  await expect(link).toHaveAttribute("href", "http://localhost:8080/connections/linkedin/redirect");
  await link.click();
  await expect(page.getByRole("status").filter({ hasText: "Connected your LinkedIn account." })).toBeVisible();
  await expect(page).toHaveURL("/connections");
});

test("a LinkedIn connect brain refused is explained", async ({ page }) => {
  await signedIn(page, "owner");
  await page.goto("/connections?connect_error=linkedin_failed&provider=linkedin");
  await expect(page.getByRole("alert").filter({ hasText: "LinkedIn didn't let SocialReins connect the account." })).toBeVisible();
  await expect(page).toHaveURL("/connections");
});

test("Connect YouTube goes through brain and says how it went", async ({ page }) => {
  await signedIn(page, "owner");
  const on = providers.map((p) => (p.provider === "youtube" ? { ...p, configured: true } : p));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: on }));
  await page.goto("/connections");
  const back = new URL("/connections?connected=youtube", page.url()).href;
  await page.route("http://localhost:8080/connections/youtube/redirect", (route) =>
    route.fulfill({ status: 303, headers: { location: back } }),
  );
  await openAdd(page);
  const link = page.getByRole("dialog").getByRole("link", { name: "YouTube", exact: true });
  await expect(link).toHaveAttribute("href", "http://localhost:8080/connections/youtube/redirect");
  await link.click();
  await expect(page.getByRole("status").filter({ hasText: "Connected your YouTube account." })).toBeVisible();
  await expect(page).toHaveURL("/connections");
});

test("a YouTube connect brain refused is explained", async ({ page }) => {
  await signedIn(page, "owner");
  await page.goto("/connections?connect_error=youtube_failed&provider=youtube");
  await expect(page.getByRole("alert").filter({ hasText: "YouTube didn't let SocialReins connect the account." })).toBeVisible();
  await expect(page).toHaveURL("/connections");
  await page.goto("/connections?connect_error=no_channel&provider=youtube");
  await expect(page.getByRole("alert").filter({ hasText: "That Google account has no YouTube channel." })).toBeVisible();
  await page.goto("/connections?connect_error=missing_scopes&provider=youtube");
  await expect(page.getByRole("alert").filter({ hasText: "Tick every permission when YouTube asks" })).toBeVisible();
});

test("a connected YouTube channel shows its name and handle", async ({ page }) => {
  const channel = { ...alice, id: "c9", provider: "youtube", external_id: "UCabc", handle: "annleemakes", display_name: "Ann Lee Makes", avatar_url: null };
  await signedIn(page, "owner", [channel]);
  await page.goto("/connections");
  await expect(page.getByText("Ann Lee Makes", { exact: true })).toBeVisible();
  await expect(page.getByText(/YouTube, @annleemakes\. Connected /)).toBeVisible();
});

test("Connect X goes through brain and says how it went", async ({ page }) => {
  await signedIn(page, "owner");
  const on = providers.map((p) => (p.provider === "x" ? { ...p, configured: true } : p));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: on }));
  await page.goto("/connections");
  const back = new URL("/connections?connected=x", page.url()).href;
  await page.route("http://localhost:8080/connections/x/redirect", (route) =>
    route.fulfill({ status: 303, headers: { location: back } }),
  );
  await openAdd(page);
  const link = page.getByRole("dialog").getByRole("link", { name: "X", exact: true });
  await expect(link).toHaveAttribute("href", "http://localhost:8080/connections/x/redirect");
  await link.click();
  await expect(page.getByRole("status").filter({ hasText: "Connected your X account." })).toBeVisible();
  await expect(page).toHaveURL("/connections");
});

test("an X connect brain refused is explained", async ({ page }) => {
  await signedIn(page, "owner");
  await page.goto("/connections?connect_error=x_failed&provider=x");
  await expect(page.getByRole("alert").filter({ hasText: "X didn't let SocialReins connect the account." })).toBeVisible();
  await expect(page).toHaveURL("/connections");
  await page.goto("/connections?connect_error=missing_scopes&provider=x");
  await expect(page.getByRole("alert").filter({ hasText: "Tick every permission when X asks" })).toBeVisible();
});

test("a connected X account shows its name and handle, and asks for a reconnect when flagged", async ({ page }) => {
  const x = { ...alice, id: "c8", provider: "x", external_id: "2244994945", handle: "ann_lee", display_name: "Ann Lee", avatar_url: null };
  await signedIn(page, "owner", [x, { ...x, id: "c9", handle: "bob_x", display_name: "Bob", reconnect: true }]);
  await page.goto("/connections");
  await expect(page.getByText(/X, @ann_lee\. Connected /)).toBeVisible();
  await openSettings(page, "Bob");
  await expect(page.getByText("Reconnect needed.")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Reconnect Bob" })).toHaveAttribute("href", "http://localhost:8080/connections/x/redirect");
});

test("an account that ends soon or needs a reconnect shows a badge and a Reconnect button", async ({ page }) => {
  const li = { ...alice, provider: "linkedin", handle: null, avatar_url: null, external_id: "abc" };
  await signedIn(page, "owner", [
    { ...li, id: "l1", display_name: "Ok Ann", status: "ok", token_expires_at: "2027-01-10T10:00:00Z" },
    { ...li, id: "l2", display_name: "Soon Sam", status: "expiring", token_expires_at: "2026-11-20T10:00:00Z" },
    { ...li, id: "l3", display_name: "Gone Gia", status: "reconnect", token_expires_at: "2026-11-01T10:00:00Z" },
  ]);
  await page.goto("/connections");
  const card = (name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
  await expect(card("Ok Ann").getByText(/Reconnect|Ends/)).toHaveCount(0);
  await expect(card("Soon Sam").getByText(/^Ends /)).toBeVisible();
  await expect(card("Gone Gia").getByText("Reconnect needed", { exact: true })).toBeVisible();
  await openSettings(page, "Soon Sam");
  await expect(page.getByRole("dialog").getByText("Reconnect soon.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await openSettings(page, "Gone Gia");
  await expect(page.getByRole("dialog").getByText("Reconnect needed.")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Reconnect Gone Gia" })).toHaveAttribute("href", "http://localhost:8080/connections/linkedin/redirect");
});

test("a member sees the badge but no Reconnect button, and is not told to reconnect themselves", async ({ page }) => {
  const li = { ...alice, provider: "linkedin", handle: null, avatar_url: null, external_id: "abc", display_name: "Gone Gia", status: "reconnect" };
  await signedIn(page, "member", [li, { ...alice, id: "c5", display_name: "Old Bea", status: "reconnect" }]);
  await page.goto("/connections");
  await expect(page.getByText("Reconnect needed", { exact: true })).toHaveCount(1);
  await page.getByRole("tab", { name: /Bluesky/ }).click();
  await expect(page.getByText("Reconnect needed", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /^Reconnect/ })).toHaveCount(0);
  await page.getByRole("tab", { name: /LinkedIn/ }).click();
  await openSettings(page, "Gone Gia");
  await expect(page.getByRole("dialog").getByText("Ask a team owner or admin to reconnect it.")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link", { name: /^Reconnect/ })).toHaveCount(0);
});

test("owners and admins are told how to reconnect a Bluesky account", async ({ page }) => {
  await signedIn(page, "admin", [{ ...alice, status: "reconnect" }]);
  await page.goto("/connections");
  await openSettings(page, "Alice");
  await expect(page.getByText("To renew it, connect it again with a new app password through Add account.")).toBeVisible();
  await expect(page.getByText("Ask a team owner or admin to reconnect it.")).toHaveCount(0);
});

test("Connect TikTok goes through brain and a connected account shows its handle", async ({ page }) => {
  const tt = { ...alice, id: "c10", provider: "tiktok", external_id: "openid1", handle: "annlee", display_name: "Ann Lee", avatar_url: null };
  await signedIn(page, "owner", [tt]);
  const on = providers.map((p) => (p.provider === "tiktok" ? { ...p, configured: true } : p));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: on }));
  await page.goto("/connections");
  await expect(page.getByText(/TikTok, @annlee\. Connected /)).toBeVisible();
  const back = new URL("/connections?connected=tiktok", page.url()).href;
  await page.route("http://localhost:8080/connections/tiktok/redirect", (route) =>
    route.fulfill({ status: 303, headers: { location: back } }),
  );
  await openAdd(page);
  const link = page.getByRole("dialog").getByRole("link", { name: "TikTok", exact: true });
  await expect(link).toHaveAttribute("href", "http://localhost:8080/connections/tiktok/redirect");
  await link.click();
  await expect(page.getByRole("status").filter({ hasText: "Connected your TikTok account." })).toBeVisible();
});

test("a refused OAuth connect is explained", async ({ page }) => {
  await signedIn(page, "owner");
  await page.goto("/connections?connect_error=cancelled&provider=threads");
  await expect(page.getByRole("alert").filter({ hasText: "Threads connection was cancelled." })).toBeVisible();
  await expect(page).toHaveURL("/connections");
  await expect(page.getByRole("link", { name: "Connect Threads" })).toHaveCount(0);
});

test("disconnect asks first, then removes the account", async ({ page }) => {
  await signedIn(page, "owner");
  let method = "";
  await page.route("**/v1/connections/c1", (route) => {
    method = route.request().method();
    return route.fulfill({ status: 204 });
  });
  await page.goto("/connections");
  await openSettings(page, "Alice");
  const dialog = page.getByRole("dialog");
  const disconnect = dialog.getByRole("button", { name: "Disconnect", exact: true });
  await disconnect.click();
  const yes = page.getByRole("button", { name: "Yes, disconnect" });
  await expect(yes).toBeFocused();
  await expect(yes).toHaveAccessibleDescription(/Disconnect Alice\?/);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(disconnect).toBeFocused();
  expect(method).toBe("");
  await disconnect.click();
  await yes.click();
  await expect(page.getByText("Alice was disconnected.")).toBeFocused();
  await expect(page.getByText("No accounts connected yet.")).toBeVisible();
  expect(method).toBe("DELETE");
});

test("disconnecting an account that is already gone moves focus to the heading", async ({ page }) => {
  await signedIn(page, "owner");
  await page.route("**/v1/connections/c1", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/connections");
  await openSettings(page, "Alice");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Yes, disconnect" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already disconnected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connected accounts", level: 2 })).toBeFocused();
  await expect(page.getByText("No accounts connected yet.")).toBeVisible();
});

test("a connect that times out reloads the list, since brain may still finish", async ({ page }) => {
  // Make only the 30 second connect timeout fire at once; every other call keeps its real signal.
  await page.addInitScript(() => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = (ms: number) =>
      ms === 30_000 ? AbortSignal.abort(new DOMException("slow", "TimeoutError")) : real(ms);
  });
  const loads = await signedIn(page, "owner");
  await page.goto("/connections");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await openBluesky(page);
  await page.getByLabel("Bluesky handle").fill("bob.bsky.social");
  await page.getByLabel("App password").fill("abcd-efgh-ijkl-mnop");
  await page.getByRole("button", { name: "Connect Bluesky" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "taking a long time" })).toBeVisible();
  await expect(page.getByLabel("App password")).toHaveValue("");
  await expect(page.getByText("@bob.bsky.social", { exact: true })).toBeVisible();
  expect(loads.list).toBe(2);
});

test("the CSP allows only Bluesky's image path and Meta's, YouTube's, X's and TikTok's image CDNs for avatars", async ({ request }) => {
  const csp = (await request.get("/connections")).headers()["content-security-policy"];
  expect(csp).toContain(
    "img-src 'self' data: https://cdn.bsky.app/img/ https://*.fbcdn.net https://*.cdninstagram.com https://yt3.ggpht.com https://yt3.googleusercontent.com https://pbs.twimg.com https://*.tiktokcdn.com https://*.tiktokcdn-us.com;",
  );
});

const metaChoices = {
  facebook: [
    { id: "101", name: "Cafe", picture_url: "https://scontent.xx.fbcdn.net/101.jpg" },
    { id: "102", name: "Shop", picture_url: null },
  ],
  instagram: [{ id: "1784", name: "cafe", picture_url: null }],
};

test("a Meta login opens the picker and connects the picked accounts", async ({ page }) => {
  const loads = await signedIn(page, "owner");
  await page.route("https://scontent.xx.fbcdn.net/**", (route) => route.fulfill({ status: 404 }));
  const bodies: unknown[] = [];
  await page.route("**/v1/connections/meta/pick", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: metaChoices });
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: [{ ...alice, id: "c9", provider: "facebook" }, { ...alice, id: "c10", provider: "instagram" }] });
  });
  await page.goto("/connections?pick=meta");
  const picker = page.getByRole("region", { name: "Pick accounts to connect" });
  await expect(picker.getByRole("group", { name: "Facebook Pages" }).getByRole("checkbox")).toHaveCount(2);
  await expect(picker.getByRole("checkbox", { name: "cafe", exact: true })).toBeChecked();
  // The flag is dropped, so a reload doesn't reopen it.
  await expect(page).toHaveURL("/connections");
  await picker.getByRole("checkbox", { name: "Shop" }).uncheck();
  await picker.getByRole("button", { name: "Connect selected" }).click();
  await expect(page.getByText("Connected 2 accounts.")).toBeFocused();
  // The whole picker goes; the outcome stays.
  await expect(picker).toHaveCount(0);
  expect(bodies).toEqual([{ facebook: ["101"], instagram: ["1784"] }]);
  expect(loads.list).toBe(2);
});

test("the Meta picker can be cancelled, and says when nothing is picked", async ({ page }) => {
  await signedIn(page, "owner");
  let method = "";
  await page.route("**/v1/connections/meta/pick", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: metaChoices });
    method = route.request().method();
    return route.fulfill({ status: 204 });
  });
  await page.goto("/connections?pick=meta");
  const picker = page.getByRole("region", { name: "Pick accounts to connect" });
  for (const name of ["Cafe", "Shop", "cafe"]) await picker.getByRole("checkbox", { name, exact: true }).uncheck();
  await expect(picker.getByRole("button", { name: "Connect selected" })).toBeDisabled();
  await picker.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Nothing was connected.")).toBeFocused();
  await expect(picker).toHaveCount(0);
  expect(method).toBe("DELETE");
});

test("a broken Meta picture shows the initial", async ({ page }) => {
  await signedIn(page, "owner", [{ ...alice, provider: "facebook", display_name: "Cafe", avatar_url: "https://scontent.xx.fbcdn.net/gone.jpg" }]);
  await page.route("https://scontent.xx.fbcdn.net/**", (route) => route.fulfill({ status: 403 }));
  await page.goto("/connections");
  const card = page.getByRole("listitem").filter({ hasText: "Cafe" });
  await expect(card.getByText("C", { exact: true })).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);
});

test("a Meta pick that expires before Connect hides the form and says so", async ({ page }) => {
  await signedIn(page, "owner");
  let posts = 0;
  await page.route("**/v1/connections/meta/pick", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: metaChoices });
    posts++;
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.goto("/connections?pick=meta");
  const picker = page.getByRole("region", { name: "Pick accounts to connect" });
  await picker.getByRole("button", { name: "Connect selected" }).click();
  await expect(picker.getByRole("alert").filter({ hasText: "That Facebook sign-in expired" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "Connect selected" })).toHaveCount(0);
  await expect(picker.getByRole("checkbox")).toHaveCount(0);
  expect(posts).toBe(1);
});

test("a Meta pick with nothing new says everything is connected", async ({ page }) => {
  await signedIn(page, "owner");
  await page.route("**/v1/connections/meta/pick", (route) => route.fulfill({ json: { facebook: [], instagram: [] } }));
  await page.goto("/connections?pick=meta");
  const picker = page.getByRole("region", { name: "Pick accounts to connect" });
  await expect(picker.getByText("Every Page and Instagram account from that sign-in is already connected.")).toBeVisible();
  await expect(picker.getByRole("button", { name: "Connect selected" })).toHaveCount(0);
});

test("an expired Meta pick asks to connect again", async ({ page }) => {
  await signedIn(page, "owner");
  await page.route("**/v1/connections/meta/pick", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/connections?pick=meta");
  await expect(page.getByRole("alert").filter({ hasText: "That Facebook sign-in expired" })).toBeVisible();
});

test("members never see the Meta picker", async ({ page }) => {
  await signedIn(page, "member");
  let asked = false;
  await page.route("**/v1/connections/meta/pick", (route) => {
    asked = true;
    return route.fulfill({ json: metaChoices });
  });
  await page.goto("/connections?pick=meta");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pick accounts to connect" })).toHaveCount(0);
  expect(asked).toBe(false);
});

test("a refused Meta connect is explained under one name", async ({ page }) => {
  await signedIn(page, "owner");
  await page.goto("/connections?connect_error=no_pages&provider=meta");
  await expect(page.getByRole("alert").filter({ hasText: "Facebook didn't share any Pages." })).toBeVisible();
  await page.goto("/connections?connect_error=meta_failed&provider=meta");
  await expect(page.getByRole("alert").filter({ hasText: "Facebook and Instagram didn't let SocialReins connect" })).toBeVisible();
});

test("a member sees the list read-only", async ({ page }) => {
  await signedIn(page, "member");
  await page.goto("/connections");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByText("Only team owners and admins can connect or disconnect accounts.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Disconnect/ })).toHaveCount(0);
  await expect(page.getByLabel("App password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add account" })).toHaveCount(0);
});

test("disconnect asks to sign in again when brain needs it", async ({ page }) => {
  await signedIn(page, "owner");
  await page.route("**/v1/connections/c1", (route) => route.fulfill({ status: 403, json: { error: "reauth_required" } }));
  await page.goto("/connections");
  await openSettings(page, "Alice");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Yes, disconnect" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "needs a fresh sign-in" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "an emailed link" })).toBeVisible();
  await expect(alert.getByRole("link", { name: "Sign in again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toBeFocused();
});

test("flags a Bluesky account whose app password has no DM access", async ({ page }) => {
  await signedIn(page, "owner", [{ ...alice, dm_access: false }, { ...alice, id: "c3", handle: "carol.bsky.social", display_name: "Carol", dm_access: true }]);
  await page.goto("/connections");
  await openSettings(page, "Alice");
  await expect(page.getByRole("dialog")).toContainText("Allow access to your direct messages");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await openSettings(page, "Carol");
  await expect(page.getByRole("dialog")).not.toContainText("DMs off");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await openBluesky(page);
  await expect(page.locator("#bluesky-app-password-note")).toContainText("Allow access to your direct messages");
});
