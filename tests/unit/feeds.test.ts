import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFeed, createFeed, deleteFeed, feedField, feedHost, feedInput, feedPlatforms, feedText, fillTemplate, listFeeds, modeSummary, updateFeed, type Feed } from "@/lib/feeds";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];
const feed: Feed = {
  id: "f1",
  url: "https://example.com/feed.xml",
  social_set_id: "d",
  platforms: ["bluesky"],
  template: "{title}\n{link}",
  mode: "draft",
  active: true,
  last_checked_at: null,
  last_error: null,
  items_posted: 0,
  created_at: "2026-11-01T10:00:00Z",
};

const input = { url: feed.url, social_set_id: "d", platforms: ["bluesky"], template: feed.template, mode: feed.mode };

afterEach(() => vi.unstubAllGlobals());

describe("feed requests", () => {
  it("lists, creates, replaces, checks and deletes", async () => {
    let fetch = reply(200, [feed]);
    vi.stubGlobal("fetch", fetch);
    expect(await listFeeds()).toEqual([feed]);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/feeds`);

    fetch = reply(201, feed);
    vi.stubGlobal("fetch", fetch);
    expect(await createFeed(input)).toEqual(feed);
    expect(call(fetch)[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(call(fetch)[1].body as string)).toEqual(input);

    fetch = reply(200, { ...feed, active: false });
    vi.stubGlobal("fetch", fetch);
    expect(await updateFeed("f/1", { ...input, active: false })).toMatchObject({ active: false });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/feeds/f%2F1`);
    expect(call(fetch)[1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(call(fetch)[1].body as string)).toEqual({ ...input, active: false });

    fetch = reply(200, feed);
    vi.stubGlobal("fetch", fetch);
    expect(await checkFeed("f1")).toEqual(feed);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/feeds/f1/check`);
    expect(call(fetch)[1]).toMatchObject({ method: "POST" });

    vi.stubGlobal("fetch", reply(204));
    expect(await deleteFeed("f1")).toBe("ok");
    expect(feedInput(feed)).toEqual({ ...input, active: true });
  });

  it("keeps what brain adds to a refusal", async () => {
    vi.stubGlobal("fetch", reply(422, { error: "invalid_feed", field: "template" }));
    expect(await createFeed(input)).toEqual({ code: "invalid_feed", field: "template" });
    vi.stubGlobal("fetch", reply(422, { error: "platform_not_supported", platform: "tiktok" }));
    expect(await createFeed(input)).toEqual({ code: "platform_not_supported", platform: "tiktok" });
    vi.stubGlobal("fetch", reply(422, { error: "feed_unreadable", reason: "HTTP 404" }));
    expect(await createFeed(input)).toEqual({ code: "feed_unreadable", reason: "HTTP 404" });
    vi.stubGlobal("fetch", reply(429, { error: "checked_recently" }));
    expect(await checkFeed("f1")).toEqual({ code: "checked_recently" });
    vi.stubGlobal("fetch", reply(429));
    expect(await checkFeed("f1")).toEqual({ code: "rate_limited" });
  });
});

describe("feed refusals in plain words", () => {
  it("puts each refusal on its field", () => {
    expect(feedField({ code: "invalid_feed", field: "url" })).toBe("url");
    expect(feedField({ code: "invalid_feed", field: "social_set_id" })).toBe("set");
    expect(feedField({ code: "invalid_feed", field: "platforms" })).toBe("platforms");
    expect(feedField({ code: "invalid_feed", field: "template" })).toBe("template");
    expect(feedField({ code: "invalid_feed", field: "mode" })).toBe("mode");
    expect(feedField({ code: "invalid_feed", field: "other" })).toBeNull();
    expect(feedField({ code: "feed_unreadable", reason: "timed out" })).toBe("url");
    expect(feedField({ code: "platform_not_supported", platform: "youtube" })).toBe("platforms");
    expect(feedField({ code: "too_many_feeds" })).toBeNull();
  });

  it("words them", () => {
    expect(feedText({ code: "invalid_feed", field: "url" })).toContain("public https link");
    expect(feedText({ code: "invalid_feed", field: "template" })).toContain("2000 characters");
    expect(feedText({ code: "invalid_feed" })).toContain("isn't valid");
    expect(feedText({ code: "feed_unreadable", reason: "HTTP 404" })).toBe("That feed couldn't be read (HTTP 404). Check that the link opens an RSS or Atom feed.");
    expect(feedText({ code: "feed_unreadable" })).toBe("That feed couldn't be read. Check that the link opens an RSS or Atom feed.");
    expect(feedText({ code: "platform_not_supported", platform: "tiktok" }, () => "TikTok")).toContain("can't post to TikTok");
    expect(feedText({ code: "too_many_feeds" })).toContain("20 feeds");
    expect(feedText({ code: "checked_recently" })).toContain("less than a minute ago");
    expect(feedText({ code: "forbidden" })).toContain("owners and admins");
    expect(feedText({ code: "timeout" })).toBeNull();
  });
});

describe("feed helpers", () => {
  it("fills the template for the preview", () => {
    const item = { title: "Hello", link: "https://example.com/a", summary: "A short one." };
    expect(fillTemplate("{title}\n{link}", item)).toBe("Hello\nhttps://example.com/a");
    expect(fillTemplate("New: {title} ({title}) {summary} {other} {Title}", item)).toBe("New: Hello (Hello) A short one. {other} {Title}");
    // A title holding a placeholder is not filled a second time.
    expect(fillTemplate("{title} {link}", { ...item, title: "{link}" })).toBe("{link} https://example.com/a");
    expect(fillTemplate("{title}")).toBe("Five ways to plan a week of posts");
  });

  it("offers the set's networks without TikTok, YouTube and Pinterest", () => {
    const accounts = [
      { provider: "x", set_ids: ["d", "s1"] },
      { provider: "bluesky", set_ids: ["d"] },
      { provider: "bluesky", set_ids: ["d"] },
      { provider: "tiktok", set_ids: ["d"] },
      { provider: "youtube", set_ids: ["d", "s1"] },
      { provider: "pinterest", set_ids: ["d", "s1"] },
    ];
    const order = ["instagram", "bluesky", "x", "tiktok", "youtube", "pinterest"];
    expect(feedPlatforms("d", accounts, order)).toEqual(["bluesky", "x"]);
    expect(feedPlatforms("s1", accounts, order)).toEqual(["x"]);
    expect(feedPlatforms("s2", accounts, order)).toEqual([]);
  });

  it("names the mode and splits the address", () => {
    expect(modeSummary("draft")).toBe("Saves a draft");
    expect(modeSummary("queue")).toBe("Adds to the queue");
    expect(modeSummary("now")).toBe("Posts right away");
    expect(feedHost("https://blog.example.com/feed.xml?x=1")).toEqual(["blog.example.com", "/feed.xml?x=1"]);
    expect(feedHost("https://example.com/")).toEqual(["example.com", ""]);
    expect(feedHost("nope")).toEqual(["nope", ""]);
  });
});
