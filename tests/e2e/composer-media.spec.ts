import { expect, test, type Page } from "@playwright/test";

// Picking accounts per post and uploading media from the device (decision 0008).
const me = {
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" },
};
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1", "c2", "c3"], account_count: 3, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const account = (id: string, provider: string, handle: string) => ({
  id,
  provider,
  external_id: `x-${id}`,
  handle,
  display_name: null,
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  created_at: "2026-10-20T10:00:00Z",
});
const accounts = [account("c1", "bluesky", "alice.test"), account("c2", "bluesky", "bob.test"), account("c3", "threads", "carol")];
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

async function brain(page: Page) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: accounts }));
}

test("every account is ticked; an unticked one is left out of the post and a draft keeps the choice", async ({ page }) => {
  await brain(page);
  const sent: Record<string, unknown>[] = [];
  await page.route("**/v1/post-groups", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { group_id: "g1", posts: [post("p1", { group_id: "g1", account_ids: ["c2"] }), post("p2", { platform: "threads", group_id: "g1" })], skipped: [], expected_targets: 2 } });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Hi");
  const alice = page.getByRole("checkbox", { name: "@alice.test on Bluesky" });
  await expect(alice).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "@bob.test on Bluesky" })).toBeChecked();
  // One account of its platform: nothing to pick.
  await expect(page.getByRole("checkbox", { name: "@carol on Threads" })).toHaveCount(0);
  await alice.uncheck();
  await page.getByRole("checkbox", { name: "@bob.test on Bluesky" }).uncheck();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Pick at least one Bluesky account" })).toBeVisible();
  expect(sent).toEqual([]);
  await page.getByRole("checkbox", { name: "@bob.test on Bluesky" }).check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved 2 drafts, one per platform.")).toBeVisible();
  expect(sent[0]!.account_ids).toEqual(["c2", "c3"]);
  expect(sent[0]!.platforms).toEqual(["bluesky", "threads"]);
});

test("a saved post's choice loads, and ticking every account sends null, clearing it", async ({ page }) => {
  await brain(page);
  let put: Record<string, unknown> | undefined;
  await page.route("**/v1/posts/p1", (route) => {
    if (route.request().method() === "PUT") {
      put = route.request().postDataJSON();
      return route.fulfill({ json: post("p1") });
    }
    return route.fulfill({ json: post("p1", { account_ids: ["c1"] }) });
  });
  await page.goto("/posts/p1");
  await expect(page.getByRole("checkbox", { name: "@alice.test on Bluesky" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "@bob.test on Bluesky" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "@bob.test on Bluesky" }).check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  expect(put!.account_ids).toBeNull();
});

test("a file is uploaded from the device with progress, and a refused one says why", async ({ page }) => {
  await brain(page);
  const bodies: number[] = [];
  await page.route("**/v1/uploads", async (route) => {
    const size = route.request().postDataBuffer()?.length ?? 0;
    bodies.push(size);
    if (size > 100) return route.fulfill({ status: 413, json: { error: "media_too_large" } });
    return route.fulfill({ status: 201, json: { id: "u1", url: "https://brain.example/media/sealed.png", content_type: "image/png", size } });
  });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/post-groups", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { group_id: "g1", posts: [post("p1", { group_id: "g1" })], skipped: [], expected_targets: 3 } });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("With a photo");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56)]);
  await page.getByLabel("Upload files", { exact: true }).setInputFiles([{ name: "photo.png", mimeType: "image/png", buffer: png }]);
  await expect(page.getByLabel("Image 1 link")).toHaveValue("https://brain.example/media/sealed.png");
  await page.getByLabel("Upload files", { exact: true }).setInputFiles([{ name: "big.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(500) }]);
  await expect(page.getByRole("alert").filter({ hasText: "big.mp4 was not uploaded: it is too large" })).toBeVisible();
  expect(bodies).toEqual([64, 500]);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  expect(sent!.media).toEqual(["https://brain.example/media/sealed.png"]);
});

test("an upload holds saving until it is in or cancelled, and each refused file says why", async ({ page }) => {
  await brain(page);
  let release = () => {};
  const held = new Promise<void>((done) => (release = done));
  const bodies: number[] = [];
  await page.route("**/v1/uploads", async (route) => {
    const size = route.request().postDataBuffer()?.length ?? 0;
    bodies.push(size);
    if (size === 64) {
      await held;
      // Cancelled by then: the browser dropped the request.
      return route.fulfill({ status: 201, json: { id: "u1", url: "https://brain.example/media/late.png", content_type: "image/png", size } }).catch(() => {});
    }
    return route.fulfill({ status: size > 100 ? 413 : 422, json: { error: size > 100 ? "media_too_large" : "media_type_not_supported" } });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Wait for it");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56)]);
  await page.getByLabel("Upload files", { exact: true }).setInputFiles([{ name: "slow.png", mimeType: "image/png", buffer: png }]);
  await expect(page.getByLabel("Uploading slow.png")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish now" })).toBeDisabled();
  await expect(page.getByText("Saving waits for the upload to finish. Cancel it to save without.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel uploading slow.png" }).click();
  await expect(page.getByLabel("Uploading slow.png")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  release();
  await expect(page.getByLabel("Image 1 link")).toHaveCount(0);
  // Two refused at once: both say why.
  await page.getByLabel("Upload files", { exact: true }).setInputFiles([
    { name: "big.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(500) },
    { name: "notes.txt", mimeType: "image/png", buffer: Buffer.alloc(10) },
  ]);
  await expect(page.getByText("big.mp4 was not uploaded: it is too large")).toBeVisible();
  await expect(page.getByText("notes.txt was not uploaded: it is not a JPEG")).toBeVisible();
  expect(bodies.sort((a, b) => a - b)).toEqual([10, 64, 500]);
});
