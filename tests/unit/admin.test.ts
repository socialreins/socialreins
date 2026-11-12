import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approvalText,
  listUsers,
  listWaitlist,
  nextPage,
  pageQuery,
  parseDomains,
  parsePage,
  parseVerified,
  previousPage,
  saveSignupSettings,
  showing,
  waitlistQuery,
} from "@/lib/admin";
import { apiUrl } from "@/lib/waitlist";

afterEach(() => vi.unstubAllGlobals());

describe("admin waitlist", () => {
  it("reads ?verified= as brain takes it", () => {
    expect(parseVerified("true")).toBe(true);
    expect(parseVerified("false")).toBe(false);
    expect(parseVerified(null)).toBeNull();
    expect(parseVerified("yes")).toBeNull();
  });

  it.each([
    [null, "/v1/admin/waitlist"],
    [true, "/v1/admin/waitlist?verified=true"],
    [false, "/v1/admin/waitlist?verified=false"],
  ])("asks for verified=%s", async (verified, path) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ total: 0, verified: 0, signups: [] }));
    vi.stubGlobal("fetch", fetch);
    expect(await listWaitlist(verified)).toEqual({ total: 0, verified: 0, signups: [] });
    expect(fetch).toHaveBeenCalledWith(`${apiUrl}${path}`, expect.objectContaining({ credentials: "include" }));
  });

  it.each([
    [403, "forbidden", "forbidden"],
    [401, "unauthorized", "signed_out"],
  ])("maps %i %s to %s", async (status, error, result) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error }, { status })));
    expect(await listWaitlist(null)).toBe(result);
  });
});

describe("admin waitlist search and approval", () => {
  it("builds ?verified=&q= without empty parts", () => {
    expect(waitlistQuery(null)).toBe("");
    expect(waitlistQuery(true, "  ")).toBe("?verified=true");
    expect(waitlistQuery(false, " a+b@x.com ")).toBe("?verified=false&q=a%2Bb%40x.com");
    expect(waitlistQuery(null, "acme")).toBe("?q=acme");
  });

  it("says what happened to the approval email", () => {
    const signup = { id: "w1", email: "a@example.com", source: null, created_at: "", verified_at: null, approved_at: "" };
    expect(approvalText({ signup, mail: "sent" })).toMatch(/email .* was sent/);
    expect(approvalText({ signup, mail: "already_approved" })).toMatch(/already approved/);
    expect(approvalText({ signup, mail: "failed" })).toMatch(/can sign up, but the email could not be sent.*another way/);
  });
});

describe("admin list pages", () => {
  const page = (query: string) => parsePage(new URLSearchParams(query));

  it("reads ?q=&limit=&offset= within what brain accepts", () => {
    expect(page("")).toEqual({ q: "", limit: 50, offset: 0 });
    expect(page("q=%20ada%20&limit=20&offset=40")).toEqual({ q: "ada", limit: 20, offset: 40 });
    expect(page("limit=0&offset=-5")).toEqual({ q: "", limit: 50, offset: 0 });
    expect(page("limit=201&offset=1.5")).toEqual({ q: "", limit: 50, offset: 0 });
    expect(page("limit=abc&offset=x")).toEqual({ q: "", limit: 50, offset: 0 });
    expect(page(`q=${"a".repeat(300)}`).q).toHaveLength(200);
  });

  it("writes the query without defaults", () => {
    expect(pageQuery({ q: "", limit: 50, offset: 0 })).toBe("");
    expect(pageQuery({ q: "a b", limit: 20, offset: 40 })).toBe("?q=a+b&limit=20&offset=40");
    expect(pageQuery({ q: "", limit: 50, offset: 50 })).toBe("?offset=50");
  });

  it("steps to the previous and next page, or null at an end", () => {
    const p = { q: "x", limit: 50, offset: 50 };
    expect(previousPage(p)).toEqual({ q: "x", limit: 50, offset: 0 });
    expect(previousPage({ ...p, offset: 0 })).toBeNull();
    expect(previousPage({ ...p, offset: 20 })).toEqual({ q: "x", limit: 50, offset: 0 });
    expect(nextPage(p, 101)).toEqual({ q: "x", limit: 50, offset: 100 });
    expect(nextPage(p, 100)).toBeNull();
  });

  it("says which rows are showing", () => {
    expect(showing(0, 50, 1234)).toBe("Showing 1 to 50 of 1,234");
    expect(showing(50, 3, 53)).toBe("Showing 51 to 53 of 53");
    expect(showing(0, 0, 0)).toBe("Showing 0 of 0");
    expect(showing(100, 0, 53)).toBe("Showing 0 of 53");
  });

  it("asks brain for the page", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ total: 0, users: [] }));
    vi.stubGlobal("fetch", fetch);
    await listUsers({ q: "ada", limit: 50, offset: 100 });
    expect(fetch).toHaveBeenCalledWith(`${apiUrl}/v1/admin/users?q=ada&offset=100`, expect.objectContaining({ credentials: "include" }));
  });
});

describe("admin sign-up settings", () => {
  it("reads the domains box as a list", () => {
    expect(parseDomains("")).toEqual([]);
    expect(parseDomains(" Example.com,\n acme.io\n\nexample.com , Ada@Example.org ")).toEqual(["example.com", "acme.io", "ada@example.org"]);
  });

  it.each(["reauth_required", "invalid_mode", "invalid_domains"])("keeps brain's %s", async (error) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error }, { status: error === "reauth_required" ? 403 : 422 }));
    vi.stubGlobal("fetch", fetch);
    expect(await saveSignupSettings("domains", ["example.com"])).toBe(error);
    expect(fetch).toHaveBeenCalledWith(
      `${apiUrl}/v1/admin/settings/signup`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ mode: "domains", domains: ["example.com"] }) }),
    );
  });
});
