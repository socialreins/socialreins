import { expect, test, type Page } from "@playwright/test";

const team = { id: "t1", name: "Acme", code: "acme22", role: "owner", public_pages: false };
const me = (extra: Record<string, unknown> = {}) => ({ id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { ...team, ...extra } });
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const post = {
  id: "p1",
  social_set_id: "d",
  platform: "bluesky",
  body: "Hello",
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

async function brain(page: Page, session: unknown) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: session }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/posts/p1", (route) => route.fulfill({ json: post }));
}

test("an owner switches public pages on for the team", async ({ page }) => {
  await brain(page, me());
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/team/invitations", (route) => route.fulfill({ json: [] }));
  let sent: unknown;
  await page.route("**/v1/team", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ...team, public_pages: true } });
  });
  await page.goto("/t/acme22/team");
  const box = page.getByRole("checkbox", { name: "Posts can have a public page" });
  await expect(box).not.toBeChecked();
  // The box follows the saved setting, so it ticks once brain answers.
  await box.click();
  await expect(page.getByText("Public pages are on.")).toBeVisible();
  expect(sent).toEqual({ public_pages: true });
  await expect(box).toBeChecked();
});

test("a post gets a public page with details, and the editor only points to Team while pages are off", async ({ page }) => {
  await brain(page, me());
  await page.goto("/t/acme22/posts/p1");
  await expect(page.getByText("Switch public pages on under")).toBeVisible();
  await expect(page.getByRole("region", { name: "Public page" })).toHaveCount(0);

  await brain(page, me({ public_pages: true }));
  let saved: unknown;
  await page.route("**/v1/posts/p1/page", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { enabled: false, details: "", code: null, live: false } });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { ...(saved as object), code: "abcdefghjk", live: true } });
  });
  await page.reload();
  const panel = page.getByRole("region", { name: "Public page" });
  await panel.getByRole("checkbox", { name: "Anyone with the link can see this post and its details" }).check();
  await panel.getByRole("textbox", { name: "Details" }).fill("Slides: https://example.com/slides");
  await panel.getByRole("button", { name: "Save public page" }).click();
  await expect(panel.getByText("Public page saved.")).toBeVisible();
  expect(saved).toEqual({ enabled: true, details: "Slides: https://example.com/slides" });
  await expect(panel.getByRole("link", { name: /\/p\/abcdefghjk/ })).toHaveAttribute("href", /\/p\/abcdefghjk$/);
});

test("the public page shows the post, its details and where it is live, without a sign-in", async ({ page }) => {
  let asked = "";
  await page.route("**/v1/public/pages/*", (route) => {
    asked = route.request().url();
    if (asked.endsWith("/gone")) return route.fulfill({ status: 404, json: { error: "not_found" } });
    return route.fulfill({
      json: {
        team: "Acme",
        body: "Launch day, see https://example.com/launch.",
        media: ["https://example.com/a.jpg", "https://drive.google.com/file/d/1/view", "https://example.com/clip.mp4"],
        thread: [{ body: "Part two", media: [] }],
        details: "Slides: https://example.com/slides\nThanks for reading",
        published_at: "2026-11-03T08:00:00Z",
        links: [{ platform: "bluesky", url: "https://bsky.app/profile/a/post/1" }],
      },
    });
  });
  const res = await page.goto("/p/abcdefghjk");
  // Only this page may load images from any https host.
  expect(res!.headers()["content-security-policy"]).toContain("img-src 'self' data: https:;");
  await expect(page.getByText("Posted by Acme")).toBeVisible();
  expect(asked).toMatch(/\/v1\/public\/pages\/abcdefghjk$/);
  // A link's closing full stop is not part of it.
  await expect(page.getByRole("link", { name: "https://example.com/launch", exact: true })).toHaveAttribute("rel", "nofollow ugc noopener noreferrer");
  await expect(page.getByText("Part two")).toBeVisible();
  // Only the plain image shows: a share link and a video are left out.
  await expect(page.locator("article img")).toHaveCount(1);
  await expect(page.locator("article img")).toHaveAttribute("src", "https://example.com/a.jpg");
  const details = page.getByRole("region", { name: "Details" });
  await expect(details.getByRole("link", { name: "https://example.com/slides" })).toBeVisible();
  await expect(page.getByRole("link", { name: /See it on Bluesky/ })).toHaveAttribute("href", "https://bsky.app/profile/a/post/1");

  await page.goto("/p/gone");
  await expect(page.getByText("This page is not available.")).toBeVisible();
  const home = await page.goto("/");
  expect(home!.headers()["content-security-policy"]).not.toContain("img-src 'self' data: https:;");
});
