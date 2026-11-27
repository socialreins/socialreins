import { expect, test } from "@playwright/test";

const code = "k7q2mfx4ab";
const publicPost = {
  team: "Acme",
  body: "Hello from Acme",
  media: [],
  thread: [],
  details: "",
  newsletter: false,
  published_at: "2026-11-03T08:00:00Z",
  links: [],
};

test("a visitor reports a public page with a reason, a note and an email", async ({ page }) => {
  await page.route(`**/v1/public/pages/${code}`, (route) => route.fulfill({ json: publicPost }));
  await page.route("**/auth/providers", (route) => route.fulfill({ json: { google: false, turnstile_site_key: null } }));
  const sent: unknown[] = [];
  await page.route(`**/v1/public/pages/${code}/report`, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, json: {} });
  });
  await page.goto(`/p/${code}`);
  await expect(page.getByText("Hello from Acme")).toBeVisible();
  await page.getByText("Report this page").click();
  await page.getByLabel("What is wrong with it?").selectOption("spam");
  await page.getByLabel("More detail (optional)").fill("Sells pills");
  await page.getByLabel("Email for an answer (optional)").fill("me@example.com");
  await page.getByRole("button", { name: "Send the report" }).click();
  await expect(page.getByText("Thank you. We read every report.")).toBeVisible();
  expect(sent).toEqual([{ reason: "spam", message: "Sells pills", email: "me@example.com" }]);
});

test("a report that brain refuses says why", async ({ page }) => {
  await page.route(`**/v1/public/pages/${code}`, (route) => route.fulfill({ json: publicPost }));
  await page.route("**/auth/providers", (route) => route.fulfill({ json: { google: false, turnstile_site_key: null } }));
  await page.route(`**/v1/public/pages/${code}/report`, (route) => route.fulfill({ status: 429, json: { error: "rate_limited" } }));
  await page.goto(`/p/${code}`);
  await page.getByText("Report this page").click();
  await page.getByRole("button", { name: "Send the report" }).click();
  await expect(page.getByText("Too many reports from this connection. Try again later.")).toBeVisible();
});

test("an admin sees the reports and takes a page down", async ({ page }) => {
  await page.route("**/auth/me", (route) =>
    route.fulfill({ json: { id: "u-me", email: "me@example.com", name: "Me", username: null, is_admin: true, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } } }),
  );
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  const report = { id: "r1", code, team_id: "t9", team: "Shady Co", reason: "phishing", message: "Asks for a password", contact: null, created_at: "2026-11-26T08:00:00Z", reports: 2, taken_down: false };
  const calls: unknown[] = [];
  await page.route("**/v1/admin/page-reports", (route) => route.fulfill({ json: { reports: [report] } }));
  await page.route(`**/v1/admin/pages/${code}/takedown`, (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 204 });
  });
  await page.goto("/admin/reports");
  await expect(page.getByText("Shady Co")).toBeVisible();
  await expect(page.getByText("Asks for a password")).toBeVisible();
  await page.getByRole("button", { name: `Take down the page ${code}` }).click();
  await expect(page.getByText(`The page ${code} is down.`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Bring back the page ${code}` })).toBeVisible();
  expect(calls).toEqual([{ taken_down: true }]);
});
