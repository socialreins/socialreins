import { expect, test, type Page } from "@playwright/test";

// A team's own address: /t/<slug>/<page>. The code keeps working and is what every call carries.
type Team = { id: string; name: string; code: string; slug: string | null; role: string };
const teams = (): Team[] => [
  { id: "t1", name: "Acme", code: "acme22", slug: null, role: "owner" },
  { id: "t2", name: "Beta", code: "beta33", slug: "beta-co", role: "member" },
];

// brain as the web app sees it: X-Team names the team by code or slug, and PATCH /v1/team changes the slug.
// Returns the X-Team header of every call and the bodies of the PATCH calls.
async function brain(page: Page, all = teams()) {
  const sent: [string, string | null][] = [];
  const patches: unknown[] = [];
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const named = req.headers()["x-team"] ?? null;
    sent.push([path, named]);
    const team = named === null ? all[0] : all.find((t) => t.code === named || t.slug === named);
    if (!team) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (path === "/auth/me") return route.fulfill({ json: { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: team } });
    if (path === "/v1/teams") return route.fulfill({ json: all });
    if (path === "/v1/team" && req.method() === "PATCH") {
      const { slug } = req.postDataJSON();
      patches.push(req.postDataJSON());
      if (slug === "taken") return route.fulfill({ status: 409, json: { error: "slug_taken" } });
      if (slug === "refused") return route.fulfill({ status: 422, json: { error: "invalid_slug", reason: "reserved" } });
      if (slug === "busy") return route.fulfill({ status: 429, json: { error: "slug_changed_too_often" } });
      team.slug = slug;
      return route.fulfill({ json: team });
    }
    return route.fulfill({ json: [] });
  });
  return { sent, patches };
}
const general = (page: Page) => page.getByRole("region", { name: "General" });

test("an owner sets the team address: the address bar moves and pages keep working with the code in X-Team", async ({ page }) => {
  const { sent, patches } = await brain(page);
  await page.goto("/t/acme22/team");
  const field = page.getByLabel("Team address");
  const save = page.getByRole("button", { name: "Save address" });
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("placeholder", "acme22");
  await expect(general(page)).toContainText(`${new URL(page.url()).host}/t/`);
  await expect(general(page)).toContainText("3 to 30 lowercase letters, digits or dashes. Short is best: it is in every link.");
  await expect(save).toHaveClass(/btn-secondary/);
  await expect(page.getByRole("button", { name: "Use the default address" })).toHaveCount(0);

  // Checked while typing, with brain's rules; nothing is sent while it is wrong.
  await field.fill("ac");
  await expect(general(page)).toContainText("Use 3 to 30 characters.");
  await field.fill("ac_me");
  await expect(general(page)).toContainText("Use only lowercase letters, digits and dashes.");
  await field.fill("ac--me");
  await expect(general(page)).toContainText("Use one dash at a time");
  await field.fill("-acme");
  await expect(general(page)).toContainText("Start and end with a letter or digit.");
  await field.press("Enter");
  expect(patches).toEqual([]);

  await field.fill("Acme");
  await expect(field).toHaveValue("acme");
  await expect(save).toHaveClass(/btn-primary/);
  sent.length = 0;
  await save.click();
  await expect(page.getByText(`The team address is now ${new URL(page.url()).host}/t/acme. Old links with acme22 still work.`)).toBeFocused();
  expect(patches).toEqual([{ slug: "acme" }]);
  // No reload: the address bar moved and the typed name is still in its field.
  await expect(page).toHaveURL("/t/acme/team");
  await expect(save).toHaveClass(/btn-secondary/);
  await expect(page.locator("aside").getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/t/acme/calendar");
  await page.locator("aside").getByRole("link", { name: "Posts" }).click();
  await expect(page).toHaveURL("/t/acme/posts");
  await expect(page.getByRole("heading", { name: "Posts", level: 1 })).toBeVisible();
  await expect.poll(() => sent.some(([path]) => path === "/v1/posts")).toBe(true);
  // Every call still names the team by its permanent code.
  expect(sent.filter(([, named]) => named !== "acme22")).toEqual([]);

  // Old links keep working and settle on the short address, with the path and the query.
  await page.goto("/t/acme22/posts?status=draft");
  await expect(page).toHaveURL("/t/acme/posts?status=draft");
  await expect(page.getByRole("heading", { name: "Posts", level: 1 })).toBeVisible();
  await page.goto("/inbox/i7?item=p1");
  await expect(page).toHaveURL("/t/acme/inbox/i7?item=p1");
  // The slug address itself: only the session check can name the slug, every other call carries the code.
  sent.length = 0;
  await page.goto("/t/acme/posts");
  await expect(page.getByRole("heading", { name: "Posts", level: 1 })).toBeVisible();
  await expect.poll(() => sent.some(([path]) => path === "/v1/posts")).toBe(true);
  expect(sent.filter(([path, named]) => named !== "acme22" && !(path === "/auth/me" && named === "acme"))).toEqual([]);
  await page.locator("aside").getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL("/t/acme/connections");
});

test("a taken, reserved or too often changed address is said plainly, and the default address clears it", async ({ page }) => {
  const all = teams();
  all[0].slug = "acme";
  const { patches } = await brain(page, all);
  await page.goto("/t/acme/team");
  const field = page.getByLabel("Team address");
  await expect(field).toHaveValue("acme");
  for (const [slug, text] of [
    ["taken", "Another team already uses that address. Pick a different one."],
    ["refused", "That address is reserved or not allowed. Pick a different one."],
    ["busy", "The address was changed 5 times today, the most allowed. Try again tomorrow."],
  ]) {
    await field.fill(slug);
    await page.getByRole("button", { name: "Save address" }).click();
    await expect(general(page).getByRole("alert")).toHaveText(text);
    await expect(page).toHaveURL("/t/acme/team");
  }
  await page.getByRole("button", { name: "Use the default address" }).click();
  await expect(page.getByText(`The team is back on its default address, ${new URL(page.url()).host}/t/acme22.`)).toBeFocused();
  expect(patches.at(-1)).toEqual({ slug: null });
  await expect(page).toHaveURL("/t/acme22/team");
  await expect(field).toHaveValue("");
  await expect(page.getByRole("button", { name: "Use the default address" })).toHaveCount(0);
  await expect(page.locator("aside").getByRole("link", { name: "Posts" })).toHaveAttribute("href", "/t/acme22/posts");
});

test("a member reads the team address and cannot change it", async ({ page }) => {
  await brain(page);
  await page.goto("/t/beta33/team");
  await expect(page).toHaveURL("/t/beta-co/team");
  await expect(page.getByText("You are a member of Beta.")).toBeVisible();
  await expect(general(page)).toContainText(`${new URL(page.url()).host}/t/beta-co`);
  await expect(general(page).getByRole("textbox")).toHaveCount(0);
  await expect(general(page).getByRole("button")).toHaveCount(0);
});

test("two tabs on two teams each act in their own, by slug or code", async ({ context }) => {
  const all = teams();
  all[0].slug = "acme";
  const one = await context.newPage();
  const two = await context.newPage();
  const a = await brain(one, all);
  const b = await brain(two, all);
  await one.goto("/t/acme/posts");
  await two.goto("/t/beta33/posts");
  await expect(two).toHaveURL("/t/beta-co/posts");
  await expect(one.locator("aside button[popovertarget=team-menu]")).toContainText("Acme");
  await expect(two.locator("aside button[popovertarget=team-menu]")).toContainText("Beta");
  await one.locator("aside").getByRole("link", { name: "Calendar" }).click();
  await two.locator("aside").getByRole("link", { name: "Calendar" }).click();
  await expect(one).toHaveURL("/t/acme/calendar");
  await expect(two).toHaveURL("/t/beta-co/calendar");
  await expect.poll(() => a.sent.filter(([path]) => path === "/v1/posts").length).toBeGreaterThan(1);
  await expect.poll(() => b.sent.filter(([path]) => path === "/v1/posts").length).toBeGreaterThan(1);
  expect(a.sent.slice(1).filter(([, named]) => named !== "acme22")).toEqual([]);
  expect(b.sent.filter(([, named]) => named !== "beta33")).toEqual([]);
});
