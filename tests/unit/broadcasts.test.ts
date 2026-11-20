import { afterEach, describe, expect, it, vi } from "vitest";
import { breakdown, broadcastLength, broadcastText, example, isProblem, listRecipients, people, progress, reasonText, sendBroadcast, type Preview } from "@/lib/broadcasts";
import { TEAM_PAGES } from "@/lib/team-path";
import { apiUrl } from "@/lib/waitlist";

afterEach(() => vi.unstubAllGlobals());

const preview: Preview = {
  total: 20,
  reachable: 12,
  by_reason: { opted_out: 1, outside_window: 5, no_conversation: 0, account_disconnected: 2, recently_messaged: 0 },
  by_platform: [{ platform: "bluesky", reachable: 12 }],
  sample: [],
};

describe("the message", () => {
  it("counts each {name} as 64 characters, like brain", () => {
    expect(broadcastLength("Hi")).toBe(2);
    expect(broadcastLength("Hi {name}")).toBe(3 + 64);
    expect(broadcastLength("{name}{name}")).toBe(128);
    // Trimmed first, and counted by code points: an emoji is one.
    expect(broadcastLength("  Hi 😀  ")).toBe(4);
    expect(broadcastLength("{Name} {page}")).toBe(13);
    expect(broadcastLength(`${"x".repeat(936)}{name}`)).toBe(1000);
  });

  it("fills in the name, or there without one", () => {
    expect(example("Hi {name}, {name}!", "Sam")).toBe("Hi Sam, Sam!");
    expect(example("Hi {name}!", null)).toBe("Hi there!");
    expect(example("Hi {name}!", "  ")).toBe("Hi there!");
  });

  it("says person or people", () => {
    expect(people(1)).toBe("1 person");
    expect(people(0)).toBe("0 people");
    expect(people(12)).toBe("12 people");
  });
});

describe("reasons", () => {
  it("words every reason brain names", () => {
    for (const r of ["opted_out", "outside_window", "no_conversation", "account_disconnected", "recently_messaged", "untagged", "dm_not_allowed", "cancelled", "contact_gone", "too_long", "interrupted", "internal"]) {
      expect(reasonText(r), r).not.toContain("_");
      expect(reasonText(r), r).not.toContain("refused");
    }
    expect(reasonText("opted_out")).toBe("Opted out of broadcasts");
    expect(reasonText("dm_not_allowed")).toBe("Does not accept DMs");
    expect(reasonText("interrupted")).toBe("Cut off while sending, not tried again");
  });

  it("keeps a network's own refusal readable, and says nothing without a reason", () => {
    expect(reasonText("meta_failed")).toBe("The network refused it (meta failed)");
    expect(reasonText(null)).toBe("");
  });

  it("lists who a preview leaves out, biggest first and without the zeros", () => {
    expect(breakdown(preview).map((r) => [r.reason, r.count])).toEqual([
      ["outside_window", 5],
      ["account_disconnected", 2],
      ["opted_out", 1],
    ]);
    expect(breakdown(preview)[0].text).toContain("24 hours");
  });
});

describe("progress", () => {
  it("is null before anyone is counted", () => {
    expect(progress({ total: 0, sent: 0, skipped: 0, failed: 0, pending: 0 })).toBeNull();
  });

  it("shares the total between sent, skipped, failed and pending", () => {
    expect(progress({ total: 20, sent: 10, skipped: 4, failed: 1, pending: 5 })).toEqual({ sent: 50, skipped: 20, failed: 5, pending: 25, done: 75 });
  });

  it("is never done while someone waits, and never past the total", () => {
    expect(progress({ total: 1000, sent: 999, skipped: 0, failed: 0, pending: 1 })?.done).toBe(99);
    expect(progress({ total: 3, sent: 3, skipped: 0, failed: 0, pending: 0 })?.done).toBe(100);
    expect(progress({ total: 2, sent: 5, skipped: -1, failed: 0, pending: 0 })).toMatchObject({ sent: 100, skipped: 0 });
  });
});

describe("requests", () => {
  const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("sends the confirmed number and hands back the new preview when the audience changed", async () => {
    const fetch = answer(409, { error: "audience_changed", preview });
    vi.stubGlobal("fetch", fetch);
    const r = await sendBroadcast("b 1", 11);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${apiUrl}/v1/broadcasts/b%201/send`);
    expect(JSON.parse(init.body as string)).toEqual({ confirm_total: 11 });
    expect(isProblem(r) && r.code).toBe("audience_changed");
    expect(isProblem(r) && r.preview?.reachable).toBe(12);
  });

  it("asks for a page of recipients by status and cursor", async () => {
    const fetch = answer(200, { items: [], next_cursor: null });
    vi.stubGlobal("fetch", fetch);
    await listRecipients("b1");
    await listRecipients("b1", "failed", "c9");
    expect(fetch.mock.calls.map((c) => (c as unknown as [string])[0].replace(apiUrl, ""))).toEqual(["/v1/broadcasts/b1/recipients", "/v1/broadcasts/b1/recipients?status=failed&cursor=c9"]);
  });
});

describe("refusals", () => {
  it("words each code, and names the field of an invalid draft", () => {
    for (const code of ["already_started", "still_sending", "audience_changed", "another_sending", "no_recipients", "too_many_recipients", "too_many_broadcasts", "not_sending", "not_paused", "forbidden", "not_found"] as const) {
      expect(broadcastText(code), code).toBeTruthy();
    }
    expect(broadcastText("invalid_broadcast", "text")).toContain("1000");
    expect(broadcastText("invalid_broadcast", "tag")).toContain("tag");
    expect(broadcastText("invalid_broadcast")).toContain("isn't valid");
    expect(broadcastText("error")).toBeNull();
  });
});

it("broadcasts is a team page", () => {
  expect(TEAM_PAGES).toContain("broadcasts");
});
