import { expect, test, type Page } from "@playwright/test";

// Sets in different time zones: the calendar and Home put each post on the day and time of its own set's zone,
// and say which zone that is. Browser in Berlin; the clock is 10 November 2026, 12:00 in Berlin.
test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };
const set = (id: string, name: string, is_default = false) => ({ id, name, is_default, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null });
const sets = [set("d", "All sets", true), set("s-en", "EN"), set("s-us", "US")];
const post = (id: string, setId: string, scheduled_at: string, extra: Record<string, unknown> = {}) => ({
  id, social_set_id: setId, platform: "bluesky", body: `Body of ${id}`, media: [], thread: [], status: "scheduled", scheduled_at, published_at: null, error: null,
  created_by: "u-me", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", targets: [], lists: [], group_id: null, ...extra,
});
const queue = (time_zone: string) => ({ time_zone, slots: [{ weekday: 1, time: "09:00" }], next: [] });

async function brain(page: Page, posts: unknown[], current: string) {
  await page.clock.setFixedTime(new Date("2026-11-10T11:00:00Z"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((c) => {
    localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now()));
    localStorage.setItem("current-set:t1", c);
  }, current);
  await page.route("http://localhost:8080/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (r) => r.fulfill({ json: sets }));
  await page.route(/\/v1\/social-sets\/s-en\/queue$/, (r) => r.fulfill({ json: queue("Asia/Dhaka") }));
  await page.route(/\/v1\/social-sets\/s-us\/queue$/, (r) => r.fulfill({ json: queue("America/New_York") }));
  await page.route(/\/v1\/posts(\?.*)?$/, (r) => r.fulfill({ json: new URL(r.request().url()).searchParams.get("status") === "draft" ? [] : posts }));
}

const cell = (page: Page, day: number) => page.getByRole("table", { name: "Posts in November 2026" }).locator("td", { has: page.locator("p", { hasText: new RegExp(`^${day}$`) }) });

test("each post sits on the day and time of its own set's zone, tagged and explained", async ({ page }) => {
  await brain(
    page,
    [
      // 02:00 on the 13th in Dhaka (UTC+6), 21:00 on the 12th in Berlin.
      post("p-en", "s-en", "2026-11-12T20:00:00Z", { body: "Dhaka post" }),
      // 18:30 on the 12th in New York (UTC-5), 00:30 on the 13th in Berlin.
      post("p-us", "s-us", "2026-11-12T23:30:00Z", { body: "New York post" }),
    ],
    "d",
  );
  await page.goto("/calendar");
  await expect(cell(page, 13).getByRole("link", { name: /Dhaka post/ })).toContainText("2:00 AM");
  await expect(cell(page, 13).getByRole("link", { name: /Dhaka post/ })).toContainText("GMT+6");
  await expect(cell(page, 12).getByRole("link", { name: /New York post/ })).toContainText("6:30 PM");
  await expect(cell(page, 12).getByRole("link", { name: /New York post/ })).toContainText(/GMT-5|EST/);
  await expect(cell(page, 12).getByRole("link", { name: /Dhaka post/ })).toHaveCount(0);
  const note = page.locator("[data-zone-note]");
  await expect(note).toContainText("Your sets use different time zones");
  await expect(note).toContainText("Asia/Dhaka (EN)");
  await expect(note).toContainText("America/New York (US)");
  await expect(note).toContainText("Europe/Berlin");
});

test("a picked set says its own zone, and a set in the browser's zone is untagged", async ({ page }) => {
  await brain(page, [post("p-en", "s-en", "2026-11-12T20:00:00Z", { body: "Dhaka post" })], "s-en");
  await page.goto("/calendar");
  await expect(page.locator("[data-zone-note]")).toContainText("Days and times are in Asia/Dhaka, the time zone of EN.");
  await expect(cell(page, 13).getByRole("link", { name: /Dhaka post/ })).toContainText("2:00 AM");
});

test("with every set in the browser's zone the calendar says so and tags nothing", async ({ page }) => {
  await brain(page, [post("p-b", "d", "2026-11-12T20:00:00Z", { body: "Berlin post" })], "d");
  await page.goto("/calendar");
  await expect(cell(page, 12).getByRole("link", { name: /Berlin post/ })).toContainText("9:00 PM");
  await expect(cell(page, 12).getByRole("link", { name: /Berlin post/ })).not.toContainText("GMT");
  await expect(page.locator("[data-zone-note]")).toContainText("Days and times are in Europe/Berlin, your browser's zone.");
});

test("Home sorts today and tomorrow by each post's own set zone", async ({ page }) => {
  await brain(
    page,
    [
      // 20:30 on the 10th in Berlin (today there), but 01:30 on the 11th in Dhaka, where it is already evening of the 10th.
      post("p-en", "s-en", "2026-11-10T19:30:00Z", { body: "Dhaka evening" }),
      post("p-us", "s-us", "2026-11-10T19:30:00Z", { body: "New York afternoon" }),
    ],
    "d",
  );
  await page.goto("/home");
  const next = page.getByRole("region", { name: "Today and next" });
  // In Dhaka it is 17:00 on the 10th, so 01:30 on the 11th is tomorrow; in New York it is 05:00 on the 10th, so 14:30 is today.
  await expect(next.getByRole("heading", { level: 3 })).toHaveText([/^Today/, /^Tomorrow/]);
  await expect(next.getByRole("link", { name: /New York afternoon/ })).toContainText("2:30 PM");
  await expect(next.getByRole("link", { name: /Dhaka evening/ })).toContainText("1:30 AM GMT+6");
});
