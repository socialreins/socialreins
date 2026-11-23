import { afterEach, describe, expect, it, vi } from "vitest";
import { failure } from "@/lib/auth";
import { getAiKey, getBilling, openPortal, setAiKey, startCheckout, stripeUrl } from "@/lib/billing";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));

afterEach(() => vi.unstubAllGlobals());

describe("plan limit answers", () => {
  it("name the limit", async () => {
    for (const limit of ["accounts", "members", "automation"])
      expect(await failure(Response.json({ error: "plan_limit", limit }, { status: 402 }))).toBe(`plan_limit_${limit}`);
  });
  it("fall back to a plain plan_limit for a limit this page doesn't know", async () => {
    expect(await failure(Response.json({ error: "plan_limit", limit: "contacts" }, { status: 402 }))).toBe("plan_limit");
  });
});

describe("billing requests", () => {
  it("reads the plan and the key's provider and last 4, and none as not_found", async () => {
    vi.stubGlobal("fetch", reply(200, { enabled: false }));
    expect(await getBilling()).toEqual({ enabled: false });
    vi.stubGlobal("fetch", reply(404, { error: "not_found" }));
    expect(await getAiKey()).toBe("not_found");
  });
  it("sends the provider and key, and maps invalid_key and reauth_required", async () => {
    const fetch = reply(422, { error: "invalid_key" });
    vi.stubGlobal("fetch", fetch);
    expect(await setAiKey("openai", "sk-x")).toBe("invalid_key");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/team\/ai-key$/);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ provider: "openai", key: "sk-x" });
    vi.stubGlobal("fetch", reply(403, { error: "reauth_required" }));
    expect(await setAiKey("openai", "sk-x")).toBe("reauth_required");
  });
});

describe("Stripe urls", () => {
  it("accepts only https on Stripe's checkout and billing hosts", () => {
    expect(stripeUrl("https://checkout.stripe.com/c/pay_1")).toBe("https://checkout.stripe.com/c/pay_1");
    expect(stripeUrl("https://billing.stripe.com/p/session/x")).toBe("https://billing.stripe.com/p/session/x");
    for (const bad of [
      "http://checkout.stripe.com/c/1",
      "https://stripe.com/c/1",
      "https://checkout.stripe.com.evil.example/c/1",
      "https://evil.example/checkout.stripe.com",
      "https://checkout.stripe.com:8443/c/1",
      "https://user@evil.example/",
      "javascript:alert(1)",
      "not a url",
      "",
      null,
      undefined,
      42,
    ])
      expect(stripeUrl(bad)).toBeNull();
  });

  it("checkout and portal turn a missing or foreign url into stripe_failed and keep brain's errors", async () => {
    vi.stubGlobal("fetch", reply(200, { url: "https://checkout.stripe.com/c/1" }));
    expect(await startCheckout("scheduler")).toEqual({ url: "https://checkout.stripe.com/c/1" });
    vi.stubGlobal("fetch", reply(200, { url: "https://evil.example/" }));
    expect(await openPortal()).toBe("stripe_failed");
    vi.stubGlobal("fetch", reply(200, {}));
    expect(await startCheckout("automation")).toBe("stripe_failed");
    vi.stubGlobal("fetch", reply(409, { error: "already_subscribed" }));
    expect(await startCheckout("scheduler")).toBe("already_subscribed");
    const sent = reply(200, { url: "https://checkout.stripe.com/c/2" });
    vi.stubGlobal("fetch", sent);
    await startCheckout("scheduler");
    await startCheckout("automation", "month");
    const bodies = sent.mock.calls.map((c: unknown[]) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies).toEqual([{ plan: "scheduler", interval: "year" }, { plan: "automation", interval: "month" }]);
  });
});
