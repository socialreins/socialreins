import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Fixed zone, so the CSV's local times convert to known UTC times.
test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "member" } };
const sets = [{ id: "d", name: "All sets", is_default: true, account_ids: ["c1", "c2", "c3"], account_count: 3, created_at: "2026-10-01T10:00:00Z", deleted_at: null }];
const account = (id: string, provider: string) => ({
  id,
  provider,
  external_id: id,
  handle: `${id}.example`,
  display_name: id,
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  created_at: "2026-10-20T10:00:00Z",
});
const post = (id: string, platform: string, body: Record<string, unknown>) => ({
  id,
  social_set_id: "d",
  platform,
  body: body.body,
  media: [],
  thread: [],
  status: body.queue || body.scheduled_at ? "scheduled" : "draft",
  scheduled_at: body.queue ? "2026-12-01T08:00:00Z" : (body.scheduled_at ?? null),
  published_at: null,
  error: null,
  created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [],
  lists: [],
  group_id: null,
});

export const csv = [
  "text,networks,media,time,first_comment",
  "Scheduled hello,bluesky x,,2099-11-25 09:30,",
  "Queued one,bluesky,,queue,",
  '"A draft, with a comma",,,,',
  ",bluesky,,,",
  "Too long for brain,bluesky,,,",
  "Old news,bluesky,,2020-01-01 09:00,",
  "Dance,tiktok,,,",
].join("\r\n");

// brain: validate_only refuses the "Too long" row; creates answer in turn, the first try of `limitOn` a 429.
export async function brain(page: Page, limitOn = "") {
  const state = { checks: [] as { url: string; body: Record<string, unknown> }[], creates: [] as { url: string; body: Record<string, unknown> }[] };
  let limited = false;
  let n = 0;
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [account("c1", "bluesky"), account("c2", "x"), account("c3", "tiktok")] }));
  await page.route(/\/v1\/lists(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/(posts|post-groups)(\?.*)?$/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: [] });
    const body = req.postDataJSON() as Record<string, unknown>;
    if (req.url().includes("validate_only=true")) {
      state.checks.push({ url: req.url(), body });
      const bad = String(body.body).startsWith("Too long");
      return route.fulfill({
        json: {
          ok: !bad,
          platforms: [{ platform: "bluesky", account_ids: ["c1"], ok: !bad, problems: bad ? [{ code: "too_long", field: "body", limit: 300, actual: 412 }] : [] }],
          problems: [],
        },
      });
    }
    state.creates.push({ url: req.url(), body });
    if (limitOn && String(body.body) === limitOn && !limited) {
      limited = true;
      return route.fulfill({ status: 429, json: { error: "rate_limited" } });
    }
    n++;
    if (req.url().includes("post-groups")) {
      const platforms = body.platforms as string[];
      return route.fulfill({ status: 201, json: { group_id: `g${n}`, posts: platforms.map((p, i) => post(`p${n}-${i}`, p, body)), skipped: [] } });
    }
    return route.fulfill({ status: 201, json: post(`p${n}`, String(body.platform), body) });
  });
  return state;
}

export async function upload(page: Page, text = csv) {
  await page.getByLabel("CSV file").setInputFiles({ name: "posts.csv", mimeType: "text/csv", buffer: Buffer.from(`﻿${text}`) });
}

test("the Posts toolbar links to the bulk upload, which shows the format, the set and a template", async ({ page }) => {
  await brain(page);
  await page.goto("/posts");
  await page.getByRole("link", { name: "Upload CSV" }).click();
  await expect(page).toHaveURL("/t/acme22/posts/bulk");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("heading", { name: "Bulk upload", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set: All sets" })).toBeVisible();
  await expect(page.getByText("Posts go to All sets")).toBeVisible();
  await expect(page.getByText("Empty means every network the set has (Bluesky, X)")).toBeVisible();
  await expect(page.getByText("TikTok isn't offered here")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download template" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("socialreins-posts-template.csv");
  const text = readFileSync((await file.path())!, "utf8");
  expect(text.split("\r\n")[0]).toBe("text,networks,media,time,first_comment");
  expect(text).toMatch(/,queue,/);
});

test("a preview shows local and brain's problems, and scheduling sends the right posts, stopping at a rate limit", async ({ page }) => {
  const state = await brain(page, "Queued one");
  await page.goto("/posts/bulk");
  await upload(page);

  const table = page.getByRole("table", { name: "Posts in the file, in order" });
  const row = (n: number) => table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: String(n), exact: true }) });
  await expect(page.getByText("7 rows: 3 ready, 4 with problems.")).toBeVisible();
  await expect(row(1)).toContainText("Ready");
  await expect(row(2)).toContainText("Next queue time");
  await expect(row(3)).toContainText("Draft");
  await expect(row(4)).toContainText("The text is missing.");
  await expect(row(5)).toContainText("Bluesky: The post is too long");
  await expect(row(6)).toContainText("2020-01-01 09:00 is in the past.");
  await expect(row(7)).toContainText("Post to TikTok from the composer.");

  // Only rows without a local problem go to brain, each with validate_only and the payload a create would send.
  expect(state.checks.map((c) => c.body.body).sort()).toEqual(["A draft, with a comma", "Queued one", "Scheduled hello", "Too long for brain"]);
  expect(state.creates).toHaveLength(0);
  const draftCheck = state.checks.find((c) => c.body.body === "A draft, with a comma")!;
  expect(draftCheck.url).toMatch(/\/v1\/post-groups\?validate_only=true$/);
  expect(draftCheck.body.platforms).toEqual(["bluesky", "x"]);

  const failures = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 4 rows with problems" }).click();
  const failed = readFileSync((await (await failures).path())!, "utf8").split("\r\n");
  expect(failed[0]).toBe("text,networks,media,time,first_comment,error");
  expect(failed[1]).toBe(",bluesky,,,,The text is missing.");
  expect(failed).toHaveLength(6);

  await page.getByRole("button", { name: "Schedule 3 posts" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "rate limit" })).toHaveText("brain's rate limit stopped the run after 1 post. Wait a minute, then continue with the 2 left.");
  await expect(row(1)).toContainText("Scheduled, 2 posts");
  await expect(row(2)).toContainText("Not created yet");
  await page.getByRole("button", { name: "Continue with 2 posts" }).click();
  await expect(page.getByText("7 rows: 3 created, 0 ready, 4 with problems.")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "rate limit" })).toBeHidden();
  await expect(row(2)).toContainText("Scheduled");
  await expect(row(3)).toContainText("Draft saved, 2 posts");
  await expect(row(1).getByRole("link", { name: "Open post 1" })).toHaveAttribute("href", "/t/acme22/posts/p1-0");
  await expect(row(2).getByRole("link", { name: "Open post 2" })).toHaveAttribute("href", "/t/acme22/posts/p2");

  const sent = state.creates.map((c) => ({ path: new URL(c.url).pathname + new URL(c.url).search, ...c.body }));
  expect(sent).toEqual([
    { path: "/v1/post-groups", social_set_id: "d", platforms: ["bluesky", "x"], body: "Scheduled hello", media: [], scheduled_at: "2099-11-25T08:30:00.000Z" },
    { path: "/v1/posts", social_set_id: "d", platform: "bluesky", body: "Queued one", media: [], queue: true },
    { path: "/v1/posts", social_set_id: "d", platform: "bluesky", body: "Queued one", media: [], queue: true },
    { path: "/v1/post-groups", social_set_id: "d", platforms: ["bluesky", "x"], body: "A draft, with a comma", media: [], scheduled_at: null },
  ]);
  await expect(page.getByRole("button", { name: "Schedule 0 posts" })).toBeDisabled();
});

test("a file that can't be read says why", async ({ page }) => {
  await brain(page);
  await page.goto("/posts/bulk");
  await upload(page, "body\nhello");
  await expect(page.getByRole("alert").filter({ hasText: "first line" })).toHaveText("The first line must name the columns, with at least text. Download the template to start from.");
  await expect(page.getByRole("table")).toBeHidden();
});
