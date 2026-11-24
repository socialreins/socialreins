import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role },
});
const limits = { accounts: 5, members: null, automation: true, contacts: null };
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
  await expect(page.getByText("Billing is off: nothing is capped.")).toBeVisible();
  // AI steps are not metered either, so the AI key section says nothing about credits.
  await expect(page.getByText("Billing is off, so nothing is metered.")).toBeVisible();
  await expect(page.getByText(/use credits/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Choose|Manage billing/ })).toHaveCount(0);
  await expect(page.getByText("No plan")).toHaveCount(0);
});

const noPlan = { enabled: true, plan: null, limits: { accounts: 0, members: 0, automation: false, contacts: 0 }, usage: { accounts: 0, members: 1 } };
const stripe = "https://checkout.stripe.com/c/pay_123";
const portal = "https://billing.stripe.com/p/session/abc";

// Brain's checkout and portal answers: `status` and `json` for the next call, every body kept.
async function stripeRoutes(page: Page, answer: { status: number; json: object } = { status: 200, json: { url: stripe } }) {
  const state = { checkout: [] as unknown[], credits: [] as unknown[], portal: 0, answer };
  await page.route(/\/v1\/team\/billing\/checkout$/, (route) => {
    state.checkout.push(route.request().postDataJSON());
    return route.fulfill(state.answer);
  });
  await page.route(/\/v1\/team\/billing\/credits$/, (route) => {
    state.credits.push(route.request().postDataJSON());
    return route.fulfill(state.answer);
  });
  await page.route(/\/v1\/team\/billing\/portal$/, (route) => {
    state.portal++;
    return route.fulfill(state.answer);
  });
  for (const url of [stripe, portal]) await page.route(url, (route) => route.fulfill({ contentType: "text/html", body: "<title>Stripe</title>" }));
  return state;
}

test("a team with no plan sees two plan cards with no price, and owners choose one", async ({ page }) => {
  await brain(page, "owner", noPlan);
  const state = await stripeRoutes(page);
  await page.goto("/billing");
  await expect(page.getByText("No plan", { exact: true })).toBeVisible();
  const cards = page.getByRole("region", { name: "Choose a plan" });
  await expect(cards.getByText("10 connected accounts")).toBeVisible();
  await expect(cards.getByText("25 connected accounts")).toBeVisible();
  await expect(cards.getByText("2,500 contacts")).toBeVisible();
  await expect(page.getByText("A team's first plan starts with a 7-day free trial.", { exact: true })).toBeVisible();
  // Yearly, two months free, is the default; monthly is one click away.
  await expect(page.getByRole("radio", { name: "Yearly, 2 months free" })).toBeChecked();
  await expect(cards).toContainText("$190 a year");
  await expect(cards).toContainText("$490 a year");
  await expect(page.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
  await page.getByRole("button", { name: "Choose Scheduler and Automation" }).click();
  await expect(page).toHaveURL(stripe);
  expect(state.checkout).toEqual([{ plan: "automation", interval: "year" }]);
  await page.goBack();
  await page.getByRole("radio", { name: "Monthly" }).check();
  await expect(cards).toContainText("$19 a month");
  await page.getByRole("button", { name: "Choose Scheduler", exact: true }).click();
  await expect(page).toHaveURL(stripe);
  expect(state.checkout).toEqual([
    { plan: "automation", interval: "year" },
    { plan: "scheduler", interval: "month" },
  ]);
});

test("checkout says to sign in again, or to use Manage billing, in plain words", async ({ page }) => {
  await brain(page, "owner", noPlan);
  const state = await stripeRoutes(page, { status: 403, json: { error: "reauth_required" } });
  await page.goto("/billing");
  await page.getByRole("button", { name: "Choose Scheduler", exact: true }).click();
  await expect(page.locator("p.waitlist-error")).toContainText("needs a fresh sign-in");
  state.answer = { status: 409, json: { error: "already_subscribed" } };
  await page.getByRole("button", { name: "Choose Scheduler", exact: true }).click();
  await expect(page.locator("p.waitlist-error")).toContainText("Use Manage billing");
  state.answer = { status: 502, json: { error: "stripe_failed" } };
  await page.getByRole("button", { name: "Choose Scheduler", exact: true }).click();
  await expect(page.locator("p.waitlist-error")).toHaveText("Payment page could not be opened. Try again.");
});

test("an admin or member sees no plan cards, only who can change the plan", async ({ page }) => {
  for (const role of ["admin", "member"] as const) {
    await brain(page, role, noPlan);
    await page.goto("/billing");
    await expect(page.getByText("Only the team owner can change the plan.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Choose/ })).toHaveCount(0);
    await page.unrouteAll();
  }
});

test("Manage billing opens the portal for an owner with a live plan, and a failure says so", async ({ page }) => {
  await brain(page, "owner", { enabled: true, plan: { ...trial, status: "active" }, limits, usage: { accounts: 1, members: 1 } });
  const state = await stripeRoutes(page, { status: 409, json: { error: "no_customer" } });
  await page.goto("/billing");
  await expect(page.getByRole("button", { name: /Choose/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Manage billing" }).click();
  await expect(page.locator("p.waitlist-error")).toContainText("no billing account yet");
  state.answer = { status: 200, json: { url: portal } };
  await page.getByRole("button", { name: "Manage billing" }).click();
  await expect(page).toHaveURL(portal);
  expect(state.portal).toBe(2);
});

test("coming back from checkout shows a banner and looks again until the plan appears", async ({ page }) => {
  await brain(page, "owner", noPlan);
  let calls = 0;
  await page.route(/\/v1\/team\/billing$/, (route) => {
    calls++;
    return route.fulfill({ json: calls < 3 ? noPlan : { enabled: true, plan: trial, limits, usage: { accounts: 0, members: 1 } } });
  });
  await page.goto("/billing?checkout=success");
  await expect(page.getByText("Thanks. Your plan will show here in a moment.")).toBeVisible();
  await expect(page.getByText("Growth", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(calls).toBe(3);
  await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();
  await expect(page).not.toHaveURL(/checkout=/);
});

test("while a payment is being confirmed there are no plan cards, and giving up says so", async ({ page }) => {
  test.setTimeout(30_000);
  await brain(page, "owner", noPlan);
  await page.goto("/billing?checkout=success");
  await expect(page.getByText("Confirming your payment...")).toBeVisible();
  await expect(page.getByRole("button", { name: /Choose/ })).toHaveCount(0);
  await expect(page.getByText("Still confirming. Refresh in a minute.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Choose/ })).toHaveCount(0);
});

test("a url that is not a Stripe page is not followed", async ({ page }) => {
  await brain(page, "owner", noPlan);
  const bad = ["https://evil.example/pay", "http://checkout.stripe.com/c/1", "https://checkout.stripe.com.evil.example/c/1", "javascript:alert(1)"];
  const state = await stripeRoutes(page);
  for (const url of [...bad, undefined]) {
    state.answer = { status: 200, json: url ? { url } : {} };
    await page.goto("/billing");
    await page.getByRole("button", { name: "Choose Scheduler", exact: true }).click();
    await expect(page.locator("p.waitlist-error")).toHaveText("Payment page could not be opened. Try again.");
    await expect(page).toHaveURL(/\/billing$/);
  }
});

test("a double click on Choose starts one checkout", async ({ page }) => {
  await brain(page, "owner", noPlan);
  const state = await stripeRoutes(page);
  await page.unroute(stripe);
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route(stripe, async (route) => {
    await held;
    await route.fulfill({ contentType: "text/html", body: "<title>Stripe</title>" });
  });
  await page.goto("/billing");
  const choose = page.getByRole("button", { name: "Choose Scheduler", exact: true });
  await choose.dblclick();
  await expect.poll(() => state.checkout.length).toBe(1);
  release();
  await expect(page).toHaveURL(stripe);
  expect(state.checkout).toEqual([{ plan: "scheduler", interval: "year" }]);
});

test("coming back from a canceled checkout says so and offers the plans again", async ({ page }) => {
  await brain(page, "owner", noPlan);
  await page.goto("/billing?checkout=canceled");
  await expect(page.getByText("Checkout was canceled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose Scheduler", exact: true })).toBeVisible();
});

test("a trialing plan shows its end date, usage against limits and credits, with no price", async ({ page }) => {
  await brain(page, "member", { enabled: true, plan: trial, limits: { ...limits, inboxes: 10, ai_monthly: 200 }, usage: { accounts: 3, members: 2, inboxes: 4, ai_replies: 12 } });
  await page.goto("/billing");
  await expect(page.getByText("Growth", { exact: true })).toBeVisible();
  await expect(page.getByText("Trial ends")).toBeVisible();
  await expect(page.getByText("Accounts").locator("xpath=following-sibling::dd[1]")).toHaveText("3 of 5");
  await expect(page.getByText("Team members").locator("xpath=following-sibling::dd[1]")).toHaveText("2, unlimited");
  await expect(page.getByText("Inboxes", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("4 of 10");
  await expect(page.getByText("AI replies this month").locator("xpath=following-sibling::dd[1]")).toHaveText("12 of 200");
  await expect(page.getByText("X posts").locator("xpath=following-sibling::dd[1]")).toHaveText("40");
  await expect(page.getByText("AI", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("120");
  await expect(page.getByText("Only the team owner can change the plan.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Choose|Manage billing/ })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/[$€£]\s?\d/);
  // A member can read the page but gets no key form.
  await expect(page.getByRole("region", { name: "Bring your own AI key" })).toHaveCount(0);
  await expect(page.getByText("Only team owners and admins can set")).toBeVisible();
});

test("a canceled or past due plan does not say it renews", async ({ page }) => {
  const plan = { ...trial, trial_ends_at: null, current_period_end: "2026-12-20T00:00:00Z" };
  await brain(page, "owner", { enabled: true, plan: { ...plan, status: "canceled" }, limits, usage: { accounts: 1, members: 1 } });
  await page.goto("/billing");
  await expect(page.getByText(/^Ended /)).toBeVisible();
  await expect(page.getByText("Renews")).toHaveCount(0);
  await page.unroute(/\/v1\/team\/billing$/);
  await page.route(/\/v1\/team\/billing$/, (route) => route.fulfill({ json: { enabled: true, plan: { ...plan, status: "past_due" }, limits, usage: { accounts: 1, members: 1 } } }));
  await page.reload();
  await expect(page.getByText("Payment failed, update your card in Manage billing.")).toBeVisible();
  await expect(page.getByText("Renews")).toHaveCount(0);
});

test("removing a key that is already gone clears it", async ({ page }) => {
  await brain(page, "owner", { enabled: true, plan: trial, limits, usage: { accounts: 1, members: 1 } }, { provider: "openai", last4: "1234" });
  await page.unroute(/\/v1\/team\/ai-key$/);
  await page.route(/\/v1\/team\/ai-key$/, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 404, json: { error: "not_found" } })
      : route.fulfill({ json: { provider: "openai", last4: "1234", updated_at: "2026-11-01T10:00:00Z" } }),
  );
  await page.goto("/billing");
  await keySection(page).getByRole("button", { name: "Remove key" }).click();
  await expect(keySection(page).getByText("No key set.")).toBeVisible();
  await expect(keySection(page).getByRole("alert")).toHaveCount(0);
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

test("an owner buys an X credit pack on Stripe and comes back to a thank you", async ({ page }) => {
  await brain(page, "owner", { ...noPlan, plan: trial, limits });
  const state = await stripeRoutes(page);
  await page.goto("/billing");
  await expect(page.getByText("Credits never expire.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Buy 500 X posts, $20" }).click();
  await expect(page).toHaveURL(stripe);
  expect(state.credits).toEqual([{ pack: "x500" }]);
  await page.goto("/billing?credits=success");
  await expect(page.getByRole("status").filter({ hasText: "Your credits will show here" })).toBeVisible();
  await expect(page).toHaveURL(/\/billing$/);
});

test("only the owner sees the credit packs", async ({ page }) => {
  await brain(page, "admin", { ...noPlan, plan: trial, limits });
  await page.goto("/billing");
  await expect(page.getByText("X posts", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Buy/ })).toHaveCount(0);
});

test("an unknown return value shows no banner and the page still works", async ({ page }) => {
  await brain(page, "owner", noPlan);
  await page.goto("/billing?checkout=__proto__");
  await expect(page.getByText("No plan", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a comped plan says it is free and offers nothing to manage or buy as a plan", async ({ page }) => {
  const comped = { ...trial, status: "active", trial_ends_at: null, comped: true };
  await brain(page, "owner", { ...noPlan, plan: comped, limits });
  await page.goto("/billing");
  await expect(page.getByText("Free plan, given by SocialReins. Nothing to pay.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Choose/ })).toHaveCount(0);
});
