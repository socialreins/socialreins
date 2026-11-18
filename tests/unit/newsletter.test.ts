import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribe, subscribersCsv, verifyNewsletter, type Subscriber } from "@/lib/newsletter";
import { apiUrl } from "@/lib/waitlist";

afterEach(() => vi.unstubAllGlobals());

const row = (email: string, confirmed = true): Subscriber => ({ id: email, email, confirmed, subscribed_at: "2026-11-18T10:00:00Z" });

describe("subscribersCsv", () => {
  it("lists only confirmed emails, with a header and CRLF rows", () => {
    expect(subscribersCsv([row("a@b.co"), row("c@d.co", false)])).toBe("email,subscribed_at\r\na@b.co,2026-11-18T10:00:00Z\r\n");
  });

  it("quotes commas and quotes, and defuses a value a spreadsheet would run as a formula", () => {
    const csv = subscribersCsv([row("=cmd@b.co"), row('a"b,c@d.co')]);
    expect(csv).toContain("'=cmd@b.co,");
    expect(subscribersCsv([row("-news@b.co"), row("+tag@b.co")])).toContain("\r\n-news@b.co,");
    expect(subscribersCsv([row("-1+1|cmd@b.co")])).toContain("'-1+1|cmd@b.co,");
    expect(csv).toContain('"a""b,c@d.co",');
  });

  it("is only the header with nobody confirmed", () => {
    expect(subscribersCsv([row("a@b.co", false)])).toBe("email,subscribed_at\r\n");
  });
});

describe("subscribe", () => {
  it("posts the email to the page's address and maps brain's answers", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await subscribe("abc", "a@b.co")).toBe("ok");
    expect(fetch.mock.calls[0][0]).toBe(`${apiUrl}/v1/public/pages/abc/subscribe`);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: "a@b.co" });
    for (const [status, result] of [[422, "invalid"], [404, "gone"], [429, "rate_limited"], [500, "error"]] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
      expect(await subscribe("abc", "a@b.co")).toBe(result);
    }
  });
});

describe("verifyNewsletter", () => {
  it("never calls brain without a token, and returns the team name on success", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "verified", team: "Acme" }));
    vi.stubGlobal("fetch", fetch);
    expect(await verifyNewsletter("")).toBe("invalid");
    expect(fetch).not.toHaveBeenCalled();
    expect(await verifyNewsletter("ab12")).toEqual({ team: "Acme" });
    expect(fetch.mock.calls[0][0]).toBe(`${apiUrl}/v1/public/newsletter/verify`);
  });

  it("maps a bad link and a rate limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 422 })));
    expect(await verifyNewsletter("x")).toBe("invalid");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    expect(await verifyNewsletter("x")).toBe("rate_limited");
  });
});
