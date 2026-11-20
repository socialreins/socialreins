import { afterEach, describe, expect, it, vi } from "vitest";
import { assignItem, chatRows, dayLabel, getConversation, listItems, maxFor, mergeFresh, messageCount, relativeTime, replyToItem, setItemState, threadKey, type Item } from "@/lib/inbox";
import { apiUrl } from "@/lib/waitlist";

const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("inbox requests", () => {
  it("pages items by state and cursor", async () => {
    const fetch = vi.fn(async () => Response.json({ items: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetch);
    await listItems("i 1", "done", "c9");
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/inboxes/i%201/items?state=done&group=conversations&cursor=c9`);
    await listItems("all", "open", null, "dm", "price list");
    expect((fetch.mock.calls[1] as unknown as [string])[0]).toBe(`${apiUrl}/v1/inboxes/all/items?state=open&group=conversations&kind=dm&q=price+list`);
  });

  it("patches the state", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "p1", state: "done" }));
    vi.stubGlobal("fetch", fetch);
    expect(await setItemState("p1", "done")).toEqual({ id: "p1", state: "done" });
    expect(call(fetch)[1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ state: "done" }) });
  });

  it("acts on a whole conversation only when asked to", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "p1", items: [], has_more: false }));
    vi.stubGlobal("fetch", fetch);
    const sent = (n: number) => fetch.mock.calls[n] as unknown as [string, RequestInit];
    await setItemState("p1", "done", true);
    expect(sent(0)[1].body).toBe(JSON.stringify({ state: "done", conversation: true }));
    await assignItem("p1", "u1", true);
    expect(sent(1)[1].body).toBe(JSON.stringify({ assigned_to: "u1", conversation: true }));
    await assignItem("p1", null);
    expect(sent(2)[1].body).toBe(JSON.stringify({ assigned_to: null }));
    await replyToItem("p1", "hi", true);
    expect(sent(3)[1].body).toBe(JSON.stringify({ text: "hi", conversation: true }));
    await replyToItem("p1", "hi");
    expect(sent(4)[1].body).toBe(JSON.stringify({ text: "hi" }));
    await getConversation("p 1");
    expect(sent(5)[0]).toBe(`${apiUrl}/v1/inbox-items/p%201/conversation`);
    await getConversation("p1", "p0");
    expect(sent(6)[0]).toBe(`${apiUrl}/v1/inbox-items/p1/conversation?before=p0`);
  });

  it("returns brain's code and message when a reply is not sent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "dm_not_allowed", message: "Not taken." }, { status: 422 })));
    expect(await replyToItem("p1", "hi")).toEqual({ code: "dm_not_allowed", message: "Not taken." });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "reply_in_progress" }, { status: 409 })));
    expect(await replyToItem("p1", "hi")).toBe("reply_in_progress");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "rate_limited" }, { status: 429 })));
    expect(await replyToItem("p1", "hi")).toBe("rate_limited");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_text" }, { status: 422 })));
    expect(await replyToItem("p1", "hi")).toBe("invalid_text");
  });
});

it("says how long ago", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  expect(relativeTime("2026-10-30T11:59:40Z", now)).toBe("now");
  expect(relativeTime("2026-10-30T11:55:00Z", now)).toBe("5 minutes ago");
  expect(relativeTime("2026-10-29T12:00:00Z", now)).toBe("yesterday");
});

describe("mergeFresh", () => {
  const item = (id: string, at: string, text = id) => ({ id, received_at: at, text }) as unknown as Item;
  const page = (ids: [string, string][], next: string | null = null) => ({ items: ids.map(([id, at]) => item(id, at)), next });

  it("puts new items on top, updates known ones and keeps the next cursor", () => {
    const loaded = page([["b", "2026-01-02"], ["a", "2026-01-01"]], "a");
    const fresh = { items: [item("c", "2026-01-03"), item("b", "2026-01-02", "edited")], next_cursor: "b" };
    const got = mergeFresh(loaded, fresh);
    expect(got.items.map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(got.items[1]!.text).toBe("edited");
    expect(got.next).toBe("a");
  });

  it("drops items a complete fresh page no longer holds", () => {
    const got = mergeFresh(page([["b", "2026-01-02"], ["a", "2026-01-01"]]), { items: [item("a", "2026-01-01")], next_cursor: null });
    expect(got.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("leaves an older unknown item for Load more after one was marked done", () => {
    // c and b loaded, b marked done elsewhere, so the fresh page reaches down to the older a.
    const loaded = page([["c", "2026-01-03"], ["b", "2026-01-02"]], "b");
    const got = mergeFresh(loaded, { items: [item("c", "2026-01-03"), item("a", "2026-01-01")], next_cursor: "a" });
    expect(got).toEqual({ items: [item("c", "2026-01-03")], next: "b" });
  });

  it("replaces the list when a full fresh page shares nothing with it", () => {
    const got = mergeFresh(page([["a", "2026-01-01"]]), { items: [item("z", "2026-01-09")], next_cursor: "z" });
    expect(got).toEqual({ items: [item("z", "2026-01-09")], next: "z" });
  });
});

describe("conversations", () => {
  const dm = (id: string, at: string, replies: { id: string; created_at: string; text: string }[] = [], author = "bob") =>
    ({ id, kind: "dm", social_account_id: "c1", author: { id: author }, text: `them ${id}`, received_at: at, replies }) as unknown as Item;

  it("keys a DM by its person and account, anything else by itself", () => {
    expect(threadKey(dm("a", "2026-11-10T10:00:00Z"))).toBe(threadKey(dm("b", "2026-11-11T10:00:00Z")));
    expect(threadKey(dm("a", "2026-11-10T10:00:00Z"))).not.toBe(threadKey(dm("b", "2026-11-10T10:00:00Z", [], "cara")));
    expect(threadKey({ id: "p1", kind: "comment" } as Item)).toBe("p1");
  });

  it("counts messages", () => {
    expect(messageCount(1)).toBe("1 message");
    expect(messageCount(4)).toBe("4 messages");
  });

  it("names the day in the reader's time zone", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    const now = Date.parse("2026-11-12T12:00:00Z");
    expect(dayLabel("2026-11-12T08:00:00Z", now)).toBe("Today");
    // 23:30 UTC on the 11th is already the 12th in Berlin.
    expect(dayLabel("2026-11-11T23:30:00Z", now)).toBe("Today");
    expect(dayLabel("2026-11-11T12:00:00Z", now)).toBe("Yesterday");
    expect(dayLabel("2026-11-01T12:00:00Z", now)).toBe(new Date("2026-11-01T12:00:00Z").toLocaleDateString(undefined, { dateStyle: "medium" }));
    vi.unstubAllEnvs();
  });

  it("lays a conversation out in time order with a row per new day and each reply once", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    const reply = { id: "r1", created_at: "2026-11-11T10:05:00Z", text: "ours" };
    const rows = chatRows(
      // The same reply on two items shows once; items given out of order still sort.
      [dm("b", "2026-11-12T09:00:00Z", [reply]), dm("a", "2026-11-11T10:00:00Z", [reply])],
      Date.parse("2026-11-12T12:00:00Z"),
    );
    expect(rows.map((r) => (r.type === "day" ? r.label : `${r.type}:${r.text}`))).toEqual(["Yesterday", "them:them a", "us:ours", "Today", "them:them b"]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(chatRows([])).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("drops a conversation's old row when its latest DM changed", () => {
    // The loaded list holds the conversation as `old`, below the fresh page's span.
    const loaded = { items: [dm("x", "2026-11-12T09:00:00Z", [], "cara"), dm("old", "2026-11-01T09:00:00Z")], next: "old" };
    const got = mergeFresh(loaded, { items: [dm("new", "2026-11-12T10:00:00Z"), dm("x", "2026-11-12T09:00:00Z", [], "cara")], next_cursor: "x" });
    expect(got.items.map((i) => i.id)).toEqual(["new", "x"]);
  });
});

describe("reply limits", () => {
  it("uses each platform's own limits", () => {
    expect(maxFor("comment")).toBe(300);
    expect(maxFor("comment", "bluesky")).toBe(300);
    expect(maxFor("dm", "bluesky")).toBe(1000);
    expect(maxFor("comment", "facebook")).toBe(8000);
    expect(maxFor("dm", "facebook")).toBe(2000);
    expect(maxFor("comment", "instagram")).toBe(2200);
    expect(maxFor("dm", "instagram")).toBe(1000);
  });
});
