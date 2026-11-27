import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

// The web server asks brain (BRAIN_URL, :8080 in playwright.config.ts) where a team address that was given up leads now,
// from the server, so page.route cannot answer: this stands in for brain's GET /v1/public/team-slugs/<slug>.
const retired: Record<string, string> = { "old-acme": "acme", "older-acme": "acme", "dropped-co": "k7q2mf" };
let brain: Server;
let asked: string[] = [];

test.beforeAll(async () => {
  brain = createServer((req, res) => {
    const slug = decodeURIComponent((req.url ?? "").split("/").pop() ?? "");
    asked.push(slug);
    const address = retired[slug];
    res.writeHead(address ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(address ? { address } : { error: "not_found" }));
  });
  await new Promise<void>((done, fail) => brain.once("error", fail).listen(8080, done));
});
test.afterAll(() => new Promise((done) => brain.close(done)));

const where = (res: { headers(): Record<string, string> }) => {
  const to = new URL(res.headers().location, "http://localhost:3000");
  return to.pathname + to.search;
};

test("an old team address redirects permanently to the new one, keeping the page and the query", async ({ request }) => {
  const res = await request.get("/t/old-acme/posts/12?status=draft&x=1", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(where(res)).toBe("/t/acme/posts/12?status=draft&x=1");
  // A redirect answers with the same hardening headers as a page.
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(res.headers()["permissions-policy"]).toContain("camera=()");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  // The same address in capitals, and an address that led back to the team's code.
  const upper = await request.get("/t/OLDER-ACME/calendar", { maxRedirects: 0 });
  expect(upper.status()).toBe(308);
  expect(where(upper)).toBe("/t/acme/calendar");
  const code = await request.get("/t/dropped-co/inbox/i7?item=p1", { maxRedirects: 0 });
  expect(where(code)).toBe("/t/k7q2mf/inbox/i7?item=p1");
});

test("a current address, a code and other pages are not redirected, and the placeholder is not even asked about", async ({ request }) => {
  asked = [];
  // The web server remembers each answer for 15 seconds, so a fresh address is asked about every run, also on a server that stays up.
  const current = `acme-${Date.now().toString(36)}`;
  for (const path of [`/t/${current}/posts`, "/t/_/posts", "/pricing"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
  }
  // Other tests in this run may ask too, so look for what this one did and did not.
  expect(asked).toContain(current);
  expect(asked).not.toContain("_");
});

test("a visitor with an old link lands on the page in the new address", async ({ page }) => {
  const team = { id: "t1", name: "Acme", code: "acme22", slug: "acme", role: "owner" };
  await page.addInitScript(() => localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now())));
  await page.route("http://localhost:8080/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/me") return route.fulfill({ json: { id: "u", email: "me@example.com", name: "Me", username: null, current_team: team } });
    return route.fulfill({ json: path === "/v1/teams" ? [team] : [] });
  });
  await page.goto("/t/old-acme?x=1#top");
  await expect(page).toHaveURL("/t/acme/home?x=1#top");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
