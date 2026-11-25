import { expect, test, type Page } from "@playwright/test";

const team = { id: "t1", name: "Acme", code: "acme22", role: "owner", public_pages: false };
const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: team };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const UUID = "01a2111a-7943-70e9-85db-1f76c5a3928d";
const post = {
  id: UUID,
  number: 48213,
  social_set_id: "d",
  platform: "bluesky",
  body: "Numbered post",
  media: [],
  thread: [],
  status: "published",
  scheduled_at: null,
  published_at: "2026-11-03T08:00:00Z",
  error: null,
  created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [],
  lists: [],
  group_id: null,
};

async function brain(page: Page) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/posts\?/, (route) => route.fulfill({ json: [post] }));
  await page.route(`**/v1/posts/${post.number}`, (route) => route.fulfill({ json: post }));
  await page.route(`**/v1/posts/${UUID}`, (route) => route.fulfill({ json: post }));
}

test("the Posts list links to the post's number, and Duplicate carries it too", async ({ page }) => {
  await brain(page);
  await page.goto("/t/acme22/posts?view=list");
  await expect(page.getByRole("link", { name: /Numbered post/ }).first()).toHaveAttribute("href", "/t/acme22/posts/48213");
});

test("an old address with the UUID moves to the post's number", async ({ page }) => {
  await brain(page);
  await page.goto(`/t/acme22/posts/${UUID}`);
  await expect(page.getByText("Numbered post").first()).toBeVisible();
  await expect(page).toHaveURL("/t/acme22/posts/48213");
  await expect(page.getByRole("link", { name: "Duplicate" })).toHaveAttribute("href", "/t/acme22/posts/new?from=48213");
});
