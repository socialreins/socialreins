import { afterEach, describe, expect, it, vi } from "vitest";
import { listWaitlist, parseVerified } from "@/lib/admin";
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
