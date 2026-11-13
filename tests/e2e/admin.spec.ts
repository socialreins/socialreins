import { expect, test, type Page, type Route } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin", locale: "en-US" });

const me = (isAdmin: boolean) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", role: "owner" },
  is_admin: isAdmin,
});
const signup = (id: string, email: string, created_at: string, verified_at: string | null = null, approved_at: string | null = null) => ({
  id,
  email,
  source: "landing",
  created_at,
  verified_at,
  approved_at,
});
const overview = {
  users: 1234,
  new_users_7d: 12,
  teams: 300,
  accounts: { total: 7, by_provider: { bluesky: 4, x: 2, mastodon: 1 } },
  posts: { scheduled: 5, published: 40, failed: 2, draft: 9 },
  waitlist: { total: 1200, verified: 700, approved: 30 },
};
const users = Array.from({ length: 5 }, (_, i) => ({
  id: `u${i}`,
  email: `user${i}@example.com`,
  name: `User ${i}`,
  is_admin: i === 0,
  created_at: "2026-11-01T10:00:00Z",
  last_sign_in_at: i === 0 ? "2026-11-10T10:00:00Z" : null,
  teams: i === 0 ? [{ id: "t1", name: "Acme", role: "owner" }, { id: "t2", name: "Globex", role: "member" }] : [],
}));
const teams = [
  { id: "t1", name: "Acme", created_at: "2026-10-01T10:00:00Z", members: 3, accounts: 4, posts: 1500, owner_email: "ada@example.com" },
  { id: "t2", name: "Globex", created_at: "2026-10-02T10:00:00Z", members: 1, accounts: 0, posts: 0, owner_email: null },
];

async function brain(page: Page, isAdmin = true) {
  const state = {
    signups: [
      signup("w3", "newest@example.com", "2026-11-02T10:00:00Z"),
      signup("w2", "new@example.com", "2026-11-01T10:00:00Z"),
      signup("w1", "old@example.com", "2026-10-20T10:00:00Z", "2026-10-21T08:00:00Z", "2026-10-22T08:00:00Z"),
    ],
    // Every admin GET as path and query, in order.
    asked: [] as string[],
    writes: [] as string[],
    mail: "sent" as "sent" | "failed" | "already_approved",
    settings: { mode: "closed", domains: [] as string[], source: "env" },
    saves: [] as unknown[],
    saveError: null as { status: number; error: string } | null,
  };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(isAdmin) }));
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/lists$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));

  const get = (route: Route) => {
    const url = new URL(route.request().url());
    state.asked.push(url.pathname.replace("/v1/admin/", "") + url.search);
    return url.searchParams;
  };
  await page.route(/\/v1\/admin\/overview$/, (route) => {
    get(route);
    return route.fulfill({ json: overview });
  });
  await page.route(/\/v1\/admin\/waitlist(\?.*)?$/, (route) => {
    const params = get(route);
    const verified = params.get("verified");
    const q = params.get("q") ?? "";
    const rows = state.signups.filter((s) => (verified === null || (verified === "true") === (s.verified_at !== null)) && s.email.includes(q));
    return route.fulfill({ json: { total: 1200, verified: 700, signups: rows } });
  });
  await page.route(/\/v1\/admin\/waitlist\/[^/]+(\/approve)?$/, (route) => {
    const req = route.request();
    const [, id, approve] = new URL(req.url()).pathname.match(/waitlist\/([^/]+)(\/approve)?$/)!;
    state.writes.push(`${req.method()} ${id}${approve ?? ""}`);
    const found = state.signups.find((s) => s.id === id);
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (req.method() === "DELETE") {
      state.signups = state.signups.filter((s) => s.id !== id);
      return route.fulfill({ status: 204 });
    }
    found.approved_at ??= "2026-11-12T09:00:00Z";
    return route.fulfill({ json: { signup: found, mail: state.mail } });
  });
  // 5 users in all; the page asked for is cut from them.
  await page.route(/\/v1\/admin\/users(\?.*)?$/, (route) => {
    const params = get(route);
    const q = params.get("q") ?? "";
    const offset = Number(params.get("offset") ?? 0);
    const found = users.filter((u) => u.email.includes(q));
    return route.fulfill({ json: { total: found.length, users: found.slice(offset, offset + Number(params.get("limit") ?? 50)) } });
  });
  await page.route(/\/v1\/admin\/teams(\?.*)?$/, (route) => {
    const q = get(route).get("q") ?? "";
    const found = teams.filter((t) => t.name.toLowerCase().includes(q));
    return route.fulfill({ json: { total: found.length, teams: found } });
  });
  await page.route(/\/v1\/admin\/settings\/signup$/, (route) => {
    const req = route.request();
    if (req.method() !== "PUT") return route.fulfill({ json: state.settings });
    state.saves.push(req.postDataJSON());
    if (state.saveError) return route.fulfill({ status: state.saveError.status, json: { error: state.saveError.error } });
    state.settings = { ...req.postDataJSON(), source: "saved" };
    return route.fulfill({ json: state.settings });
  });
  return state;
}

const main = (page: Page) => page.getByRole("main");
const rows = (page: Page) => page.getByRole("table").locator("tbody tr");

test("only site admins get the Admin console link, and it opens a separate console", async ({ page }) => {
  await brain(page, false);
  await page.goto("/posts");
  await expect(page.getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin console" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Waitlist", exact: true })).toHaveCount(0);

  await page.unrouteAll();
  await brain(page, true);
  await page.goto("/posts");
  await expect(page.getByRole("link", { name: "Waitlist", exact: true })).toHaveCount(0);
  await page.locator("aside button[data-account]:visible").click();
  await page.getByRole("link", { name: "Admin console" }).click();
  await expect(page).toHaveURL("/admin");
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(page.locator(".admin-root")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Admin console");
  await expect(page.getByRole("link", { name: "Posts", exact: true })).toHaveCount(0);
  await page.locator("aside button[data-account]:visible").click();
  await page.getByRole("link", { name: "Back to the app" }).click();
  await expect(page).toHaveURL("/home");
});

test("the admin console sends a non-admin to the app", async ({ page }) => {
  await brain(page, false);
  for (const path of ["/admin", "/admin/users", "/admin/teams", "/admin/waitlist", "/admin/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/home");
  }
});

test("the sidebar lists the five admin pages and marks the current one", async ({ page }) => {
  await brain(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "App" });
  await expect(nav.getByRole("link")).toHaveText(["Overview", "Users", "Teams", "Waitlist", "Sign-up settings"]);
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Users" }).click();
  await expect(page).toHaveURL("/admin/users");
  await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  // Overview is the parent path of every page, and must not stay marked.
  await expect(nav.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  await nav.getByRole("link", { name: "Sign-up settings" }).click();
  await expect(page).toHaveURL("/admin/settings");
  await expect(page.getByRole("heading", { name: "Sign-up settings", level: 1 })).toBeVisible();
});

test("the overview shows the totals and links to the pages", async ({ page }) => {
  await brain(page);
  await page.goto("/admin");
  const card = (name: string) => main(page).getByRole("region", { name });
  await expect(card("Users")).toContainText("1,234");
  await expect(card("Users")).toContainText("New in 7 days12");
  await expect(card("Teams")).toContainText("300");
  await expect(card("Waitlist")).toContainText("1,200");
  await expect(card("Waitlist")).toContainText("Verified700");
  await expect(card("Waitlist")).toContainText("Approved30");
  await expect(card("Connected accounts")).toContainText("7");
  // The app's own order and names, then a network this build doesn't know by its id.
  await expect(card("Connected accounts").locator("dl > div")).toHaveText(["Bluesky4", "X2", "mastodon1"]);
  await expect(card("Posts")).toContainText("56");
  await expect(card("Posts").locator("dl > div")).toHaveText(["Scheduled5", "Published40", "Failed2", "Draft9"]);

  await expect(card("Teams").getByRole("link", { name: "Teams" })).toHaveAttribute("href", "/admin/teams");
  await expect(card("Waitlist").getByRole("link", { name: "Waitlist" })).toHaveAttribute("href", "/admin/waitlist");
  await card("Users").getByRole("link", { name: "Users" }).click();
  await expect(page).toHaveURL("/admin/users");
});

test("users: the table, search and paging in the URL", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/users?limit=2");
  await expect(rows(page)).toHaveCount(2);
  const first = rows(page).nth(0);
  await expect(first.getByRole("rowheader")).toHaveText("User 0Admin");
  await expect(first).toContainText("user0@example.com");
  await expect(first).toContainText("Acme (Owner)");
  await expect(first).toContainText("Globex (Member)");
  await expect(first).toContainText("Nov 1, 2026");
  await expect(first).toContainText("Nov 10, 2026");
  await expect(rows(page).nth(1)).toContainText("Never, or signed out");
  await expect(rows(page).nth(1)).not.toContainText("Admin");
  await expect(main(page).getByText("Showing 1 to 2 of 5")).toBeVisible();

  const pages = page.getByRole("navigation", { name: "Pages" });
  await expect(pages.getByRole("link", { name: "Previous" })).toHaveCount(0);
  await pages.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL("/admin/users?limit=2&offset=2");
  await expect(main(page).getByText("Showing 3 to 4 of 5")).toBeVisible();
  await pages.getByRole("link", { name: "Next" }).click();
  await expect(main(page).getByText("Showing 5 to 5 of 5")).toBeVisible();
  await expect(pages.getByRole("link", { name: "Next" })).toHaveCount(0);

  // A reload keeps the page.
  await page.reload();
  await expect(page).toHaveURL("/admin/users?limit=2&offset=4");
  await expect(rows(page)).toHaveText([/user4@example\.com/]);
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Previous" }).click();
  await expect(page).toHaveURL("/admin/users?limit=2&offset=2");

  // Past the end (a hand-edited URL, or rows gone): Previous goes to the last page with rows, and a huge number is ignored.
  await page.goto("/admin/users?limit=2&offset=40");
  await expect(main(page).getByText("Showing 0 of 5")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link")).toHaveText(["Previous"]);
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Previous" }).click();
  await expect(page).toHaveURL("/admin/users?limit=2&offset=4");
  await expect(rows(page)).toHaveText([/user4@example\.com/]);
  await page.goto(`/admin/users?limit=2&offset=${"9".repeat(30)}`);
  await expect(main(page).getByText("Showing 1 to 2 of 5")).toBeVisible();
  await page.goto("/admin/users?limit=2&offset=2");
  await expect(main(page).getByText("Showing 3 to 4 of 5")).toBeVisible();

  // A search starts again at the first page.
  await page.getByRole("searchbox", { name: "Search by name or email" }).fill("user3");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL("/admin/users?q=user3&limit=2");
  await expect(rows(page)).toHaveText([/user3@example\.com/]);
  await expect(main(page).getByText("Showing 1 to 1 of 1")).toBeVisible();
  await page.getByRole("searchbox").fill("nobody");
  await page.getByRole("searchbox").press("Enter");
  await expect(main(page).getByText('No users match "nobody".')).toBeVisible();
  await expect(main(page).getByText("Showing 0 of 0")).toBeVisible();
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL("/admin/users?limit=2");
  await expect(page.getByRole("searchbox")).toHaveValue("");

  expect(state.asked).toEqual([
    "users?limit=2",
    "users?limit=2&offset=2",
    "users?limit=2&offset=4",
    "users?limit=2&offset=4",
    "users?limit=2&offset=2",
    "users?limit=2&offset=40",
    "users?limit=2&offset=4",
    "users?limit=2",
    "users?limit=2&offset=2",
    "users?q=user3&limit=2",
    "users?q=nobody&limit=2",
    "users?limit=2",
  ]);
});

test("teams: the table and search", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/teams");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("columnheader")).toHaveText(["Name", "Owner", "Members", "Accounts", "Posts", "Created"]);
  await expect(rows(page).nth(0).getByRole("rowheader")).toHaveText("Acme");
  await expect(rows(page).nth(0).getByRole("cell")).toHaveText(["ada@example.com", "3", "4", "1,500", "Oct 1, 2026"]);
  await expect(rows(page).nth(1)).toContainText("No owner");
  await expect(main(page).getByText("Showing 1 to 2 of 2")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages" })).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search by team name" }).fill("glob");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL("/admin/teams?q=glob");
  await expect(rows(page)).toHaveText([/Globex/]);
  expect(state.asked).toEqual(["teams", "teams?q=glob"]);
});

test("the waitlist shows totals and signups, filtered in ?verified= and searched in ?q=", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/waitlist");
  await expect(page.getByRole("heading", { name: "Signups" })).toBeVisible();
  const total = page.locator("dl > div");
  await expect(total).toHaveText(["Total1,200", "Verified700", "Unverified500", "Approved30"]);
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(1)).toContainText("new@example.com");
  await expect(rows(page).nth(1)).toContainText("landing");
  await expect(rows(page).nth(1)).toContainText("Nov 1, 2026");
  await expect(rows(page).nth(1)).toContainText("Not verified");
  await expect(rows(page).nth(2)).toContainText("Verified Oct 21, 2026");
  await expect(rows(page).nth(2)).toContainText("Approved Oct 22, 2026");
  // An approved entry has nothing left to approve.
  await expect(rows(page).nth(2).getByRole("button")).toHaveText(["Remove"]);

  const filter = page.getByRole("navigation", { name: "Filter" });
  await filter.getByRole("link", { name: "Verified", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/waitlist\?verified=true$/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).nth(0)).toContainText("old@example.com");
  await filter.getByRole("link", { name: "Not verified" }).click();
  await expect(page).toHaveURL(/\/admin\/waitlist\?verified=false$/);
  await expect(rows(page).nth(0)).toContainText("newest@example.com");
  await expect(filter.getByRole("link", { name: "Not verified" })).toHaveAttribute("aria-current", "true");

  // The search keeps the filter, and the filter keeps the search.
  await page.getByRole("searchbox", { name: "Search by email" }).fill("new@");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL("/admin/waitlist?verified=false&q=new%40");
  await expect(rows(page)).toHaveText([/new@example\.com/]);
  await filter.getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL("/admin/waitlist?q=new%40");
  await page.getByRole("searchbox").fill("zzz");
  await page.getByRole("searchbox").press("Enter");
  await expect(main(page).getByText('No signups match "zzz".')).toBeVisible();
  expect(state.asked.filter((a) => a.startsWith("waitlist"))).toEqual([
    "waitlist",
    "waitlist?verified=true",
    "waitlist?verified=false",
    "waitlist?verified=false&q=new%40",
    "waitlist?q=new%40",
    "waitlist?q=zzz",
  ]);
});

test("approve says what happened to the email, for each of brain's three answers", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/waitlist");
  const status = main(page).getByRole("status");

  await page.getByRole("button", { name: "Approve newest@example.com" }).click();
  await expect(status).toHaveText("Approved newest@example.com. An email telling them they can sign up was sent.");
  await expect(status).toBeFocused();
  // The row changes in place: the badge shows, Approve is gone, the total goes up.
  await expect(rows(page).nth(0)).toContainText("Approved Nov 12, 2026");
  await expect(page.getByRole("button", { name: "Approve newest@example.com" })).toHaveCount(0);
  await expect(page.locator("dl > div").nth(3)).toHaveText("Approved31");

  state.mail = "failed";
  await page.getByRole("button", { name: "Approve new@example.com" }).click();
  await expect(status).toHaveText(
    "Approved new@example.com, so they can sign up, but the email could not be sent. They were not told: let them know another way.",
  );
  await expect(rows(page).nth(1)).toContainText("Approved Nov 12, 2026");
  await expect(page.locator("dl > div").nth(3)).toHaveText("Approved32");
  expect(state.writes).toEqual(["POST w3/approve", "POST w2/approve"]);
});

test("approve tells an entry someone else approved meanwhile, and a missing one", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/waitlist");
  await expect(rows(page)).toHaveCount(3);
  // Another admin approved it after this page loaded.
  state.mail = "already_approved";
  await page.getByRole("button", { name: "Approve newest@example.com" }).click();
  await expect(main(page).getByRole("status")).toHaveText("newest@example.com was already approved. No new email was sent.");
  await expect(rows(page).nth(0)).toContainText("Approved Nov 12, 2026");
  await expect(page.locator("dl > div").nth(3)).toHaveText("Approved30");

  // Another admin removed it: the page says so, and the row and the total follow.
  state.signups = state.signups.filter((s) => s.id !== "w2");
  await page.getByRole("button", { name: "Approve new@example.com" }).click();
  const alert = main(page).getByRole("alert");
  await expect(alert).toHaveText("Someone else already removed that entry. It is gone from the list.");
  await expect(rows(page)).toHaveText([/newest@example\.com/, /old@example\.com/]);
  await expect(page.locator("dl > div")).toHaveText(["Total1,199", "Verified700", "Unverified499", "Approved30"]);

  // The same for Remove, here of an approved, verified entry.
  state.signups = state.signups.filter((s) => s.id !== "w1");
  await page.getByRole("button", { name: "Remove old@example.com" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(alert).toHaveText("Someone else already removed that entry. It is gone from the list.");
  await expect(rows(page)).toHaveText([/newest@example\.com/]);
  await expect(page.locator("dl > div")).toHaveText(["Total1,198", "Verified699", "Unverified499", "Approved29"]);
});

test("approve and remove tell an admin whose rights are gone, in the console's words", async ({ page }) => {
  await brain(page);
  await page.goto("/admin/waitlist");
  await expect(rows(page)).toHaveCount(3);
  await page.route(/\/v1\/admin\/waitlist\/[^/]+(\/approve)?$/, (route) => route.fulfill({ status: 403, json: { error: "forbidden" } }));
  await page.getByRole("button", { name: "Approve newest@example.com" }).click();
  await expect(main(page).getByRole("alert")).toHaveText("You don't have access to the admin panel.");
  await page.getByRole("button", { name: "Remove new@example.com" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(main(page).getByRole("alert")).toHaveText("You don't have access to the admin panel.");
  await expect(rows(page)).toHaveCount(3);
});

test("remove asks first, warns about an approval, and drops the row", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/waitlist");

  // Cancel changes nothing and puts focus back on Remove.
  await page.getByRole("button", { name: "Remove new@example.com" }).click();
  await expect(main(page).getByText("Remove new@example.com from the waitlist?")).toBeVisible();
  await expect(main(page).getByText(/takes the approval away/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Yes, remove" })).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Remove new@example.com" })).toBeFocused();
  expect(state.writes).toEqual([]);
  await expect(rows(page)).toHaveCount(3);

  // An approved, verified entry: the warning, then every total follows.
  await page.getByRole("button", { name: "Remove old@example.com" }).click();
  await expect(
    main(page).getByText(
      "Remove old@example.com from the waitlist? It is approved: removing it takes the approval away, so this person may no longer be able to sign up.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(main(page).getByRole("status")).toHaveText("Removed old@example.com from the waitlist.");
  await expect(main(page).getByRole("status")).toBeFocused();
  await expect(rows(page)).toHaveCount(2);
  await expect(main(page).getByText("old@example.com", { exact: true })).toHaveCount(0);
  await expect(page.locator("dl > div")).toHaveText(["Total1,199", "Verified699", "Unverified500", "Approved29"]);
  expect(state.writes).toEqual(["DELETE w1"]);
});

test("sign-up settings: shows the current rules and saves a domain list", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/settings");
  const group = page.getByRole("group", { name: "Who can create an account" });
  await expect(group.getByRole("radio")).toHaveCount(3);
  await expect(group.getByRole("radio", { name: /^Closed/ })).toBeChecked();
  await expect(main(page).getByText("Invited people, approved waitlist entries and the owner can always sign up, whatever is chosen here.")).toBeVisible();
  await expect(main(page).getByText("The current setting comes from the server's environment. Saving here takes over from it.")).toBeVisible();
  // The list shows only with the third choice.
  await expect(page.getByRole("textbox", { name: "Domains and addresses" })).toHaveCount(0);

  await group.getByRole("radio", { name: /^Only these domains or addresses/ }).check();
  await page.getByRole("textbox", { name: "Domains and addresses" }).fill("Example.com, acme.io\nada@example.org\nexample.com");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(main(page).getByRole("status")).toHaveText("Sign-up settings saved.");
  expect(state.saves).toEqual([{ mode: "domains", domains: ["example.com", "acme.io", "ada@example.org"] }]);
  // brain's answer is shown: the cleaned list, and where it now comes from.
  await expect(page.getByRole("textbox", { name: "Domains and addresses" })).toHaveValue("example.com\nacme.io\nada@example.org");
  await expect(main(page).getByText("The current setting was saved here, and takes the place of the server's environment.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: /^Only these domains or addresses/ })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Domains and addresses" })).toHaveValue("example.com\nacme.io\nada@example.org");
});

test("sign-up settings: Closed and Open send the saved list, never the hidden draft", async ({ page }) => {
  const state = await brain(page);
  state.settings = { mode: "domains", domains: ["example.com"], source: "saved" };
  await page.goto("/admin/settings");
  const list = page.getByRole("textbox", { name: "Domains and addresses" });
  await expect(list).toHaveValue("example.com");
  // A draft brain would refuse, then another choice hides the box.
  await list.fill("not a domain!");
  await page.getByRole("radio", { name: /^Closed/ }).check();
  await expect(list).toHaveCount(0);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(main(page).getByRole("status")).toHaveText("Sign-up settings saved.");
  expect(state.saves).toEqual([{ mode: "closed", domains: ["example.com"] }]);
  // The saved list is back when the third choice is picked again.
  await page.getByRole("radio", { name: /^Only these domains or addresses/ }).check();
  await expect(list).toHaveValue("example.com");
});

test("sign-up settings: opening to everyone asks once more", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/settings");
  await page.getByRole("radio", { name: /^Open to everyone/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(main(page).getByText("Open sign-up to everyone? Anyone will be able to create an account, with no invitation or approval.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes, open sign-up" })).toBeFocused();
  expect(state.saves).toEqual([]);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
  expect(state.saves).toEqual([]);

  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Yes, open sign-up" }).click();
  await expect(main(page).getByRole("status")).toHaveText("Sign-up settings saved.");
  expect(state.saves).toEqual([{ mode: "open", domains: [] }]);

  // Already open: saving again has nothing to warn about, and closing never asks.
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => state.saves.length).toBe(2);
  await page.getByRole("radio", { name: /^Closed/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => state.saves.length).toBe(3);
  expect(state.saves[2]).toEqual({ mode: "closed", domains: [] });
});

test("sign-up settings: a stale sign-in and brain's refusals are explained", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/admin/settings");
  await page.getByRole("radio", { name: /^Only these domains or addresses/ }).check();
  const list = page.getByRole("textbox", { name: "Domains and addresses" });
  await list.fill("example.com");

  state.saveError = { status: 403, error: "reauth_required" };
  await page.getByRole("button", { name: "Save" }).click();
  const alert = main(page).getByRole("alert");
  await expect(alert).toContainText("needs a fresh sign-in");
  await expect(alert.getByRole("button", { name: "an emailed link" })).toBeVisible();
  await expect(alert.getByRole("link", { name: "Sign in again" })).toHaveCount(0);
  // Nothing typed is lost.
  await expect(list).toHaveValue("example.com");

  state.saveError = { status: 422, error: "invalid_domains" };
  await list.fill("not a domain");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText(
    "That list can't be saved. Give at least one entry and at most 50, each a plain domain like example.com or a full email address.",
  );
  await expect(list).toHaveAttribute("aria-invalid", "true");

  state.saveError = { status: 422, error: "invalid_mode" };
  await page.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText("Pick one of the three choices.");
  await expect(list).not.toHaveAttribute("aria-invalid");

  state.saveError = null;
  await list.fill("example.com");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(main(page).getByRole("status")).toHaveText("Sign-up settings saved.");
  await expect(alert).toHaveCount(0);
});

test("every admin page tells a non-admin they have no access", async ({ page }) => {
  await brain(page, true);
  // brain decides; an admin flag that is stale still gets brain's refusal shown.
  await page.route(/\/v1\/admin\//, (route) => route.fulfill({ status: 403, json: { error: "forbidden" } }));
  for (const path of ["/admin", "/admin/users", "/admin/teams", "/admin/waitlist", "/admin/settings"]) {
    await page.goto(path);
    await expect(main(page).getByRole("alert")).toHaveText("You don't have access to the admin panel.");
    await expect(page.getByRole("table")).toHaveCount(0);
  }
});

test("a failed load says so on each page", async ({ page }) => {
  await brain(page, true);
  await page.route(/\/v1\/admin\//, (route) => route.fulfill({ status: 500, json: { error: "internal" } }));
  for (const [path, what] of [
    ["/admin", "The overview"],
    ["/admin/users", "The users"],
    ["/admin/teams", "The teams"],
    ["/admin/waitlist", "The waitlist"],
    ["/admin/settings", "The sign-up settings"],
  ]) {
    await page.goto(path);
    await expect(main(page).getByRole("alert")).toHaveText(`${what} couldn't be loaded. Something went wrong. Try again in a moment.`);
  }
});

test("the tables scroll sideways at phone width instead of widening the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await brain(page);
  for (const path of ["/admin/users", "/admin/teams", "/admin/waitlist"]) {
    await page.goto(path);
    await expect(rows(page).first()).toBeVisible();
    const box = page.locator(".card.overflow-x-auto");
    expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  for (const path of ["/admin", "/admin/settings"]) {
    await page.goto(path);
    await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
