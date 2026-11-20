import { afterEach, describe, expect, it, vi } from "vitest";
import { draftProblem, length, linkCount, MAX_BODY, MAX_LINKS, MAX_SUBJECT, newsletterText, reachable, renderBody, subscribe, subscribersCsv, unsubscribe, verifyNewsletter, type Subscriber } from "@/lib/newsletter";
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

  it("leaves out everyone who unsubscribed", () => {
    const gone = { ...row("gone@b.co"), unsubscribed_at: "2026-11-19T10:00:00Z" };
    expect(reachable(gone)).toBe(false);
    expect(reachable({ ...row("a@b.co"), unsubscribed_at: null })).toBe(true);
    expect(subscribersCsv([row("a@b.co"), gone])).toBe("email,subscribed_at\r\na@b.co,2026-11-18T10:00:00Z\r\n");
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

describe("unsubscribe", () => {
  it("posts the token and says ok for any 200", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetch);
    expect(await unsubscribe("tok")).toBe("ok");
    expect(fetch.mock.calls[0][0]).toBe(`${apiUrl}/v1/public/newsletter/unsubscribe`);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ token: "tok" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    expect(await unsubscribe("tok")).toBe("rate_limited");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    expect(await unsubscribe("tok")).toBe("error");
  });
});

describe("renderBody", () => {
  const text = (body: string) => renderBody(body).map((p) => p.map((x) => x.text).join(""));
  const links = (body: string) => renderBody(body).flat().filter((p) => p.href).map((p) => p.href);

  it("starts a paragraph at a blank line and keeps single line breaks inside one", () => {
    expect(text("One\nstill one\n\nTwo\r\n\r\n \n\nThree")).toEqual(["One\nstill one", "Two", "Three"]);
    expect(renderBody("  \n\n ")).toEqual([]);
  });

  it("keeps HTML as text: no piece is ever markup", () => {
    const body = '<script>alert(1)</script> <a href="https://evil.example">x</a> <b>b</b> &amp;';
    expect(text(body)).toEqual([body]);
    // The link inside the attribute is a link to that same address and nothing more.
    expect(renderBody(body).flat().every((p) => Object.keys(p).every((k) => ["text", "bold", "href"].includes(k)))).toBe(true);
    expect(links(body)).toEqual(["https://evil.example"]);
  });

  it("makes **bold** bold, on one line only", () => {
    expect(renderBody("a **b** c")).toEqual([[{ text: "a " }, { text: "b", bold: true }, { text: " c" }]]);
    expect(renderBody("a **b\nc** d")).toEqual([[{ text: "a **b\nc** d" }]]);
    expect(renderBody("**see https://a.example/x**")).toEqual([[{ text: "see ", bold: true }, { text: "https://a.example/x", bold: true, href: "https://a.example/x" }]]);
  });

  it("links bare https addresses only", () => {
    expect(renderBody("Read https://a.example/p?q=1. Bye")).toEqual([[{ text: "Read " }, { text: "https://a.example/p?q=1", href: "https://a.example/p?q=1" }, { text: ". Bye" }]]);
    expect(links("http://a.example javascript:alert(1) data:text/html,x mailto:a@b.co www.a.example ftp://a.example https:// xhttps://a.example")).toEqual([]);
    expect(links("(https://a.example/x), https://b.example!")).toEqual(["https://a.example/x", "https://b.example"]);
    for (const href of links("javascript:https://a.example https://b.example/\"onmouseover=x")) expect(href).toMatch(/^https:\/\/[^"'<>\s]+$/);
  });
});

describe("newsletter counters", () => {
  it("counts trimmed code points and links", () => {
    expect(length("  héllo 👋  ")).toBe(7);
    expect(linkCount("https://a.example and https://b.example\n\nhttp://c.example")).toBe(2);
  });

  it("names the field brain would refuse", () => {
    expect(draftProblem("Hi", "Body")).toBeNull();
    expect(draftProblem(" ", "Body")).toBe("subject");
    expect(draftProblem("a".repeat(MAX_SUBJECT), "Body")).toBeNull();
    expect(draftProblem("a".repeat(MAX_SUBJECT + 1), "Body")).toBe("subject");
    expect(draftProblem("two\nlines", "Body")).toBe("subject");
    expect(draftProblem("Hi", "  ")).toBe("body");
    expect(draftProblem("Hi", "a".repeat(MAX_BODY))).toBeNull();
    expect(draftProblem("Hi", "a".repeat(MAX_BODY + 1))).toBe("body");
    expect(draftProblem("Hi", Array.from({ length: MAX_LINKS }, (_, i) => `https://a.example/${i}`).join(" "))).toBeNull();
    expect(draftProblem("Hi", Array.from({ length: MAX_LINKS + 1 }, (_, i) => `https://a.example/${i}`).join(" "))).toBe("links");
  });

  it("words every code of the contract", () => {
    for (const code of ["invalid_newsletter", "invalid_sender", "sender_required", "test_required", "no_recipients", "audience_changed", "too_many_newsletters", "too_many_recipients", "already_started"] as const)
      expect(newsletterText(code), code).toBeTruthy();
    expect(newsletterText("invalid_sender", "address")).toMatch(/10 to 300/);
    expect(newsletterText("invalid_newsletter", "subject")).toMatch(/1 to 150/);
    expect(newsletterText("error")).toBeNull();
  });
});
