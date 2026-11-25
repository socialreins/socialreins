import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { forgetRetired } from "@/lib/slug-redirect";

// brain answers 404 to every address: none was given up.
beforeEach(() => {
  forgetRetired();
  vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
});
afterEach(() => vi.unstubAllGlobals());

describe("proxy CSP", () => {
  it("allows Cloudflare Turnstile's script and frame, and brain in connect-src", async () => {
    const csp = (await proxy(new NextRequest("https://socialreins.com/"))).headers.get("Content-Security-Policy")!;
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/connect-src 'self' https?:\/\//);
  });

  it("lets only a public post page and the team pages (media library, composer) load images from any https host", async () => {
    const img = async (path: string) => (await proxy(new NextRequest(`https://socialreins.com${path}`))).headers.get("Content-Security-Policy")!.match(/img-src [^;]*/)![0];
    for (const path of ["/p/abcdefghjk", "/t/acme22/library", "/t/acme22/posts/new", "/t/acme22/home"]) expect(await img(path)).toBe("img-src 'self' data: https:");
    for (const path of ["/", "/pricing", "/post-types", "/privacy", "/profile", "/admin", "/login"]) expect(await img(path)).not.toMatch(/https:($| )/);
  });
});

describe("Google Analytics", () => {
  it("allows Google's script and hits only when GA_MEASUREMENT_ID is set", async () => {
    const { proxy: p } = await import("@/proxy");
    const csp = async () => (await p(new NextRequest("https://socialreins.com/"))).headers.get("Content-Security-Policy")!;
    delete process.env.GA_MEASUREMENT_ID;
    expect(await csp()).not.toContain("googletagmanager");
    process.env.GA_MEASUREMENT_ID = "G-ABC123XYZ9";
    expect(await csp()).toMatch(/script-src [^;]*https:\/\/www\.googletagmanager\.com/);
    expect(await csp()).toMatch(/connect-src [^;]*https:\/\/\*\.google-analytics\.com/);
    delete process.env.GA_MEASUREMENT_ID;
  });
});

describe("addresses a team gave up", () => {
  const asks: string[] = [];
  const answer = (status: number, body?: unknown) => {
    vi.stubGlobal("fetch", async (url: string) => {
      asks.push(url);
      return body === undefined ? new Response(null, { status }) : Response.json(body, { status });
    });
  };

  it("redirects /t/<old>/... permanently to /t/<new>/..., keeping the path and the query", async () => {
    asks.length = 0;
    answer(200, { address: "acme-new" });
    const res = await proxy(new NextRequest("https://socialreins.com/t/acme-old/posts/12?status=draft&x=1"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://socialreins.com/t/acme-new/posts/12?status=draft&x=1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(asks).toEqual(["http://localhost:8080/v1/public/team-slugs/acme-old"]);
  });

  it("leaves a current address, a code, the placeholder and other pages alone, and asks brain only for what could be an address", async () => {
    asks.length = 0;
    answer(404);
    for (const path of ["/t/acme-now/posts", "/t/_/posts", "/t/ab/posts", "/pricing", "/"]) {
      const res = await proxy(new NextRequest(`https://socialreins.com${path}`));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
    }
    expect(asks).toEqual(["http://localhost:8080/v1/public/team-slugs/acme-now"]);
  });

  it("shows the page as usual when brain is down or answers an error", async () => {
    for (const make of [() => vi.stubGlobal("fetch", async () => Promise.reject(new Error("down"))), () => answer(500), () => answer(429)]) {
      forgetRetired();
      make();
      expect((await proxy(new NextRequest("https://socialreins.com/t/acme-old/posts"))).status).toBe(200);
    }
  });
});
