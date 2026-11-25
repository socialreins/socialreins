import { afterEach, describe, expect, it, vi } from "vitest";
import { assignItem, chatRows, moderateItem, windowNote, itemSummary, dayLabel, actionButtons, getConversation, getThread, runAction, hasThread, isActivity, listItems, maxFor, replyLength, mergeConversation, mergeFresh, messageCount, relativeTime, replyToItem, sentAlready, setItemState, threadKey, type Item } from "@/lib/inbox";
import { apiUrl } from "@/lib/waitlist";

const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("itemSummary", () => {
  it("says what an item carries when it has no text, and never (no text) then", () => {
    const image = { kind: "image" as const, url: "https://scontent.xx.fbcdn.net/a.jpg" };
    expect(itemSummary({ text: "hi", attachments: [image] })).toBe("hi");
    expect(itemSummary({ text: "", attachments: [{ kind: "sticker", url: "https://x.fbcdn.net/s.png" }] })).toBe("Sticker");
    expect(itemSummary({ text: "", attachments: [image, image, { kind: "video", url: "https://x.fbsbx.com/v.mp4" }] })).toBe("Photo and 2 more");
    expect(itemSummary({ text: "", attachments: [] })).toBe("(no text)");
    expect(itemSummary({ text: "" })).toBe("(no text)");
  });
});

describe("inbox requests", () => {
  it("pages items by state and cursor", async () => {
    const fetch = vi.fn(async () => Response.json({ items: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetch);
    await listItems("i 1", "done", "c9");
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/inboxes/i%201/items?state=done&cursor=c9`);
    await listItems("all", "open", null, "dm", "price list");
    expect((fetch.mock.calls[1] as unknown as [string])[0]).toBe(`${apiUrl}/v1/inboxes/all/items?state=open&kind=dm&q=price+list`);
  });

  it("asks for conversations only when told to, so Home keeps plain rows", async () => {
    const fetch = vi.fn(async () => Response.json({ items: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetch);
    await listItems("all", "open");
    expect(call(fetch)[0]).not.toContain("group");
    await listItems("all", "open", "c9", null, "", { conversations: true, assigned: "me" });
    expect((fetch.mock.calls[1] as unknown as [string])[0]).toBe(`${apiUrl}/v1/inboxes/all/items?state=open&group=conversations&assigned=me&cursor=c9`);
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

  it("calls a reply unsure, never refused, when brain may have sent it", async () => {
    const unsure = { unsure: true };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "server_error" }, { status: 500 })));
    expect(await replyToItem("p1", "hi")).toEqual(unsure);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "bad_gateway" }, { status: 502 })));
    expect(await replyToItem("p1", "hi")).toEqual(unsure);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await replyToItem("p1", "hi")).toEqual(unsure);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("slow", "TimeoutError"))));
    expect(await replyToItem("p1", "hi")).toEqual(unsure);
    // A 4xx brain gives no known code for, and a 201 that can't be read.
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "something_new" }, { status: 400 })));
    expect(await replyToItem("p1", "hi")).toEqual(unsure);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 201 })));
    expect(await replyToItem("p1", "hi")).toEqual(unsure);
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

  it("finds a reply that went out after all, by its text and the last two minutes", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    const items = [dm("a", "2026-11-12T11:00:00Z"), dm("b", "2026-11-12T11:30:00Z", [{ id: "r1", created_at: "2026-11-12T11:59:00Z", text: "Two it is! " }])];
    expect(sentAlready(items, "Two it is!", now)?.id).toBe("b");
    expect(sentAlready(items, "Something else", now)).toBeUndefined();
    // The same words sent an hour ago are another message.
    expect(sentAlready(items, "Two it is!", now + 3_600_000)).toBeUndefined();
  });

  it("keeps earlier pages and their has_more under a fresh newest page, and takes the fresh one otherwise", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id, n) => dm(id, `2026-11-1${n}T10:00:00Z`));
    expect(mergeConversation(null, { items: [c!, d!], has_more: true })).toEqual({ items: [c, d], has_more: true });
    // Earlier pages were loaded to the start: a newer page changes nothing about that.
    expect(mergeConversation({ items: [a!, b!, c!], has_more: false }, { items: [c!, d!], has_more: true })).toEqual({ items: [a, b, c, d], has_more: false });
    // The fresh page reaches as far back as what is loaded: its has_more is the true one.
    expect(mergeConversation({ items: [c!], has_more: false }, { items: [c!, d!], has_more: true })).toEqual({ items: [c, d], has_more: true });
    // Nothing shared: a gap, so start over from the fresh page.
    expect(mergeConversation({ items: [a!], has_more: false }, { items: [c!, d!], has_more: true })).toEqual({ items: [c, d], has_more: true });
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
    expect(maxFor("comment", "threads")).toBe(500);
  });

  it("counts a Threads reply with an emoji as its UTF-8 bytes, any other network by characters", () => {
    expect(replyLength("threads", "abc")).toBe(3);
    expect(replyLength("threads", "😀")).toBe(4);
    expect(replyLength("threads", "😀".repeat(126))).toBe(504);
    expect(replyLength("bluesky", "😀")).toBe(1);
    expect(replyLength(undefined, "ab")).toBe(2);
  });
});

describe("activity and threads", () => {
  it("words quiet activity, which has no text", () => {
    expect(itemSummary({ kind: "like", text: "", attachments: [] })).toBe("Liked your post");
    expect(itemSummary({ kind: "repost", text: "" })).toBe("Reposted your post");
    expect(itemSummary({ kind: "follow", text: "" })).toBe("Followed you");
    expect(itemSummary({ kind: "comment", text: "" })).toBe("(no text)");
    expect(["follow", "like", "repost", "comment", "dm"].map((k) => isActivity(k as Item["kind"]))).toEqual([true, true, true, false, false]);
  });

  it("reads a thread only for Bluesky comments, mentions, likes and reposts", () => {
    const has = (kind: Item["kind"], platform = "bluesky") => hasThread({ kind, platform });
    expect([has("comment"), has("mention"), has("like"), has("repost")]).toEqual([true, true, true, true]);
    expect([has("dm"), has("follow"), has("comment", "facebook")]).toEqual([false, false, false]);
    // Threads has a thread for a reply or mention, and nothing for a like or repost (it has none).
    expect([has("comment", "threads"), has("mention", "threads"), has("like", "threads")]).toEqual([true, true, false]);
  });

  it("asks brain for the thread of an item and for activity by kind", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ posts: [], truncated: false })));
    vi.stubGlobal("fetch", fetch);
    await getThread("i 1");
    expect(call(fetch)[0]).toContain("/v1/inbox-items/i%201/thread");
    fetch.mockClear();
    await listItems("in1", "open", null, "activity");
    expect(call(fetch)[0]).toContain("kind=activity");
    expect(call(fetch)[0]).not.toContain("state=");
  });
});

describe("actions", () => {
  const bob = { id: "did:plc:bob", handle: "bob.test", name: "Bob", avatar_url: null };
  const comment = { kind: "comment" as const, platform: "bluesky", author: bob };
  const none = { liked: false, reposted: false, following: false, blocking: false, muted: false, thread_muted: false };
  const names = (buttons: { label: string }[]) => buttons.map((b) => b.label);

  it("words each button by the live state and keeps managers' actions apart", () => {
    expect(names(actionButtons(comment, none, false))).toEqual(["Like", "Repost", "Mute thread", "Follow back", "Mute person"]);
    expect(names(actionButtons(comment, { ...none, liked: true, following: true, muted: true }, false))).toEqual(["Unlike", "Repost", "Mute thread", "Unfollow", "Unmute person"]);
    expect(names(actionButtons(comment, none, true))).toEqual(["Like", "Repost", "Mute thread", "Follow back", "Mute person", "Block", "Hide reply"]);
    // Without a read, the first choice; a like has no post of ours to answer, a DM none either; other networks have no actions.
    expect(names(actionButtons({ ...comment, kind: "like" }, null, true))).toEqual(["Follow back", "Mute person", "Block"]);
    expect(actionButtons({ ...comment, platform: "facebook" }, none, true)).toEqual([]);
    expect(actionButtons(comment, { ...none, blocking: true }, true).find((b) => b.action === "unblock_author")?.danger).toBeUndefined();
  });

  it("always confirms, and turns brain's reasons into words", async () => {
    const answers = [new Response(JSON.stringify({ action: "like", remote_id: "at://x" })), new Response(JSON.stringify({ error: "not_applicable", message: "That does not apply to this item." }), { status: 422 }), new Response(JSON.stringify({ error: "already_reported" }), { status: 409 })];
    const fetch = vi.fn(async () => answers.shift()!);
    vi.stubGlobal("fetch", fetch);
    expect(await runAction("i1", { action: "like" })).toMatchObject({ remote_id: "at://x" });
    expect(JSON.parse((call(fetch)[1] as { body: string }).body)).toEqual({ action: "like", confirm: true });
    expect(await runAction("i1", { action: "like" })).toEqual({ code: "not_applicable", message: "That does not apply to this item." });
    expect(await runAction("i1", { action: "report", reason_type: "spam" })).toMatchObject({ code: "already_reported" });
  });
});

describe("windowNote", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  const at = (h: number) => new Date(now + h * 3_600_000).toISOString();
  const w = (closes: number, agent: number | null = null) => ({ last_message_at: at(closes - 24), closes_at: at(closes), human_agent_until: agent === null ? null : at(agent), open: closes > 0 });

  it("counts the 24 hours down, then says why nothing goes out", () => {
    expect(windowNote(w(5.5), now)).toEqual({ text: "Meta takes a reply for 5 hours 30 min more, 24 hours after their last message.", blocked: false });
    expect(windowNote(w(0.25), now).text).toContain("15 minutes more");
    const closed = windowNote(w(-1), now);
    expect(closed.blocked).toBe(true);
    expect(closed.text).toContain("Human Agent permission");
  });

  it("lets a person reply after 24 hours only while the Human Agent window runs", () => {
    expect(windowNote(w(-1, 100), now)).toEqual({ text: "The 24 hours are over. A reply still goes out as a person's reply for 4 days more.", blocked: false });
    expect(windowNote(w(-100, -1), now)).toEqual({ text: "Meta takes no reply now: it is more than 7 days since their last message.", blocked: true });
  });
});

describe("moderateItem", () => {
  it("posts the action and gives back the item, or Meta's reason", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "i1", moderation: { hidden: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await moderateItem("i 1", "hide")).toEqual({ id: "i1", moderation: { hidden: true } });
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}/v1/inbox-items/i%201/moderate`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ action: "hide" });

    const refused = new Response(JSON.stringify({ error: "meta_denied", message: "Meta did not allow it." }), { status: 422 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(refused));
    expect(await moderateItem("i1", "delete")).toEqual({ code: "meta_denied", message: "Meta did not allow it." });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 403 })));
    expect(await moderateItem("i1", "delete")).toBe("error");
  });
});
