import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy CSP", () => {
  it("allows Cloudflare Turnstile's script and frame, and brain in connect-src", () => {
    const csp = proxy(new NextRequest("https://socialreins.com/")).headers.get("Content-Security-Policy")!;
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/connect-src 'self' https?:\/\//);
  });

  it("lets only a public post page load images from any https host", () => {
    const img = (path: string) => proxy(new NextRequest(`https://socialreins.com${path}`)).headers.get("Content-Security-Policy")!.match(/img-src [^;]*/)![0];
    expect(img("/p/abcdefghjk")).toBe("img-src 'self' data: https:");
    for (const path of ["/", "/pricing", "/post-types", "/privacy"]) expect(img(path)).not.toMatch(/https:($| )/);
  });
});

describe("Google Analytics", () => {
  it("allows Google's script and hits only when GA_MEASUREMENT_ID is set", async () => {
    const { proxy: p } = await import("@/proxy");
    const csp = () => p(new NextRequest("https://socialreins.com/")).headers.get("Content-Security-Policy")!;
    delete process.env.GA_MEASUREMENT_ID;
    expect(csp()).not.toContain("googletagmanager");
    process.env.GA_MEASUREMENT_ID = "G-ABC123XYZ9";
    expect(csp()).toMatch(/script-src [^;]*https:\/\/www\.googletagmanager\.com/);
    expect(csp()).toMatch(/connect-src [^;]*https:\/\/\*\.google-analytics\.com/);
    delete process.env.GA_MEASUREMENT_ID;
  });
});
