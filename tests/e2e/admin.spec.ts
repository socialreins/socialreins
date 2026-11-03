import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin", locale: "en-US" });

const me = (isAdmin: boolean) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", role: "owner" },
  is_admin: isAdmin,
});
const signups = [
  { id: "w2", email: "new@example.com", source: "landing", created_at: "2026-11-01T10:00:00Z", verified_at: null },
  { id: "w1", email: "old@example.com", source: "landing", created_at: "2026-10-20T10:00:00Z", verified_at: "2026-10-21T08:00:00Z" },
];

async function brain(page: Page, isAdmin = true) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(isAdmin) }));
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/lists$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));
  const asked: string[] = [];
  await page.route(/\/v1\/admin\/waitlist(\?.*)?$/, (route) => {
    const verified = new URL(route.request().url()).searchParams.get("verified");
    asked.push(verified ?? "all");
    const rows = signups.filter((s) => verified === null || (verified === "true") === (s.verified_at !== null));
    return route.fulfill({ json: { total: 1200, verified: 700, signups: rows } });
  });
  return asked;
}

test("only site admins get the Admin console link, and it opens a separate console", async ({ page }) => {
  await brain(page, false);
  await page.goto("/app/posts");
  await expect(page.getByRole("link", { name: "Posts", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin console" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Waitlist", exact: true })).toHaveCount(0);

  await page.unrouteAll();
  await brain(page, true);
  await page.goto("/app/posts");
  await expect(page.getByRole("link", { name: "Waitlist", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Admin console" }).click();
  await expect(page).toHaveURL("/admin/waitlist");
  await expect(page.getByRole("heading", { name: "Waitlist", level: 1 })).toBeVisible();
  await expect(page.locator(".admin-root")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Admin console");
  await expect(page.getByRole("link", { name: "Posts", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to the app" }).click();
  await expect(page).toHaveURL("/app");
});

test("the admin console sends a non-admin to the app, and the old address redirects", async ({ page }) => {
  await brain(page, false);
  await page.goto("/admin/waitlist");
  await expect(page).toHaveURL("/app");
  await page.unrouteAll();
  await brain(page, true);
  await page.goto("/app/admin");
  await expect(page).toHaveURL("/admin/waitlist");
});

test("the admin page shows waitlist totals and signups, filtered in ?verified=", async ({ page }) => {
  const asked = await brain(page);
  await page.goto("/admin/waitlist");
  await expect(page.getByRole("heading", { name: "Signups" })).toBeVisible();
  const total = page.locator("dl > div");
  await expect(total.nth(0)).toHaveText("Total1,200");
  await expect(total.nth(1)).toHaveText("Verified700");
  await expect(total.nth(2)).toHaveText("Unverified500");
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("new@example.com");
  await expect(rows.nth(0)).toContainText("landing");
  await expect(rows.nth(0)).toContainText("Nov 1, 2026");
  await expect(rows.nth(0)).toContainText("Not verified");
  await expect(rows.nth(1)).toContainText("Verified Oct 21, 2026");

  const filter = page.getByRole("navigation", { name: "Filter" });
  await filter.getByRole("link", { name: "Verified", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/waitlist\?verified=true$/);
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("old@example.com");
  await filter.getByRole("link", { name: "Not verified" }).click();
  await expect(page).toHaveURL(/\/admin\/waitlist\?verified=false$/);
  await expect(rows.nth(0)).toContainText("new@example.com");
  await expect(filter.getByRole("link", { name: "Not verified" })).toHaveAttribute("aria-current", "true");
  expect(asked).toEqual(["all", "true", "false"]);
});

test("the admin page tells a non-admin they have no access", async ({ page }) => {
  await brain(page, true);
  // brain decides; an admin flag that is stale still gets brain's refusal shown.
  await page.route(/\/v1\/admin\/waitlist(\?.*)?$/, (route) => route.fulfill({ status: 403, json: { error: "forbidden" } }));
  await page.goto("/admin/waitlist");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("You don't have access to the admin panel.");
  await expect(page.getByRole("table")).toHaveCount(0);
});
