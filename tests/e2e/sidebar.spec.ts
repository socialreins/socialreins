import { expect, test, type Page } from "@playwright/test";

const user = { id: "u1", email: "me@example.com", name: "Mira", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const key = { id: "k1", name: "Phone", created_at: "2026-10-01T10:00:00Z", last_used_at: null };

// passkeys: the list brain returns, or null to fail it.
async function brain(page: Page, passkeys: unknown[] | null = [key]) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/auth/passkeys", (route) => (passkeys ? route.fulfill({ json: passkeys }) : route.fulfill({ status: 500 })));
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [user.current_team] }));
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/lists$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));
}

const nav = (page: Page) => page.getByRole("navigation", { name: "App" });
const group = (page: Page, name: string) => nav(page).getByRole("button", { name, exact: true });
const accountButton = (page: Page) => page.locator("aside button[data-account]:visible");
const accountMenu = (page: Page) => page.locator(".account-menu");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Add a passkey" });

test("sidebar groups open and close and remember it", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  for (const name of ["Publish", "Engage", "Workspace"]) await expect(group(page, name)).toBeVisible();
  const engage = group(page, "Engage");
  await expect(engage).toHaveAttribute("aria-expanded", "true");
  await engage.click();
  await expect(engage).toHaveAttribute("aria-expanded", "false");
  await expect(nav(page).getByRole("link", { name: "Inbox" })).toBeHidden();
  await expect(page.locator(`#${await engage.getAttribute("aria-controls")}`)).toBeHidden();
  await page.reload();
  await expect(group(page, "Engage")).toHaveAttribute("aria-expanded", "false");
  await group(page, "Engage").click();
  await expect(nav(page).getByRole("link", { name: "Inbox" })).toBeVisible();
});

test("the group holding the current page stays open", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  await group(page, "Workspace").click();
  await expect(group(page, "Workspace")).toHaveAttribute("aria-expanded", "false");
  await page.goto("/team");
  await expect(group(page, "Workspace")).toHaveAttribute("aria-expanded", "true");
  const team = nav(page).getByRole("link", { name: "Team", exact: true });
  await expect(team).toHaveAttribute("aria-current", "page");
  await expect(group(page, "Workspace")).toHaveAttribute("aria-disabled", "true");
  await group(page, "Workspace").click({ force: true });
  await expect(team).toBeVisible();
});

test("the sidebar collapses to an icon rail and back, across reloads", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const expand = page.getByRole("button", { name: "Expand sidebar" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(group(page, "Publish")).toBeHidden();
  const posts = nav(page).getByRole("link", { name: "Posts", exact: true });
  await expect(posts).toBeVisible();
  // The rail names an icon beside it as soon as the pointer is over it.
  await posts.hover();
  expect(await posts.evaluate((el) => getComputedStyle(el, "::after").content)).toContain("Posts");
  await expect(posts).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Account: Mira" })).toBeVisible();
  await page.getByRole("button", { name: "Account: Mira" }).click();
  await expect(accountMenu(page).getByRole("link", { name: "Sign-in and security" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountMenu(page)).toBeHidden();
  expect((await page.locator("aside").boundingBox())!.width).toBeLessThan(100);

  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
  await expect(group(page, "Publish")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
});

test("the mobile menu shows the groups", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await brain(page);
  await page.goto("/posts");
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(group(page, "Publish")).toBeVisible();
  // Escape with focus on the account button closes only its menu.
  await accountButton(page).click();
  await expect(accountMenu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountMenu(page)).toBeHidden();
  await expect(group(page, "Publish")).toBeVisible();
  await accountButton(page).click();
  await accountMenu(page).getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL("/profile");
  await expect(group(page, "Publish")).toBeHidden();
  await expect(accountMenu(page)).toBeHidden();
});

test("the account menu opens on hover and holds the profile pages and sign out", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  await expect(accountButton(page)).toContainText("Mira");
  await expect(accountMenu(page)).toBeHidden();
  await accountButton(page).hover();
  await expect(accountMenu(page)).toBeVisible();
  for (const name of ["Profile", "Sign-in and security", "Passkeys", "Sign out"]) await expect(accountMenu(page).getByRole(name === "Sign out" ? "button" : "link", { name, exact: true })).toBeVisible();
  await expect(accountMenu(page)).toContainText("me@example.com");
  await page.mouse.move(800, 400);
  await expect(accountMenu(page)).toBeHidden();
  // A click pins it open; Escape closes it and returns focus.
  await accountButton(page).click();
  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "true");
  await page.mouse.move(800, 400);
  await expect(accountMenu(page)).toBeVisible();
  await accountButton(page).click();
  await expect(accountMenu(page)).toBeHidden();
  await accountButton(page).click();
  await expect(accountMenu(page)).toBeVisible();
  await accountMenu(page).getByRole("link", { name: "Profile", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(accountMenu(page)).toBeHidden();
  await expect(accountButton(page)).toBeFocused();
});

test("the profile page shows the user, with links to security", async ({ page }) => {
  await brain(page);
  await page.goto("/profile");
  const main = page.getByRole("main");
  // The top bar holds the page's one title; the page does not repeat it.
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(main.getByText("Mira", { exact: true })).toBeVisible();
  await expect(main.getByText("me@example.com")).toBeVisible();
  await expect(main.getByLabel("Name", { exact: true })).toHaveValue("Mira");
  await expect(main.getByRole("link", { name: /Passkeys/ })).toHaveAttribute("href", "/security#passkeys");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Profile");
  await expect(nav(page).getByRole("link", { name: "Profile" })).toHaveCount(0);
});

test("no passkey dialog for a user who has one, or when the list fails", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  await expect(nav(page).getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);

  await page.unrouteAll();
  await brain(page, null);
  await page.goto("/posts");
  await expect(nav(page).getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);
});

test("the passkey dialog sends a user with none to add one", async ({ page }) => {
  await brain(page, []);
  await page.goto("/posts");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("fingerprint, face or screen lock");
  await expect(dialog(page).getByRole("button", { name: "Add a passkey" })).toBeFocused();
  await dialog(page).getByRole("button", { name: "Add a passkey" }).click();
  await expect(page).toHaveURL("/security#passkeys");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeInViewport();
});

test("Not now hides the passkey dialog after a reload", async ({ page }) => {
  await brain(page, []);
  await page.goto("/posts");
  await dialog(page).getByRole("button", { name: "Not now" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("#main")).toBeFocused();
  await page.reload();
  await expect(nav(page).getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);
});

test("Escape closes the passkey dialog and hides it too", async ({ page }) => {
  await brain(page, []);
  await page.goto("/posts");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  // The close event, which saves the snooze, runs a moment after the dialog hides.
  await expect(page.locator("#main")).toBeFocused();
  await page.reload();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);
});

test("no passkey dialog on the security page, or after skipping it on /welcome", async ({ page }) => {
  await brain(page, []);
  await page.goto("/security");
  await expect(page.getByText("You have no passkeys yet.")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);

  await page.goto("/welcome");
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL("/t/acme22/home");
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);
});

test("the profile name is saved and shows in the sidebar", async ({ page }) => {
  await brain(page);
  const sent: unknown[] = [];
  await page.route("**/auth/me", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON();
    sent.push(body);
    if (body.name === "Bad") return route.fulfill({ status: 422, json: { error: "invalid_name" } });
    return route.fulfill({ json: { ...user, name: body.name } });
  });
  await page.goto("/profile");
  const main = page.getByRole("main");
  const account = accountButton(page);
  await expect(account).toContainText("Mira");

  // Empty or too long: checked here, no request.
  await main.getByLabel("Name", { exact: true }).fill("   ");
  await main.getByRole("button", { name: "Save" }).click();
  await expect(main.getByRole("alert")).toHaveText("Use 1 to 80 characters.");
  await expect(main.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await main.getByLabel("Name", { exact: true }).fill("a".repeat(81));
  await main.getByRole("button", { name: "Save" }).click();
  await expect(main.getByRole("alert")).toHaveText("Use 1 to 80 characters.");
  expect(sent).toEqual([]);

  // brain's invalid_name gets the same message.
  await main.getByLabel("Name", { exact: true }).fill("Bad");
  await main.getByRole("button", { name: "Save" }).click();
  await expect(main.getByRole("alert")).toHaveText("Use 1 to 80 characters.");

  await main.getByLabel("Name", { exact: true }).fill("  Mira Stone ");
  await main.getByRole("button", { name: "Save" }).click();
  await expect(main.getByRole("status")).toHaveText("Your name is saved.");
  await expect(main.getByRole("status")).toBeFocused();
  expect(sent).toEqual([{ name: "Bad" }, { name: "Mira Stone" }]);
  await expect(main.getByLabel("Name", { exact: true })).toHaveValue("Mira Stone");
  await expect(main.getByText("Mira Stone", { exact: true })).toBeVisible();
  await expect(account).toContainText("Mira Stone");
});

test("Calendar in the Publish group opens the month grid; Posts stays its own page", async ({ page }) => {
  await brain(page);
  await page.goto("/home");
  await nav(page).getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL("/t/acme22/calendar");
  await expect(nav(page).getByRole("link", { name: "Calendar", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav(page).getByRole("link", { name: "Posts", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Calendar");
  await expect(page.getByRole("table", { name: /^Posts in / })).toBeVisible();
});

test("the theme switch sets data-theme and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await brain(page);
  await page.goto("/posts");
  const html = page.locator("html");
  const theme = page.getByRole("group", { name: "Theme" });
  await expect(theme.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  await expect(html).toHaveAttribute("data-theme", "light");
  // System follows the OS, live.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await theme.getByRole("button", { name: "Dark" }).click();
  await expect(theme.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

  // The icon rail has one button that steps Light, Dark, System.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Theme: Dark. Switch to System" }).click();
  await page.getByRole("button", { name: "Theme: System. Switch to Light" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
});

test("the account shows the role in the current team under the name", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  await expect(accountButton(page)).toContainText("Mira");
  await expect(accountButton(page)).toContainText("Owner");
});

test("the sidebar holds the team switcher with its plan, its menu ends with Upgrade, which opens /billing", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  const logo = page.locator("aside").getByRole("link", { name: "SocialReins" });
  const acme = page.locator("aside button[popovertarget=team-menu]");
  // Under the logo and above the nav: the team's name with the plan in small text under it. The top bar has no team.
  await expect(acme).toContainText("Acme");
  await expect(acme).toContainText("Free plan");
  expect((await acme.boundingBox())!.y).toBeLessThan((await nav(page).boundingBox())!.y);
  expect((await acme.boundingBox())!.y).toBeGreaterThan((await logo.boundingBox())!.y);
  await expect(page.getByRole("banner")).not.toContainText("Acme");
  await expect(page.locator("aside").getByRole("link", { name: "Upgrade" })).toBeHidden();
  await expect(logo.getByText("SocialReins")).toBeInViewport();
  await acme.click();
  const menu = page.locator("#team-menu");
  await expect(menu.locator("> :last-child")).toHaveText("Free plan·Upgrade");
  await menu.getByRole("link", { name: "Upgrade" }).click();
  await expect(page).toHaveURL("/t/acme22/billing");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("heading", { name: "Plans", level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Your team is on the Free plan. Paid plans are coming to the hosted version.");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Plans");

  // The icon rail keeps only the logo mark and the team's avatar (the names stay for screen readers); the menu still opens.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(logo).toBeVisible();
  expect((await logo.boundingBox())!.width).toBeLessThan(64);
  expect((await acme.boundingBox())!.width).toBeLessThan(64);
  await expect(acme).toHaveAccessibleName("Team: Acme");
  await acme.click();
  await expect(menu.getByRole("link", { name: "Manage team" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/t/acme22/billing");
});

test("the set switcher shows only on the pages the set filters, with no visible label", async ({ page }) => {
  await brain(page);
  const sets = [
    { id: "d", name: "Everything", is_default: true },
    { id: "s1", name: "Clients", is_default: false },
  ].map((s) => ({ ...s, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null }));
  await page.route(/\/v1\/social-sets(\?.*)?$/, (route) => route.fulfill({ json: sets }));
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  const picker = crumbs.getByRole("button", { name: "Set: Everything", exact: true });
  for (const path of ["/home", "/posts", "/posts/new", "/calendar", "/lists", "/connections"]) {
    await page.goto(path);
    await expect(picker, path).toBeVisible();
  }
  // The button shows the set's own name and nothing else.
  await expect(picker).toHaveText("Everything");
  for (const path of ["/inbox", "/inbox/all", "/automations", "/sets", "/team", "/api-tokens", "/profile", "/security", "/billing"]) {
    await page.goto(path);
    await expect(crumbs.getByRole("heading", { level: 1 }), path).toBeVisible();
    await expect(crumbs.getByRole("button"), path).toHaveCount(0);
  }
});

test("the top bar fits a phone, and the team switcher is in the menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await brain(page);
  // A long set name is cut short on a phone, so the page title keeps room next to it.
  const set = { id: "d", name: "Every single account we have ever connected", is_default: true, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null };
  await page.route(/\/v1\/social-sets(\?.*)?$/, (route) => route.fulfill({ json: [set] }));
  await page.goto("/calendar");
  const title = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("heading", { name: "Calendar", level: 1 });
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: `Set: ${set.name}` })).toBeVisible();
  expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth), "the title is not cut").toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const path of ["/posts", "/team", "/security"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("heading", { level: 1 })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
  // The team switcher is the first thing in the phone menu.
  await expect(page.locator("aside button[popovertarget=team-menu]")).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator("aside button[popovertarget=team-menu]").click();
  await expect(page.locator("#team-menu").getByRole("link", { name: "Upgrade" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Escape closes the team menu and leaves the phone menu open.
  await page.locator("#team-menu").getByRole("button", { name: "New team" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#team-menu")).toBeHidden();
  await expect(nav(page).getByRole("link", { name: "Posts", exact: true })).toBeVisible();
});

test("a page one level down shows its parent as a crumb, and as a link on the page on a phone", async ({ page }) => {
  await brain(page);
  await page.goto("/posts/new");
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  const main = page.getByRole("main");
  await expect(crumbs.getByRole("heading", { name: "New post", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByRole("link", { name: "Posts", exact: true })).toBeHidden();
  await crumbs.getByRole("link", { name: "Posts", exact: true }).click();
  await expect(page).toHaveURL("/t/acme22/posts");
  await expect(crumbs.getByRole("heading", { name: "Posts", level: 1 })).toBeVisible();
  await expect(crumbs.getByRole("link", { name: "Posts", exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/posts/new");
  await expect(crumbs.getByRole("heading", { name: "New post", level: 1 })).toBeInViewport();
  await expect(crumbs.getByRole("link", { name: "Posts", exact: true })).toBeHidden();
  await expect(main.getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("dark theme stays in the app: after signing out the landing page is light", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await brain(page);
  await page.route("**/auth/logout", (route) => route.fulfill({ json: {} }));
  await page.goto("/posts");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(html).toHaveAttribute("data-app", "");
  await accountButton(page).click();
  await accountMenu(page).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await expect(html).not.toHaveAttribute("data-app");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe("rgb(250, 248, 246)");
  expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe("rgb(18, 18, 18)");
});

test("the account menu links to Plans, also on the icon rail", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Account: Mira" }).click();
  await accountMenu(page).getByRole("link", { name: "Plans" }).click();
  await expect(page).toHaveURL("/t/acme22/billing");
});

test("the open mobile menu fits the screen with the account row visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await brain(page);
  await page.goto("/posts");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(accountButton(page)).toBeInViewport({ ratio: 1 });
  const aside = (await page.locator("aside").boundingBox())!;
  expect(aside.y + aside.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: test.info().outputPath("mobile-menu.png") });
});
