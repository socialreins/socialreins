import { expect, test, type Page } from "@playwright/test";

const user = { id: "u1", email: "me@example.com", name: "Mira", username: null, current_team: { id: "t1", name: "Acme", role: "owner" } };
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
const dialog = (page: Page) => page.getByRole("dialog", { name: "Add a passkey" });

test("sidebar groups open and close and remember it", async ({ page }) => {
  await brain(page);
  await page.goto("/app/posts");
  for (const name of ["Publish", "Engage", "Workspace", "Profile settings"]) await expect(group(page, name)).toBeVisible();
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
  await page.goto("/app/posts");
  await group(page, "Workspace").click();
  await expect(group(page, "Workspace")).toHaveAttribute("aria-expanded", "false");
  await page.goto("/app/team");
  await expect(group(page, "Workspace")).toHaveAttribute("aria-expanded", "true");
  const team = nav(page).getByRole("link", { name: "Team", exact: true });
  await expect(team).toHaveAttribute("aria-current", "page");
  await expect(group(page, "Workspace")).toHaveAttribute("aria-disabled", "true");
  await group(page, "Workspace").click({ force: true });
  await expect(team).toBeVisible();
});

test("the sidebar collapses to an icon rail and back, across reloads", async ({ page }) => {
  await brain(page);
  await page.goto("/app/posts");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const expand = page.getByRole("button", { name: "Expand sidebar" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(group(page, "Publish")).toBeHidden();
  const posts = nav(page).getByRole("link", { name: "Posts", exact: true });
  await expect(posts).toBeVisible();
  await expect(posts).toHaveAttribute("title", "Posts");
  await expect(posts).toHaveAttribute("aria-current", "page");
  await expect(nav(page).getByRole("link", { name: "Sign-in and security", exact: true })).toBeVisible();
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
  await page.goto("/app/posts");
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(group(page, "Profile settings")).toBeVisible();
  await nav(page).getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL("/app/profile");
  await expect(group(page, "Profile settings")).toBeHidden();
});

test("the profile page shows the user, with links to security", async ({ page }) => {
  await brain(page);
  await page.goto("/app/profile");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
  await expect(main.getByText("Mira", { exact: true })).toBeVisible();
  await expect(main.getByText("me@example.com")).toBeVisible();
  await expect(main.getByLabel("Name", { exact: true })).toHaveValue("Mira");
  await expect(main.getByRole("link", { name: /Passkeys/ })).toHaveAttribute("href", "/app/security#passkeys");
  await expect(nav(page).getByRole("link", { name: "Profile", exact: true })).toHaveAttribute("aria-current", "page");
});

test("no passkey dialog for a user who has one, or when the list fails", async ({ page }) => {
  await brain(page);
  await page.goto("/app/posts");
  await expect(nav(page).getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);

  await page.unrouteAll();
  await brain(page, null);
  await page.goto("/app/posts");
  await expect(nav(page).getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);
});

test("the passkey dialog sends a user with none to add one", async ({ page }) => {
  await brain(page, []);
  await page.goto("/app/posts");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("fingerprint, face or screen lock");
  await expect(dialog(page).getByRole("button", { name: "Add a passkey" })).toBeFocused();
  await dialog(page).getByRole("button", { name: "Add a passkey" }).click();
  await expect(page).toHaveURL("/app/security#passkeys");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeInViewport();
});

test("Not now hides the passkey dialog after a reload", async ({ page }) => {
  await brain(page, []);
  await page.goto("/app/posts");
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
  await page.goto("/app/posts");
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
  await page.goto("/app/security");
  await expect(page.getByText("You have no passkeys yet.")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toHaveCount(0);

  await page.goto("/welcome");
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL("/app");
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
  await page.goto("/app/profile");
  const main = page.getByRole("main");
  const account = page.locator("p", { hasText: "Signed in as" });
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
