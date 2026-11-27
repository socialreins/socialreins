import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { permissionsPolicy } from "@/lib/security";
import { proxy } from "@/proxy";

const run = async (path = "/") => proxy(new NextRequest(`http://localhost:3000${path}`));

const nonceOf = (csp: string) => /script-src [^;]*'nonce-([^']+)'/.exec(csp)?.[1];

describe("proxy CSP", () => {
  it("allows Cloudflare Turnstile's script and frame, and brain in connect-src", async () => {
    const csp = (await run()).headers.get("Content-Security-Policy")!;
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/connect-src 'self' https?:\/\//);
  });

  it("gives every request a nonce and drops 'unsafe-inline' from script-src", async () => {
    const res = await run("/pricing");
    const a = res.headers.get("Content-Security-Policy")!;
    const b = (await run("/pricing")).headers.get("Content-Security-Policy")!;
    const scriptSrc = a.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
    // The layout reads this request header and puts the same value on its inline scripts.
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(a));
  });

  it("puts the same headers on a redirect as on a page", async () => {
    const res = await run("/app/connections?connected=x");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://localhost:3000/connections?connected=x");
    for (const key of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) expect(res.headers.get(key), key).toBeTruthy();
    expect(res.headers.get("Content-Security-Policy")).toMatch(/frame-ancestors 'none'/);
  });

  it("turns off the features the app does not use and keeps passkeys and the clipboard", async () => {
    expect(permissionsPolicy()).toContain("camera=()");
    expect(permissionsPolicy()).toContain("microphone=()");
    expect(permissionsPolicy()).toContain("geolocation=()");
    expect(permissionsPolicy()).toContain("payment=()");
    expect(permissionsPolicy()).toContain("publickey-credentials-get=(self)");
    expect(permissionsPolicy()).toContain("clipboard-write=(self)");
  });
});
