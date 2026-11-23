import { expect, test, type Page } from "@playwright/test";

// "Publish at" is a local time: pin the zone so it converts to a known UTC time.
test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const account = (id: string, provider: string) => ({ id, provider, external_id: id, handle: `acme.${provider}`, display_name: "Acme", avatar_url: null, token_expires_at: null, set_ids: ["d"], created_at: "2026-10-20T10:00:00Z" });
const saved = (body: Record<string, unknown>, status: string) => ({
  id: "p1", social_set_id: "d", platform: "bluesky", body: "", media: [], thread: [], status, scheduled_at: null, published_at: null, error: null,
  created_by: "u-me", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", targets: [], lists: [], group_id: null, ...body,
});

// A mock brain on Tuesday 10 November 2026, 13:00 in Berlin. It keeps every body posted to /v1/posts, whatever else is asked and in whatever order.
async function brain(page: Page, providers: string[]) {
  const posted: Record<string, unknown>[] = [];
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00Z"));
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route("**/auth/passkeys", (r) => r.fulfill({ json: [] }));
  await page.route(/\/v1\//, (r) => {
    const { pathname } = new URL(r.request().url());
    if (/\/v1\/social-sets$/.test(pathname)) return r.fulfill({ json: [{ id: "d", name: "All sets", is_default: true, account_ids: providers.map((_, i) => `c${i}`), account_count: providers.length, created_at: "2026-10-01T10:00:00Z", deleted_at: null }] });
    if (/\/v1\/connections$/.test(pathname)) return r.fulfill({ json: providers.map((p, i) => account(`c${i}`, p)) });
    if (/\/v1\/teams$/.test(pathname)) return r.fulfill({ json: [me.current_team] });
    if (/\/queue$/.test(pathname)) return r.fulfill({ json: { time_zone: "Europe/Berlin", slots: [], next: [] } });
    if (/\/v1\/posts$/.test(pathname) && r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      posted.push(body);
      return r.fulfill({ status: 201, json: saved(body, body.scheduled_at ? "scheduled" : "draft") });
    }
    if (/\/v1\/posts\/p1$/.test(pathname)) return r.fulfill({ json: saved(posted.at(-1) ?? {}, posted.at(-1)?.scheduled_at ? "scheduled" : "draft") });
    return r.fulfill({ json: [] });
  });
  return posted;
}

test("one network shows the short media hint and the disclosure, like the tabs do", async ({ page }) => {
  await brain(page, ["bluesky"]);
  await page.goto("/posts/new");
  const images = page.getByRole("group", { name: "Images" });
  await expect(images.getByText("Up to 4. Upload files from your device (or drop them here), or add public https links, Google Drive or Dropbox share links. An upload is kept while a post that names it has yet to go out, a failed one included, so a retry finds it.", { exact: true })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  const rules = images.getByText(/Bluesky takes/);
  await expect(rules).toBeHidden();
  await images.getByText("What each network takes").click();
  await expect(rules).toBeVisible();
  await expect(images.getByText(/Size limits/)).toBeVisible();
});

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 700 }])
  test(`at the bottom of the page the last field stays above the action bar (${size.width} wide)`, async ({ page }) => {
    await page.setViewportSize(size);
    await brain(page, ["bluesky", "linkedin"]);
    await page.goto("/posts/new");
    await page.getByLabel("Post", { exact: true }).fill("Launch day");
    // The last field of the form: LinkedIn takes a first comment.
    const last = page.getByLabel("First comment", { exact: true });
    await expect(last).toBeVisible();
    const scrollTo = (end: boolean) =>
      page.locator("#main").evaluate((el, end) => {
        for (let n: Element | null = el; n; n = n.parentElement) n.scrollTop = end ? n.scrollHeight : 0;
      }, end);
    const bar = page.getByRole("button", { name: "Save draft" }).locator("xpath=ancestor::div[contains(@class,'sticky')][1]");
    // How far the field's lower edge is under the bar's upper edge: above zero, the bar covers it (or it is further down).
    const under = async () => {
      const [field, box] = await Promise.all([last.boundingBox(), bar.boundingBox()]);
      return field!.y + field!.height - box!.y;
    };
    await scrollTo(true);
    await expect.poll(under).toBeLessThanOrEqual(0);
    await expect(last).toBeInViewport();
    // From the top, where the bar floats over the form, the field the keyboard reaches clears the bar too.
    await scrollTo(false);
    await expect.poll(under).toBeGreaterThan(0);
    await last.focus();
    await expect.poll(under).toBeLessThanOrEqual(0);
    await expect(last).toBeInViewport();
  });

test("Ctrl or Cmd + S saves the draft once and stops the browser's dialog", async ({ page }) => {
  const posted = await brain(page, ["bluesky"]);
  await page.goto("/posts/new");
  const text = page.getByLabel("Post", { exact: true });
  await expect(page.getByText("saves the draft.")).toBeVisible();
  await text.fill("Launch day");
  await page.evaluate(() => addEventListener("keydown", (e) => ((window as unknown as { stopped: boolean }).stopped = e.defaultPrevented)));
  await text.press("ControlOrMeta+s");
  await expect(page).toHaveURL("/t/acme22/posts/p1");
  expect(posted).toEqual([{ social_set_id: "d", platform: "bluesky", body: "Launch day", media: [], thread: [], scheduled_at: null }]);
  expect(await page.evaluate(() => (window as unknown as { stopped: boolean }).stopped)).toBe(true);
});

test("Ctrl or Cmd + Enter moves to Publish at without a time and schedules with one", async ({ page }) => {
  const posted = await brain(page, ["bluesky"]);
  await page.goto("/posts/new");
  const text = page.getByLabel("Post", { exact: true });
  await text.fill("Launch day");
  await text.press("ControlOrMeta+Enter");
  await expect(page.getByLabel("Publish at")).toBeFocused();
  expect(posted).toEqual([]);
  await page.getByLabel("Publish at").fill("2026-11-20T09:30");
  await text.press("ControlOrMeta+Enter");
  await expect(page).toHaveURL("/t/acme22/posts/p1");
  expect(posted).toEqual([{ social_set_id: "d", platform: "bluesky", body: "Launch day", media: [], thread: [], scheduled_at: "2026-11-20T08:30:00.000Z" }]);
});
