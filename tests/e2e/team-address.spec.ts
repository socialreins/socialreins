import { expect, test, type Page } from "@playwright/test";

// Team addresses: /t/<code>/<page>. Old addresses (/posts) lead to the current team's.
const acme = { id: "t1", name: "Acme", code: "acme22", role: "owner" };
const beta = { id: "t2", name: "Beta", code: "beta33", role: "member" };
const me = (team: typeof acme) => ({ id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: team });

// brain as the web app sees it: the user is in Acme (current) and Beta; any other code is not found.
// Returns the X-Team header of every call, by path.
async function brain(page: Page) {
  const sent: [string, string | null][] = [];
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const code = req.headers()["x-team"] ?? null;
    sent.push([path, code]);
    const team = code === null ? acme : [acme, beta].find((t) => t.code === code);
    if (!team) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (path === "/auth/me") return route.fulfill({ json: me(team) });
    if (path === "/v1/teams") return route.fulfill({ json: [acme, beta] });
    if (path === "/v1/current-team") return route.fulfill({ json: beta });
    return route.fulfill({ json: [] });
  });
  return sent;
}
// The team switcher, at the top of the sidebar.
const switcher = (page: Page) => page.locator("aside button[popovertarget=team-menu]");

test("an old address leads to the current team's, keeping the path and the query", async ({ page }) => {
  await brain(page);
  await page.goto("/posts?status=draft");
  await expect(page).toHaveURL("/t/acme22/posts?status=draft");
  await expect(page.getByRole("heading", { name: "Posts", level: 1 })).toBeVisible();
  await page.goto("/inbox/i7?item=p1");
  await expect(page).toHaveURL("/t/acme22/inbox/i7?item=p1");
  // The older /app addresses, which brain's emails and OAuth returns still use.
  // The Accounts page reads the result from the query, shows it, then clears the query.
  await page.goto("/app/connections?connect_error=cancelled&provider=threads");
  await expect(page.getByRole("alert").filter({ hasText: "Threads connection was cancelled." })).toBeVisible();
  await expect(page).toHaveURL("/t/acme22/connections");
  await page.goto("/app");
  await expect(page).toHaveURL("/t/acme22/home");
});

test("a link to another team of mine opens that team, and every call names it", async ({ page }) => {
  const sent = await brain(page);
  await page.goto("/t/beta33/posts");
  await expect(switcher(page)).toContainText("Beta");
  await expect(page).toHaveURL("/t/beta33/posts");
  await expect(page.locator("aside").getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/t/beta33/calendar");
  await expect.poll(() => sent.some(([path]) => path === "/v1/posts")).toBe(true);
  expect(sent.filter(([, code]) => code !== "beta33")).toEqual([]);
  // The code is read in any case.
  await page.goto("/t/BETA33/home");
  await expect(switcher(page)).toContainText("Beta");
});

test("a team I am not in and a code no team has show the same page not found", async ({ page }) => {
  await brain(page);
  for (const code of ["zzzzzz", "nope"]) {
    await page.goto(`/t/${code}/posts`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Posts" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to your team" })).toHaveAttribute("href", "/t/_/home");
  }
  await page.getByRole("link", { name: "Go to your team" }).click();
  await expect(page).toHaveURL("/t/acme22/home");
  await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
});

test("the team switcher stays on the same page under the other team's code", async ({ page }) => {
  const sent = await brain(page);
  await page.goto("/t/acme22/posts/new");
  await switcher(page).click();
  await page.locator("#team-menu").getByRole("button", { name: /Beta/ }).click();
  await expect(page.getByText("Switched to Beta.")).toBeFocused();
  // The section is kept; what follows it (a post id) belongs to the team left behind.
  await expect(page).toHaveURL("/t/beta33/posts");
  await expect(page.getByRole("heading", { name: "Posts", level: 1 })).toBeVisible();
  sent.length = 0;
  await page.keyboard.press("Escape");
  await page.locator("aside").getByRole("link", { name: "Calendar" }).click();
  await expect(page).toHaveURL("/t/beta33/calendar");
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(sent.filter(([, code]) => code !== "beta33")).toEqual([]);
  // Back goes to the team left behind, and loads it again.
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL("/t/acme22/posts/new");
  await expect(switcher(page)).toContainText("Acme");
});

test("profile and security stay outside /t/ and keep the tab's team", async ({ page }) => {
  const sent = await brain(page);
  await page.goto("/t/beta33/home");
  await expect(switcher(page)).toContainText("Beta");
  await page.getByRole("button", { name: /Me/ }).first().click();
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL("/profile");
  await expect(switcher(page)).toContainText("Beta");
  await expect(page.locator("aside").getByRole("link", { name: "Posts" })).toHaveAttribute("href", "/t/beta33/posts");
  expect(sent.filter(([, code]) => code !== "beta33")).toEqual([]);
});

test("sign-in with a next lands on the team's address", async ({ page }) => {
  await brain(page);
  await page.route("**/auth/providers", (route) => route.fulfill({ json: { google: true, turnstile_site_key: null } }));
  await page.goto("/login?next=/t/beta33/posts");
  // Google and the passkey both return to `next`; brain redirects the browser there after Google.
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", /next=%2Ft%2Fbeta33%2Fposts&mode=login$/);
  await page.goto("/t/beta33/posts");
  await expect(page.getByRole("heading", { name: "Posts", level: 1 })).toBeVisible();
});
