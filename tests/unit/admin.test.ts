import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approvalText,
  MAX_STORAGE_BYTES,
  parseStorageBytes,
  setStorageBudget,
  inviteSignups,
  invitedText,
  previewInvites,
  previewNote,
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
    expect(waitlistQuery(false, "", true)).toBe("?verified=false&hide_stale=true");
  });

  it("says what happened to the approval email", () => {
    const signup = { id: "w1", email: "a@example.com", source: null, created_at: "", verified_at: null, approved_at: "" };
    expect(approvalText({ signup, mail: "sent" })).toMatch(/email .* was sent\. This email was not verified\.$/);
    const verified = { ...signup, verified_at: "2026-11-01T00:00:00Z" };
    expect(approvalText({ signup: verified, mail: "sent" })).not.toMatch(/not verified/);
    expect(approvalText({ signup, mail: "already_approved" })).toMatch(/already approved/);
    expect(approvalText({ signup, mail: "failed" })).toMatch(/can sign up, but the email could not be sent.*another way/);
  });
});

describe("admin waitlist invites", () => {
  it("previews with the count and invites by id, as brain takes them", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ eligible: 3, left_today: 100, selected: [] })).mockResolvedValueOnce(Response.json({ sent: 2, failed: 0, capped: 0, skipped: 0, unsure: 0 }));
    vi.stubGlobal("fetch", fetch);
    expect(await previewInvites(2)).toEqual({ eligible: 3, left_today: 100, selected: [] });
    expect(fetch).toHaveBeenLastCalledWith(`${apiUrl}/v1/admin/waitlist-invites?count=2`, expect.objectContaining({ credentials: "include" }));
    expect(await inviteSignups(["a", "b"])).toEqual({ sent: 2, failed: 0, capped: 0, skipped: 0, unsure: 0 });
    const [url, init] = fetch.mock.lastCall!;
    expect(url).toBe(`${apiUrl}/v1/admin/waitlist-invites`);
    expect(init).toEqual(expect.objectContaining({ method: "POST", body: JSON.stringify({ ids: ["a", "b"] }) }));
  });

  it("maps a stale sign-in to the failure the page explains", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "reauth_required" }, { status: 403 })));
    expect(await inviteSignups(["a"])).toBe("reauth_required");
  });

  it("says why a preview has nobody to invite, so Preview does not look dead", () => {
    expect(previewNote({ eligible: 0, left_today: 100, selected: [] })).toMatch(/No verified signups are waiting/);
    expect(previewNote({ eligible: 3, left_today: 0, selected: [] })).toMatch(/No invite emails are left today/);
    expect(previewNote({ eligible: 3, left_today: 10, selected: [] })).toBeNull();
  });

  it("says what happened to each kind of signup, and only what happened", () => {
    expect(invitedText({ sent: 1, failed: 0, capped: 0, skipped: 0, unsure: 0 })).toBe("Invited 1 person.");
    expect(invitedText({ sent: 5, failed: 0, capped: 0, skipped: 0, unsure: 0 })).toBe("Invited 5 people.");
    expect(invitedText({ sent: 0, failed: 0, capped: 0, skipped: 2, unsure: 0 })).toBe("Invited 0 people. 2 had been invited already, so no second email went out.");
    expect(invitedText({ sent: 0, failed: 1, capped: 2, skipped: 0, unsure: 0 })).toMatch(/2 must wait.*1 could not be emailed/);
    expect(invitedText({ sent: 0, failed: 0, capped: 0, skipped: 0, unsure: 2 })).toMatch(/2 may not have got the email.*another way/);
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
    // Too big to hold exactly: brain would answer 422.
    expect(page(`limit=${"9".repeat(30)}&offset=${"9".repeat(30)}`)).toEqual({ q: "", limit: 50, offset: 0 });
    expect(page("offset=9007199254740992")).toEqual({ q: "", limit: 50, offset: 0 });
    expect(page("offset=9007199254740991").offset).toBe(Number.MAX_SAFE_INTEGER);
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
    // Past the end, Previous goes straight to the last page with rows.
    expect(previousPage({ ...p, offset: 500 }, 120)).toEqual({ q: "x", limit: 50, offset: 100 });
    expect(previousPage({ ...p, offset: 500 }, 100)).toEqual({ q: "x", limit: 50, offset: 50 });
    expect(previousPage({ ...p, offset: 500 }, 0)).toEqual({ q: "x", limit: 50, offset: 0 });
    expect(previousPage({ ...p, offset: 100 }, 120)).toEqual({ q: "x", limit: 50, offset: 50 });
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

describe("admin team upload storage", () => {
  it("reads the budget box: blank is the default, digits are bytes, 0 is unlimited", () => {
    expect(parseStorageBytes("")).toBeNull();
    expect(parseStorageBytes("   ")).toBeNull();
    expect(parseStorageBytes("0")).toBe(0);
    expect(parseStorageBytes(" 5368709120 ")).toBe(5368709120);
    expect(parseStorageBytes(String(MAX_STORAGE_BYTES))).toBe(MAX_STORAGE_BYTES);
    // Anything brain would answer 422 to is refused here, before the call.
    for (const bad of ["-1", String(MAX_STORAGE_BYTES + 1), "5 GB", "1.5", "0x10", "9007199254740992"]) {
      expect(parseStorageBytes(bad)).toBe("invalid");
    }
  });

  it("sets a team's own budget, or clears it", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ used: 64, budget: 200_000_000 }));
    vi.stubGlobal("fetch", fetch);
    expect(await setStorageBudget("t1", 200_000_000)).toEqual({ used: 64, budget: 200_000_000 });
    expect(fetch).toHaveBeenLastCalledWith(
      `${apiUrl}/v1/admin/teams/t1/storage-budget`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ bytes: 200_000_000 }) }),
    );
    await setStorageBudget("t1", null);
    expect(fetch).toHaveBeenLastCalledWith(
      `${apiUrl}/v1/admin/teams/t1/storage-budget`,
      expect.objectContaining({ body: JSON.stringify({ bytes: null }) }),
    );
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
