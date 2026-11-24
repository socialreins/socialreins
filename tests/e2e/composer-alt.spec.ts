import { expect, test, type Page } from "@playwright/test";

// Alt text for each image: written in the composer, sent with the post, loaded back on an edit.
const me = {
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" },
};
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const account = {
  id: "c1",
  provider: "bluesky",
  external_id: "did:plc:alice",
  handle: "alice.test",
  display_name: null,
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  created_at: "2026-10-20T10:00:00Z",
};
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  social_set_id: "d",
  platform: "bluesky",
  body: "Hi",
  media: [] as string[],
  thread: [],
  status: "draft",
  scheduled_at: null,
  published_at: null,
  error: null,
  created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [],
  accounts: [],
  lists: [],
  group_id: null,
  ...extra,
});
const A = "https://example.com/a.png";
const B = "https://example.com/b.png";
const warning = "Add alt text so screen reader users can follow your post.";

async function brain(page: Page) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account] }));
}

test("an image gets alt text with a counter, a nudge while it has none, and it goes with the post", async ({ page }) => {
  await brain(page);
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", { ...sent, media_alt: ["A red bicycle"] }) });
  });
  await page.route("**/v1/posts/p1", (route) => route.fulfill({ json: post("p1", { media: [A], media_alt: ["A red bicycle"] }) }));
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Ride");
  await page.getByRole("button", { name: "Add image" }).click();
  // No link yet: nothing to describe.
  await expect(page.getByRole("button", { name: "Add alt text for image 1" })).toHaveCount(0);
  await page.getByLabel("Image 1 link").fill(A);
  await expect(page.getByText(warning)).toBeVisible();
  await page.getByRole("button", { name: "Add alt text for image 1" }).click();
  const alt = page.getByLabel("Alt text for image 1");
  await expect(alt).toBeFocused();
  await expect(page.getByText("0 of 1000 characters")).toBeVisible();
  await alt.fill("A red bicycle");
  await expect(page.getByText("13 of 1000 characters")).toBeVisible();
  await expect(page.getByText(warning)).toHaveCount(0);
  // The preview shows it.
  await expect(page.locator("[data-preview-alt]")).toContainText("A red bicycle");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  expect(sent).toMatchObject({ media: [A], media_alt: ["A red bicycle"] });
});

test("a post without alt text saves as before, with a warning but no block", async ({ page }) => {
  await brain(page);
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", sent) });
  });
  await page.route("**/v1/posts/p1", (route) => route.fulfill({ json: post("p1", { media: [A] }) }));
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Ride");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill(A);
  await expect(page.getByText(warning)).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  expect(sent).not.toHaveProperty("media_alt");
});

test("a video or a PDF link gets no alt text field", async ({ page }) => {
  await brain(page);
  await page.goto("/posts/new");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/clip.mp4");
  await expect(page.getByLabel("Image 1 link")).toHaveValue("https://example.com/clip.mp4");
  await expect(page.getByRole("button", { name: "Add alt text for image 1" })).toHaveCount(0);
  await expect(page.getByText(warning)).toHaveCount(0);
});

test("an edit loads each image's alt text, and removing an image keeps the others' aligned", async ({ page }) => {
  await brain(page);
  let put: Record<string, unknown> | undefined;
  await page.route("**/v1/posts/p1", (route) => {
    if (route.request().method() === "PUT") {
      put = route.request().postDataJSON();
      return route.fulfill({ json: post("p1", put) });
    }
    return route.fulfill({ json: post("p1", { media: [A, B], media_alt: ["First picture", "Second picture"] }) });
  });
  await page.goto("/posts/p1");
  await expect(page.getByLabel("Alt text for image 1")).toHaveValue("First picture");
  await expect(page.getByLabel("Alt text for image 2")).toHaveValue("Second picture");
  await page.getByRole("button", { name: "Remove image 1" }).click();
  await expect(page.getByLabel("Alt text for image 1")).toHaveValue("Second picture");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  expect(put).toMatchObject({ media: [B], media_alt: ["Second picture"] });
});

test("an edit that clears an alt text sends the empty one, and fixing a link keeps its text", async ({ page }) => {
  await brain(page);
  let put: Record<string, unknown> | undefined;
  await page.route("**/v1/posts/p1", (route) => {
    if (route.request().method() === "PUT") {
      put = route.request().postDataJSON();
      return route.fulfill({ json: post("p1", put) });
    }
    return route.fulfill({ json: post("p1", { media: [A], media_alt: ["First picture"] }) });
  });
  await page.goto("/posts/p1");
  await page.getByLabel("Image 1 link").fill(B);
  await expect(page.getByLabel("Alt text for image 1")).toHaveValue("First picture");
  await page.getByLabel("Alt text for image 1").fill("");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  expect(put).toMatchObject({ media: [B], media_alt: [""] });
});

test("a network that refused the alt text is said on the published post", async ({ page }) => {
  await brain(page);
  await page.route("**/v1/posts/p1", (route) =>
    route.fulfill({
      json: post("p1", {
        status: "published",
        published_at: "2026-11-03T08:00:00Z",
        media: [A],
        media_alt: ["A cat"],
        targets: [{ id: "tg1", social_account_id: "c1", status: "published", remote_id: "r1", remote_url: "https://bsky.app/p/1", error: null, published_at: "2026-11-03T08:00:00Z", parts: [], alt_error: "Alt text of image 1 was not added: Create: too long." }],
      }),
    }),
  );
  await page.goto("/posts/p1");
  await expect(page.locator("[data-alt-error]")).toContainText("Alt text of image 1 was not added");
});
