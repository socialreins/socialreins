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
