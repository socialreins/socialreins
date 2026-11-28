import { describe, expect, it } from "vitest";
import { automationHref, commentsHref, inboxFromFilters, listArguments, notInInbox, notInRule, pickedAccounts, readFilters, sameFilters, narrows } from "@/lib/comments";
import { countItems, inboxBadge, listItems } from "@/lib/inbox";
import { viewForKey, type View } from "@/lib/views";
import type { Connection } from "@/lib/connections";

const acct = (id: string, provider: string, set_ids: string[]) => ({ id, provider, set_ids, handle: id, display_name: null }) as unknown as Connection;
const accounts = [acct("b1", "bluesky", ["s1"]), acct("b2", "bluesky", ["s2"]), acct("f1", "facebook", ["s1", "s2"]), acct("l1", "linkedin", ["s1"]), acct("t1", "tiktok", ["s1"])];
const params = (q: string) => new URLSearchParams(q);

describe("comment filters in the address", () => {
  it("reads only the known keys, trimmed, and writes them back in one order", () => {
    const f = readFilters(params("network=x,bluesky&q=%20refund%20&item=4&state=done&junk=1&answer="));
    expect(f).toEqual({ network: "x,bluesky", q: "refund" });
    expect(commentsHref(f)).toBe("/comments?network=x%2Cbluesky&q=refund");
    expect(commentsHref({}, { item: "12", state: "done" })).toBe("/comments?state=done&item=12");
    expect(commentsHref({}, { view: "none" })).toBe("/comments?view=none");
    expect(commentsHref({})).toBe("/comments");
  });
  it("compares a view with the filters on screen without caring about layout order", () => {
    expect(sameFilters({ network: "x", q: "a" }, { q: "a", network: "x" })).toBe(true);
    expect(sameFilters({ network: "x" }, { network: "x", answer: "unanswered" })).toBe(false);
    expect(narrows({ by: "post" })).toBe(false);
    expect(narrows({ by: "post", q: "a" })).toBe(true);
  });
});

describe("which accounts a pick reaches", () => {
  it("is null with no pick, and sets, networks and accounts must all hold", () => {
    expect(pickedAccounts({}, accounts)).toBeNull();
    expect(pickedAccounts({ set: "s1" }, accounts)!.map((a) => a.id)).toEqual(["b1", "f1", "l1"]);
    expect(pickedAccounts({ set: "s1,s2", network: "bluesky" }, accounts)!.map((a) => a.id)).toEqual(["b1", "b2"]);
    expect(pickedAccounts({ set: "s1", account: "b2" }, accounts)).toEqual([]);
    // TikTok has no comments to read.
    expect(pickedAccounts({ network: "tiktok" }, accounts)).toEqual([]);
  });
  it("lists nothing, never everything, when a pick matches no account", () => {
    const { more } = listArguments({ set: "gone" }, accounts);
    expect(more.accountIds).toEqual(["00000000-0000-0000-0000-000000000000"]);
  });
});

describe("what the list and count are asked", () => {
  it("is comments and mentions, narrowed by the filters", () => {
    const a = listArguments({ network: "facebook", answer: "unanswered", hidden: "1", post: "p-1", q: "refund", assigned: "me", from: "2026-11-01", to: "2026-11-30" }, accounts);
    expect(a.kind).toBe("comments");
    expect(a.search).toBe("refund");
    expect(a.more).toMatchObject({ accountIds: ["f1"], unanswered: true, hidden: true, post: "p-1", assigned: "me" });
    // `to` is the first moment after its day, so the whole last day is in.
    expect(new Date(a.more.to!) > new Date(a.more.from!)).toBe(true);
    expect(listArguments({ answer: "answered" }, accounts).more.unanswered).toBe(false);
    expect(listArguments({ show: "activity" }, accounts).kind).toBe("activity");
    expect(listArguments({ from: "not a day" }, accounts).more.from).toBeUndefined();
  });
  it("is the same query for the list and the count", () => {
    const asked: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string) => (asked.push(String(url)), new Response(JSON.stringify({ items: [], next_cursor: null, count: 0 }), { status: 200 }))) as typeof fetch;
    try {
      const { kind, search, more } = listArguments({ network: "facebook,bluesky", answer: "unanswered", hidden: "1", q: "x" }, accounts);
      void listItems("all", "open", null, kind, search, more);
      void countItems("all", "open", kind, search, more);
    } finally {
      globalThis.fetch = real;
    }
    const [list, count] = asked.map((u) => new URL(u, "http://x"));
    for (const k of ["kind", "q", "account_ids", "unanswered", "hidden", "state"]) expect(list!.searchParams.get(k), k).toBe(count!.searchParams.get(k));
    expect(list!.searchParams.get("kind")).toBe("comments");
    expect(list!.searchParams.get("account_ids")).toBe("b1,b2,f1");
    expect(list!.pathname.endsWith("/items") && count!.pathname.endsWith("/count")).toBe(true);
  });
});

describe("save as inbox and automate", () => {
  it("makes an inbox of comments and mentions for the accounts picked, and says what an inbox cannot hold", () => {
    const i = inboxFromFilters("X", { network: "bluesky", q: "price", answer: "unanswered", post: "p", hidden: "1" }, accounts);
    expect(i).toEqual({ name: "X", account_ids: ["b1", "b2"], filters: { kinds: ["comment", "mention"], keywords: ["price"], unanswered: true } });
    expect(notInInbox({ post: "p", hidden: "1", from: "2026-11-01", assigned: "me", answer: "answered" })).toEqual(["one post", "the dates", "hidden or held", "who it is assigned to", "answered only"]);
    // No pick: every account that has comments, none that cannot.
    expect(inboxFromFilters("All", {}, accounts).account_ids).toEqual(["b1", "b2", "f1", "l1"]);
  });
  it("opens the comment builder with the accounts and the keyword", () => {
    expect(automationHref({ set: "s1", q: "link" }, accounts)).toBe("/automations/new?template=comment-ai-draft&set=s1&keywords=link");
    expect(automationHref({ network: "bluesky" }, accounts)).toBe("/automations/new?template=comment-ai-draft&accounts=b1%2Cb2");
    // No filters: every account, which is what a rule with no scope does.
    expect(automationHref({}, accounts)).toBe("/automations/new?template=comment-ai-draft");
  });
  it("offers no rule for a pick that reaches no account, and names what a rule cannot carry", () => {
    // A rule with no scope would answer every account: wider than the filters.
    expect(automationHref({ network: "x" }, accounts)).toBeNull();
    expect(notInRule({ post: "p", from: "2026-11-01", hidden: "1", assigned: "me", show: "activity", answer: "unanswered", q: "a" })).toEqual(["one post", "the dates", "hidden or held", "who it is assigned to", "activity"]);
  });
});

describe("saved views", () => {
  const v = (id: string): View => ({ id, scope: "comments", name: id, filters: {}, is_default: false, created_at: "", updated_at: "" });
  it("maps the keys 1 to 9 to the views in order", () => {
    const list = [v("a"), v("b")];
    expect(viewForKey("1", list)?.id).toBe("a");
    expect(viewForKey("2", list)?.id).toBe("b");
    expect(viewForKey("3", list)).toBeUndefined();
    expect(viewForKey("0", list)).toBeUndefined();
    expect(viewForKey("x", list)).toBeUndefined();
  });
});

describe("inbox badges", () => {
  it("counts DMs for All inboxes and everything for a custom inbox", () => {
    expect(inboxBadge({ id: "a", is_all: true, open_count: 9, open_dm_count: 2 }, undefined, null)).toEqual({ n: 2, word: "open" });
    expect(inboxBadge({ id: "a", is_all: true, open_count: 9 }, undefined, null)).toEqual({ n: 9, word: "open" });
    expect(inboxBadge({ id: "c", is_all: false, open_count: 5, open_dm_count: 1 }, undefined, null)).toEqual({ n: 5, word: "open" });
  });
});
