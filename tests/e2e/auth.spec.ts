import { expect, test } from "@playwright/test";

const user = { id: "1", email: "someone@example.com", name: "someone", username: null, current_team: { id: "t1", name: "Acme", role: "owner" } };

test("login sends a link and shows the check-your-email state", async ({ page }) => {
  let body: unknown;
  await page.route("**/auth/link", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { status: "sent" } });
  });
  await page.goto("/login/email");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Login with a link" }).click();
  const done = page.getByRole("heading", { name: "Check your email" });
  await expect(done).toBeFocused();
  expect(body).toEqual({ email: "someone@example.com", login_only: true });
  await expect(page.getByText(/waitlist/)).toHaveCount(0);
  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Email")).toBeFocused();
});

test("sign up asks for a name and sends it with the email", async ({ page }) => {
  let body: unknown;
  await page.route("**/auth/link", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { status: "sent" } });
  });
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await page.getByRole("link", { name: "Sign up with Email" }).click();
  await expect(page).toHaveURL("/signup/email");
  await page.getByLabel("Name").fill("  Ann Lee ");
  await page.getByLabel("Email").fill("ann@example.com");
  await page.getByRole("button", { name: "Sign up with a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeFocused();
  expect(body).toEqual({ email: "ann@example.com", name: "Ann Lee" });
  // The same words for everyone, so they never say whether the address may sign up.
  await expect(page.getByText(/^If ann@example.com can sign in/)).toHaveText(
    "If ann@example.com can sign in, a link is on its way. It works once and expires in 15 minutes. If sign-ups are closed for your address, the email says you're on the waitlist instead.",
  );
});

test("login explains rate limits and bad links", async ({ page }) => {
  await page.route("**/auth/link", (route) => route.fulfill({ status: 429, json: { error: "rate_limited" } }));
  await page.goto("/login?error=invalid_link");
  await expect(page.getByText(/expired or was already used/)).toHaveAttribute("role", "alert");
  await page.getByRole("link", { name: "Login with Email" }).click();
  await expect(page).toHaveURL("/login/email");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText(/Too many attempts/);
});

test("login shows a generic message for an unknown or prototype-named error", async ({ page }) => {
  for (const error of ["__proto__", "constructor", "something_new"]) {
    await page.goto(`/login?error=${error}`);
    await expect(page.getByText("That sign-in didn't work. Try again, or ask for an email link below.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Login with Email" })).toBeVisible();
  }
});

test("login form is in the server-rendered HTML", async ({ request }) => {
  const html = await (await request.get("/login")).text();
  expect(html).toContain("Login with Email");
});

test("app shows the signed-in user and signs out", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/auth/logout", (route) => route.fulfill({ status: 204 }));
  await page.goto("/home");
  await page.locator("aside button[data-account]:visible").click();
  await expect(page.getByText("Signed in as someone@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
});

test("app sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/home");
  await expect(page).toHaveURL("/login");
});

test("header offers Get started, or the dashboard when signed in", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/signup");
  await page.unrouteAll();
  await page.route("**/auth/me", (route) => route.fulfill({ json: user }));
  await page.reload();
  await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/home");
  await expect(page.getByRole("link", { name: "Get started" })).toHaveCount(0);
});

test("old /app links redirect and keep their query", async ({ request }) => {
  const to = async (path: string) => (await request.get(path, { maxRedirects: 0 })).headers().location;
  expect(await to("/app")).toBe("/home");
  expect(await to("/app/connections?connected=x")).toBe("/connections?connected=x");
});
