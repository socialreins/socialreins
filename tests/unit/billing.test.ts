import { afterEach, describe, expect, it, vi } from "vitest";
import { failure } from "@/lib/auth";
import { getAiKey, getBilling, setAiKey } from "@/lib/billing";

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
