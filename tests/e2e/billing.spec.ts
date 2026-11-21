import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role },
});
const limits = { accounts: 5, members: null, automation: 3, contacts: null };
const trial = {
  id: "p1",
  name: "Growth",
  status: "trialing",
  trial_ends_at: "2026-12-05T00:00:00Z",
  current_period_end: null,
  cancel_at_period_end: false,
};

// A small in-memory brain for billing, credits and the team AI key, so reloads see each change.
async function brain(page: Page, role: Role, billing: object, key: { provider: string; last4: string } | null = null) {
  const state = { key, bodies: [] as unknown[], reauth: false };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/team\/billing$/, (route) => route.fulfill({ json: billing }));
  await page.route(/\/v1\/team\/credits$/, (route) => route.fulfill({ json: { x: 40, ai: 120 } }));
  await page.route(/\/v1\/team\/ai-key$/, (route) => {
    const req = route.request();
    if (req.method() === "DELETE") {
      state.key = null;
      return route.fulfill({ status: 204 });
    }
    if (req.method() === "GET")
      return state.key ? route.fulfill({ json: { ...state.key, updated_at: "2026-11-01T10:00:00Z" } }) : route.fulfill({ status: 404, json: { error: "not_found" } });
    const body = req.postDataJSON() as { provider: string; key: string };
    state.bodies.push(body);
    if (state.reauth) return route.fulfill({ status: 403, json: { error: "reauth_required" } });
    if (!body.key.startsWith("sk-")) return route.fulfill({ status: 422, json: { error: "invalid_key" } });
    state.key = { provider: body.provider, last4: body.key.slice(-4) };
    return route.fulfill({ json: { ...state.key, updated_at: "2026-11-21T10:00:00Z" } });
  });
  return state;
}

test("a self-hosted install says nothing is capped and offers no plan or upgrade", async ({ page }) => {
  await brain(page, "owner", { enabled: false, plan: null, limits: {}, usage: { accounts: 1, members: 1 } });
  await page.goto("/billing");
  await expect(page.getByText("Self-hosted: nothing is capped.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Checkout opens soon" })).toHaveCount(0);
  await expect(page.getByText("No plan")).toHaveCount(0);
});

test("a team with no plan says so and the checkout button is disabled", async ({ page }) => {
  await brain(page, "owner", { enabled: true, plan: null, limits: { accounts: 0, members: 0, automation: 0, contacts: 0 }, usage: { accounts: 0, members: 1 } });
  await page.goto("/billing");
  await expect(page.getByText("No plan", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Checkout opens soon" })).toBeDisabled();
});

test("a trialing plan shows its end date, usage against limits and credits, with no price", async ({ page }) => {
  await brain(page, "member", { enabled: true, plan: trial, limits, usage: { accounts: 3, members: 2 } });
  await page.goto("/billing");
  await expect(page.getByText("Growth", { exact: true })).toBeVisible();
  await expect(page.getByText("Trial ends")).toBeVisible();
  await expect(page.getByText("Accounts").locator("xpath=following-sibling::dd[1]")).toHaveText("3 of 5");
  await expect(page.getByText("Team members").locator("xpath=following-sibling::dd[1]")).toHaveText("2, unlimited");
  await expect(page.getByText("X posts").locator("xpath=following-sibling::dd[1]")).toHaveText("40");
  await expect(page.getByText("AI", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("120");
  await expect(page.getByRole("button", { name: "Checkout opens soon" })).toBeDisabled();
  await expect(page.getByRole("main")).not.toContainText(/[$€£]\s?\d/);
  // A member can read the page but gets no key form.
  await expect(page.getByRole("region", { name: "Bring your own AI key" })).toHaveCount(0);
  await expect(page.getByText("Only team owners and admins can set")).toBeVisible();
});

test("a plan that ends at the period end says so", async ({ page }) => {
  const ending = { ...trial, status: "active", trial_ends_at: null, current_period_end: "2026-12-20T00:00:00Z", cancel_at_period_end: true };
  await brain(page, "owner", { enabled: true, plan: ending, limits, usage: { accounts: 1, members: 1 } });
  await page.goto("/billing");
  await expect(page.getByText("at the end of the paid period")).toBeVisible();
});

const keySection = (page: Page) => page.getByRole("region", { name: "Bring your own AI key" });

test("the AI key is saved, shown as its last 4 characters only, and removed", async ({ page }) => {
  const state = await brain(page, "admin", { enabled: true, plan: trial, limits, usage: { accounts: 1, members: 1 } });
  await page.goto("/billing");
  const s = keySection(page);
  await expect(s.getByText("No key set.")).toBeVisible();
  await expect(s.getByText("AI steps in automations are not metered")).toBeVisible();
  await expect(s.getByLabel("API key")).toHaveAttribute("type", "password");
  await s.getByLabel("Provider").selectOption("openai");
  await s.getByLabel("API key").fill("sk-fake-1234");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByText("Using your OpenAI key ending in 1234.")).toBeVisible();
  expect(state.bodies).toEqual([{ provider: "openai", key: "sk-fake-1234" }]);
  // The key is never echoed back: the field is empty and the page holds no copy of it.
  await expect(s.getByLabel("API key")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("sk-fake");
  await page.reload();
  await expect(s.getByText("Using your OpenAI key ending in 1234.")).toBeVisible();
  await s.getByRole("button", { name: "Remove key" }).click();
  await expect(s.getByText("No key set.")).toBeVisible();
  await expect(s.getByRole("button", { name: "Remove key" })).toHaveCount(0);
});

test("a wrong key shape and an old sign-in each get a plain message", async ({ page }) => {
  const state = await brain(page, "owner", { enabled: true, plan: trial, limits, usage: { accounts: 1, members: 1 } });
  await page.goto("/billing");
  const s = keySection(page);
  await s.getByLabel("API key").fill("nope");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByRole("alert")).toContainText("doesn't look right for the provider");
  await expect(s.getByText("No key set.")).toBeVisible();

  state.reauth = true;
  await s.getByLabel("API key").fill("sk-ant-abcd1234");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByRole("alert")).toContainText("needs a fresh sign-in");
});

test("a plan limit answer shows its message with an Upgrade link to /billing", async ({ page }) => {
  await brain(page, "owner", { enabled: true, plan: trial, limits, usage: { accounts: 1, members: 1 } });
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/team/invitations", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 402, json: { error: "plan_limit", limit: "members" } })
      : route.fulfill({ json: [] }),
  );
  await page.goto("/team");
  await page.getByLabel("Email").fill("new@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "team member limit is reached" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/t/acme22/billing");
});

test("a connect callback that hit the account limit shows the message with Upgrade", async ({ page }) => {
  await brain(page, "owner", { enabled: true, plan: trial, limits, usage: { accounts: 5, members: 1 } });
  await page.route(/\/v1\/connections$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/connections\/providers$/, (route) => route.fulfill({ json: [] }));
  await page.goto("/connections?connect_error=plan_limit&provider=threads");
  const alert = page.getByRole("alert").filter({ hasText: "account limit is reached" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/t/acme22/billing");
});
