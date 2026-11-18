import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const team = { id: "t1", name: "Acme", code: "acme22", role: "owner", public_pages: true, newsletter: false };
const me = (extra: Record<string, unknown> = {}) => ({ id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { ...team, ...extra } });
const subs = [
  { id: "s1", email: "ann@example.com", confirmed: true, subscribed_at: "2026-11-18T10:00:00Z" },
  { id: "s2", email: "bob@example.com", confirmed: false, subscribed_at: "2026-11-18T11:00:00Z" },
];

async function brain(page: Page, session: unknown) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: session }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/team/invitations", (route) => route.fulfill({ json: [] }));
}

test("an owner switches the newsletter on, reads the list, downloads the confirmed ones and removes one", async ({ page }) => {
  await brain(page, me());
  let sent: unknown;
  await page.route("**/v1/team", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ...team, newsletter: true } });
  });
  let list = [...subs];
  await page.route("**/v1/subscribers", (route) => route.fulfill({ json: { subscribers: list } }));
  await page.route("**/v1/subscribers/s2", (route) => {
    list = list.filter((s) => s.id !== "s2");
    return route.fulfill({ status: 204 });
  });
  await page.goto("/t/acme22/team");
  const box = page.getByRole("checkbox", { name: "Public pages offer a newsletter sign-up" });
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(page.getByText("Public pages now offer a newsletter sign-up.")).toBeVisible();
  expect(sent).toEqual({ newsletter: true });
  await expect(box).toBeChecked();

  await expect(page.getByText("1 confirmed, 1 waiting for the email link.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the confirmed ones (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("subscribers.csv");
  const csv = readFileSync((await file.path())!, "utf8");
  expect(csv).toBe("email,subscribed_at\r\nann@example.com,2026-11-18T10:00:00Z\r\n");

  await page.getByRole("button", { name: "Remove bob@example.com" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("bob@example.com", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove bob@example.com" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByText("bob@example.com was removed.")).toBeVisible();
  await expect(page.getByText("Not confirmed yet")).toHaveCount(0);
});

test("the newsletter section only shows while public pages are on", async ({ page }) => {
  await brain(page, me({ public_pages: false }));
  await page.goto("/t/acme22/team");
  await expect(page.getByRole("checkbox", { name: "Posts can have a public page" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Public pages offer a newsletter sign-up" })).toHaveCount(0);
});

const publicPage = (newsletter: boolean) => ({
  team: "Acme",
  body: "Launch day",
  media: [],
  thread: [],
  details: "",
  newsletter,
  published_at: "2026-11-03T08:00:00Z",
  links: [],
});

test("a visitor signs up from the public page and is told to check their email", async ({ page }) => {
  await page.route("**/v1/public/pages/abcdefghjk", (route) => route.fulfill({ json: publicPage(true) }));
  let posted: unknown;
  await page.route("**/v1/public/pages/abcdefghjk/subscribe", (route) => {
    posted = route.request().postDataJSON();
    return route.fulfill({ json: { status: "ok" } });
  });
  await page.goto("/p/abcdefghjk");
  await page.getByLabel(/Your email/).fill(" Reader@Example.com ");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByText("Check your email: we sent a link to confirm your subscription.")).toBeVisible();
  expect(posted).toEqual({ email: "Reader@Example.com" });
});

test("a refused sign-up says why, and a page without a newsletter has no form", async ({ page }) => {
  await page.route("**/v1/public/pages/abcdefghjk", (route) => route.fulfill({ json: publicPage(true) }));
  let answer = { status: 422, json: { error: "invalid_email" } };
  await page.route("**/v1/public/pages/abcdefghjk/subscribe", (route) => route.fulfill(answer));
  await page.goto("/p/abcdefghjk");
  await page.getByLabel(/Your email/).fill("a@b.co");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByText("That doesn't look like an email address.")).toBeVisible();
  answer = { status: 429, json: { error: "rate_limited" } };
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByText(/Wait a minute, then try again/)).toBeVisible();

  await page.unroute("**/v1/public/pages/abcdefghjk");
  await page.route("**/v1/public/pages/abcdefghjk", (route) => route.fulfill({ json: publicPage(false) }));
  await page.goto("/p/abcdefghjk");
  await expect(page.getByText("Posted by Acme")).toBeVisible();
  await expect(page.getByLabel(/Your email/)).toHaveCount(0);
});

test("the newsletter verify page confirms only on a click and names the team", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/v1/public/newsletter/verify", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: "verified", team: "Acme" } });
  });
  await page.goto("/newsletter/verify?token=ab12");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm your subscription");
  await page.waitForLoadState("networkidle");
  expect(sent).toEqual([]);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're subscribed" })).toBeFocused();
  await expect(page.getByText("You'll get the newsletter of Acme.")).toBeVisible();
  expect(sent).toEqual([{ token: "ab12" }]);

  await page.unroute("**/v1/public/newsletter/verify");
  await page.route("**/v1/public/newsletter/verify", (route) => route.fulfill({ status: 422, json: { error: "invalid_link" } }));
  await page.goto("/newsletter/verify?token=bad");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("That link didn't work");
});
