import { expect, test, type Page } from "@playwright/test";

const me = {
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" },
};
const FILE = { readme: "Your SocialReins data", profile: { email: "me@example.com" }, teams: [], complete: true };

// A small brain for the two account calls: `export` and `remove` set what each answers.
async function brain(page: Page) {
  const state = {
    exports: 0,
    export: { status: 200, json: FILE as object },
    deletes: [] as unknown[],
    remove: { status: 204, json: undefined as object | undefined },
    gone: false,
  };
  await page.route("**/auth/me", (route) => (state.gone ? route.fulfill({ status: 401, json: { error: "unauthorized" } }) : route.fulfill({ json: me })));
  await page.route("**/v1/account/export", (route) => {
    state.exports++;
    return route.fulfill(state.export);
  });
  await page.route("**/v1/account", (route) => {
    state.deletes.push(route.request().postDataJSON());
    state.gone = state.remove.status === 204;
    return route.fulfill(state.remove);
  });
  return state;
}

test("downloads a copy of your data, once an hour", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download my data" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^socialreins-export-\d{4}-\d{2}-\d{2}\.json$/);
  const { readFileSync } = await import("node:fs");
  expect(JSON.parse(readFileSync((await download.path())!, "utf8"))).toEqual(FILE);
  await expect(page.getByRole("status")).toHaveText("Your data was downloaded.");

  // A file brain did not finish (no `complete` at the end) is not saved as a good copy.
  state.export = { status: 200, json: { ...FILE, complete: undefined } };
  await page.getByRole("button", { name: "Download my data" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();

  state.export = { status: 429, json: { error: "rate_limited" } };
  await page.getByRole("button", { name: "Download my data" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Too many attempts" })).toBeVisible();
});

test("deleting asks for the typed email and says what happens", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/profile");
  const open = page.getByRole("button", { name: "Delete my account..." });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(dialog).toContainText("cannot be undone");
  await expect(dialog).toContainText("within 30 days");
  await expect(dialog).toContainText("Posts already published on social networks stay");
  const confirm = dialog.getByRole("button", { name: "Delete my account" });
  await expect(confirm).toBeDisabled();
  const field = dialog.getByLabel("Type me@example.com to confirm");
  await field.fill("someone@example.com");
  await expect(confirm).toBeDisabled();
  await field.fill(" ME@example.com ");
  await expect(confirm).toBeEnabled();
  // Leaving without deleting returns focus to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  expect(state.deletes).toEqual([]);

  await open.click();
  await dialog.getByLabel("Type me@example.com to confirm").fill("me@example.com");
  await Promise.all([page.waitForURL("**/"), dialog.getByRole("button", { name: "Delete my account" }).click()]);
  expect(state.deletes).toEqual([{ email: "me@example.com" }]);
});

test("a refused delete says why and keeps the dialog open", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Delete my account..." }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await dialog.getByLabel("Type me@example.com to confirm").fill("me@example.com");
  const confirm = dialog.getByRole("button", { name: "Delete my account" });

  state.remove = { status: 409, json: { error: "owns_shared_team", teams: ["Acme Co", "Beta"] } };
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText("only owner of teams with other members");
  await expect(dialog.getByRole("listitem").filter({ hasText: "Acme Co" })).toBeVisible();
  await expect(dialog.getByRole("listitem").filter({ hasText: "Beta" })).toBeVisible();

  state.remove = { status: 403, json: { error: "reauth_required" } };
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText("a passkey");
  await expect(dialog.getByRole("listitem").filter({ hasText: "Acme Co" })).toHaveCount(0);

  state.remove = { status: 502, json: { error: "stripe_failed" } };
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText("nothing was deleted");
  await expect(dialog).toBeVisible();
  expect(state.deletes).toHaveLength(3);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the data section and dialog fit a phone in ${scheme}`, async ({ page }) => {
    await brain(page);
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/profile");
    await page.getByRole("button", { name: "Delete my account..." }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
