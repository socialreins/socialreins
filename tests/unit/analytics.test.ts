import { afterEach, describe, expect, it, vi } from "vitest";
import { compact, engagement, getAnalytics, hasStats, parseRange, postTotals, rangeDates, refreshMetrics, statWords } from "@/lib/analytics";
import { apiUrl } from "@/lib/waitlist";

afterEach(() => vi.unstubAllGlobals());
const m = (likes: number | null, comments: number | null, shares: number | null, views: number | null) => ({ likes, comments, shares, views, fetched_at: "2026-11-10T10:00:00Z" });
const post = (...metrics: (ReturnType<typeof m> | null)[]) => ({ targets: metrics.map((x) => ({ metrics: x })) }) as unknown as Parameters<typeof postTotals>[0][number];

describe("numbers", () => {
  it("shortens large numbers", () => {
    expect(compact(0)).toBe("0");
    expect(compact(999)).toBe("999");
    expect(compact(1234)).toBe("1.2K");
    expect(compact(15_000)).toBe("15K");
    expect(compact(2_500_000)).toBe("2.5M");
  });

  it("sums the accounts' numbers and keeps null where no network gives one", () => {
    expect(postTotals([post(null), { targets: [] }])).toBeNull();
    expect(postTotals([post(m(3, 1, 2, null)), post(m(4, 0, null, null), null)])).toEqual({ likes: 7, comments: 1, shares: 2, views: null });
    expect(postTotals([post(m(1, 1, null, 900))])).toEqual({ likes: 1, comments: 1, shares: null, views: 900 });
  });

  it("words only the numbers a network gives", () => {
    expect(statWords({ likes: 1200, comments: 1, shares: null, views: 0 })).toBe("1.2K likes, 1 comment, 0 views");
    expect(statWords({ likes: 5, comments: 2, shares: 9, views: 9 }, ["likes", "comments"])).toBe("5 likes, 2 comments");
    expect(statWords({ likes: null, comments: null, shares: null, views: null })).toBe("");
    expect(engagement({ likes: 5, comments: null, shares: 2, views: 100 })).toBe(7);
  });

  it("knows which networks have stats", () => {
    expect(["bluesky", "facebook", "instagram", "youtube"].every(hasStats)).toBe(true);
    expect(["threads", "linkedin", "x", "tiktok"].some(hasStats)).toBe(false);
  });
});

describe("requests", () => {
  it("reads the range from the address, 30 days by default", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("90")).toBe(90);
    expect(parseRange(null)).toBe(30);
    expect(parseRange("365")).toBe(30);
    expect(rangeDates(7, Date.parse("2026-11-10T12:00:00Z"))).toEqual({ from: "2026-11-04", to: "2026-11-10" });
  });

  it("asks brain for the set and the dates, and refreshes one post", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "refreshed_recently" }), { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await getAnalytics("s1", 30, Date.parse("2026-11-10T12:00:00Z"));
    await getAnalytics("", 7, Date.parse("2026-11-10T12:00:00Z"));
    expect(await refreshMetrics("p 1")).toBe("refreshed_recently");
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map((c) => c[0].replace(apiUrl, ""))).toEqual([
      "/v1/analytics?social_set_id=s1&from=2026-10-12&to=2026-11-10",
      "/v1/analytics?from=2026-11-04&to=2026-11-10",
      "/v1/posts/p%201/metrics/refresh",
    ]);
    expect(calls[2]![1].method).toBe("POST");
  });
});
