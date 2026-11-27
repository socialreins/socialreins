import { expect, test } from "@playwright/test";

const where = (res: { headers(): Record<string, string> }) => new URL(res.headers().location, "http://localhost:3000");

test("/app/<page> still redirects to /<page>, keeping the rest and the query", async ({ request }) => {
  for (const [from, to] of [
    ["/app/connections", "/connections"],
    ["/app/posts/12?status=draft", "/posts/12?status=draft"],
    ["/app/team/members", "/team/members"],
    ["/app/profile", "/profile"],
  ]) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(308);
    const url = where(res);
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname + url.search).toBe(to);
  }
});

// An encoded or doubled slash after /app/ must never lead a redirect to another site.
test("/app/ followed by slashes in any form never redirects off site", async ({ request }) => {
  for (const tail of ["%2F%2Fevil.example", "%5C%5Cevil.example", "%2Fevil.example", "/evil.example", "//evil.example", "%2f%2fevil.example%2fx", "..%2F..%2Fevil.example", "%252F%252Fevil.example", "%09%2Fevil.example"]) {
    const res = await request.get(`/app/${tail}`, { maxRedirects: 0 });
    const location = res.headers().location;
    if (location) expect(where(res).origin, `${tail} -> ${location}`).toBe("http://localhost:3000");
    // Nothing the browser would read as a protocol-relative address either.
    if (location) expect(location, tail).not.toMatch(/^[/\\]{2}/);
  }
});

test("pages carry a Permissions-Policy that turns off the camera, microphone and location", async ({ request }) => {
  const res = await request.get("/pricing");
  expect(res.headers()["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
});
