import { expect, test, type Page } from "@playwright/test";

// Fixed zone, so the browser's zone and the composer's times are known.
test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "member" } };
const sets = [
  { id: "d", name: "All sets", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null },
  { id: "s1", name: "Clients", is_default: false, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null },
];
const alice = {
  id: "c1",
  provider: "bluesky",
  external_id: "did:plc:alice",
  handle: "alice.bsky.social",
  display_name: "Alice",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d", "s1"],
  created_at: "2026-10-20T10:00:00Z",
};
type Queue = { time_zone: string; slots: { weekday: number; time: string }[]; next: string[] };
const fresh: Queue = { time_zone: "UTC", slots: [], next: [] };

// queue: what GET answers for the set; `put` answers the PUT (a status and body) and records it.
async function brain(page: Page, queue: Queue = fresh, put?: (body: Queue) => { status: number; json: unknown }) {
  const state = { queue, sent: [] as Queue[], gets: [] as string[] };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [alice] }));
  await page.route(/\/v1\/(posts|lists)(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/social-sets\/[^/]+\/queue$/, (route) => {
    const req = route.request();
    state.gets.push(req.url());
    if (req.method() === "PUT") {
      const body = req.postDataJSON() as Queue;
      state.sent.push(body);
      const r = put?.(body) ?? { status: 200, json: { ...body, next: [] } };
      if (r.status === 200) state.queue = { ...body, next: ["2026-11-19T08:00:00Z", "2026-11-20T08:00:00Z"] };
      return route.fulfill(r);
    }
    return route.fulfill({ json: state.queue });
  });
  return state;
}

test("the sidebar links to the queue, which shows the set switcher", async ({ page }) => {
  await brain(page);
  await page.goto("/calendar");
  const nav = page.getByRole("navigation", { name: "App" });
  await nav.getByRole("link", { name: "Queue", exact: true }).click();
  await expect(page).toHaveURL("/t/acme22/queue");
  await expect(nav.getByRole("link", { name: "Queue", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("heading", { name: "Queue", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set: All sets" })).toBeVisible();
});

test("a new queue starts in the browser's zone; times are added, removed and saved", async ({ page }) => {
  const state = await brain(page);
  await page.goto("/queue");
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/Berlin");
  await expect(page.getByText("No times yet.")).toBeVisible();

  await page.getByLabel("Time", { exact: true }).fill("09:00");
  await page.getByRole("button", { name: "Weekdays" }).click();
  await page.getByRole("button", { name: "Add time" }).click();
  await page.getByLabel("Time", { exact: true }).fill("18:30");
  await page.getByRole("button", { name: "Every day" }).click();
  await page.getByRole("button", { name: "Add time" }).click();
  const grid = page.getByRole("table", { name: "Queue times by day" });
  await expect(grid.getByRole("rowheader")).toHaveText(["09:00", "18:30"]);
  await expect(grid.getByRole("button", { name: /^Remove / })).toHaveCount(12);
  await grid.getByRole("button", { name: "Remove Wednesday at 09:00" }).click();
  await expect(grid.getByRole("button", { name: /^Remove / })).toHaveCount(11);
  await expect(page.getByText("Unsaved changes.")).toBeVisible();

  await page.getByRole("button", { name: "Save queue" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Queue saved." })).toBeFocused();
  expect(state.sent).toHaveLength(1);
  expect(state.sent[0]!.time_zone).toBe("Europe/Berlin");
  expect(state.sent[0]!.slots).toEqual([
    { weekday: 1, time: "09:00" },
    { weekday: 2, time: "09:00" },
    { weekday: 4, time: "09:00" },
    { weekday: 5, time: "09:00" },
    { weekday: 1, time: "18:30" },
    { weekday: 2, time: "18:30" },
    { weekday: 3, time: "18:30" },
    { weekday: 4, time: "18:30" },
    { weekday: 5, time: "18:30" },
    { weekday: 6, time: "18:30" },
    { weekday: 0, time: "18:30" },
  ]);
  await expect(page.getByText("Unsaved changes.")).toBeHidden();
  const next = page.getByRole("region", { name: "Next free slots" });
  await expect(next).toContainText("In Europe/Berlin.");
  await expect(next.getByRole("listitem")).toHaveCount(2);
  await expect(next.getByRole("listitem").first()).toContainText("09:00");
});

test("a saved queue keeps its zone, lists next slots in it, and shows brain's refusal", async ({ page }) => {
  await brain(page, { time_zone: "Asia/Dhaka", slots: [{ weekday: 4, time: "09:00" }], next: ["2026-11-19T03:00:00Z"] }, () => ({
    status: 422,
    json: { error: "too_many_slots" },
  }));
  await page.goto("/queue");
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Dhaka");
  await expect(page.getByRole("region", { name: "Next free slots" }).locator("time")).toHaveAttribute("datetime", "2026-11-19T03:00:00Z");
  await expect(page.getByRole("region", { name: "Next free slots" }).getByRole("listitem")).toContainText("09:00");
  await page.getByRole("button", { name: "Save queue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "A queue holds" })).toHaveText("A queue holds at most 50 times a week. Remove some and save again.");
});

test("add to queue sends queue: true without scheduled_at and shows the chosen time", async ({ page }) => {
  const state = await brain(page, { time_zone: "Europe/Berlin", slots: [{ weekday: 4, time: "09:00" }], next: ["2026-11-19T08:00:00Z"] });
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: {
        id: "p1", social_set_id: "s1", platform: "bluesky", body: "Queued", media: [], thread: [], status: "scheduled",
        scheduled_at: "2026-11-19T08:00:00Z", published_at: null, error: null, created_by: "u-me", created_at: "2026-11-18T10:00:00Z",
        updated_at: "2026-11-18T10:00:00Z", targets: [], lists: [], group_id: null,
      },
    });
  });
  await page.goto("/posts/new");
  await page.getByLabel("Set", { exact: true }).selectOption("s1");
  await expect.poll(() => state.gets.some((u) => u.endsWith("/v1/social-sets/s1/queue"))).toBe(true);
  await page.getByLabel("Post", { exact: true }).fill("Queued");
  await expect(page.getByText(/^Next slot: Nov 19, 2026/)).toBeVisible();
  await page.getByRole("button", { name: "Add to queue" }).click();
  await expect(page.getByText(/^Added to the queue for Nov 19, 2026, 9:00/).last()).toBeFocused();
  await expect(page).toHaveURL("/t/acme22/posts/p1");
  expect(sent).toEqual({ social_set_id: "s1", platform: "bluesky", body: "Queued", media: [], thread: [], queue: true });
  // A saved post edits alone and can't move to the queue.
  await expect(page.getByRole("button", { name: "Add to queue" })).toHaveCount(0);
});

test("add to queue is off with a link to the queue page when the set has no times", async ({ page }) => {
  await brain(page);
  await page.goto("/posts/new");
  const button = page.getByRole("button", { name: "Add to queue" });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(/No queue times for this set/);
  await page.getByRole("link", { name: "Set up the queue" }).click();
  await expect(page).toHaveURL("/t/acme22/queue");
});

test("brain's queue_empty is explained", async ({ page }) => {
  await brain(page, { time_zone: "UTC", slots: [{ weekday: 1, time: "09:00" }], next: [] });
  await page.route("**/v1/posts", (route) => route.fulfill({ status: 422, json: { error: "queue_empty" } }));
  await page.goto("/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Queued");
  await page.getByRole("button", { name: "Add to queue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This set's queue has no times yet." })).toBeVisible();
});
