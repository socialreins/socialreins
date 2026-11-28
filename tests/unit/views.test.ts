import { describe, expect, it } from "vitest";
import { INBOX_FILTER_KEYS, inboxFilters, inboxFiltersHref, readInboxFilters, sameInboxFilters } from "@/lib/inbox";
import { viewForKey, type View } from "@/lib/views";

const params = (q: string) => new URLSearchParams(q);

describe("inbox view serialisation", () => {
  it("reads only the page's keys, trimmed, and leaves out the two that mean no filter", () => {
    const f = readInboxFilters(params("kind=comment&state=open&q=%20price%20&assigned=me&tag=vip&account=c1&network=&item=12&view=none&junk=1"));
    expect(f).toEqual({ kind: "comment", q: "price", assigned: "me", tag: "vip", account: "c1" });
    // Done is a filter; Open and All are the plain list, so they are not stored.
    expect(readInboxFilters(params("state=done&kind=all"))).toEqual({ state: "done" });
    expect(readInboxFilters(params("kind=comments&state=OPEN"))).toEqual({});
  });

  it("cuts a keyword at brain's 100 characters and drops a kind it does not know", () => {
    const long = "x".repeat(120);
    expect(readInboxFilters(params(`q=${long}&kind=junk`))).toEqual({ q: "x".repeat(100) });
  });

  it("writes the filters back in one fixed order, the inbox's path first", () => {
    const f = inboxFilters({ network: "instagram", state: "done", kind: "dm", q: " refund ", assigned: "me" });
    expect(INBOX_FILTER_KEYS).toEqual(["kind", "state", "q", "assigned", "tag", "account", "network"]);
    expect(f).toEqual({ kind: "dm", state: "done", q: "refund", assigned: "me", network: "instagram" });
    expect(inboxFiltersHref("/inbox/2", f)).toBe("/inbox/2?kind=dm&state=done&q=refund&assigned=me&network=instagram");
    expect(inboxFiltersHref("/inbox/2", {})).toBe("/inbox/2");
    expect(inboxFiltersHref("/inbox/2", {}, { view: "none" })).toBe("/inbox/2?view=none");
  });

  it("round trips through the address, and compares a view with the filters on screen", () => {
    const f = inboxFilters({ kind: "mention", state: "done", q: "refund", assigned: "none", tag: "vip", network: "x" });
    const href = inboxFiltersHref("/inbox/all", f);
    expect(readInboxFilters(params(href.split("?")[1]!))).toEqual(f);
    expect(sameInboxFilters(f, { network: "x", tag: "vip", assigned: "none", q: "refund", state: "done", kind: "mention" })).toBe(true);
    expect(sameInboxFilters(f, { ...f, kind: "dm" })).toBe(false);
    expect(sameInboxFilters({}, {})).toBe(true);
  });
});

describe("inbox view keys", () => {
  const v = (id: string): View => ({ id, scope: "inbox", name: id, filters: {}, is_default: false, created_at: "", updated_at: "" });

  it("maps 1 to 9 to the views in order and nothing else", () => {
    const list = [v("a"), v("b")];
    expect(viewForKey("1", list)?.id).toBe("a");
    expect(viewForKey("9", list)).toBeUndefined();
    expect(viewForKey("0", list)).toBeUndefined();
  });
});
