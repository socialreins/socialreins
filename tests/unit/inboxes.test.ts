import { afterEach, expect, it, vi } from "vitest";
import { createInbox, inboxCapable, inboxName, stepInbox, unboxed, updateInbox, type Inbox } from "@/lib/inbox";

afterEach(() => vi.unstubAllGlobals());

const box = (id: string, account_ids: string[] = []): Inbox => ({
  id,
  name: id,
  is_all: id === "all",
  account_ids,
  filters: { kinds: [], keywords: [], unanswered: false },
  created_at: "",
  updated_at: "",
});
const acct = (id: string, provider: string) => ({ id, provider });

it("keeps only accounts with an inbox, and names All inboxes", () => {
  const accounts = [acct("b", "bluesky"), acct("f", "facebook"), acct("i", "instagram"), acct("t", "threads"), acct("x", "x"), acct("l", "linkedin")];
  expect(inboxCapable(accounts).map((a) => a.id)).toEqual(["b", "f", "i", "t", "x"]);
  expect(inboxName(box("all"))).toBe("All inboxes");
  expect(inboxName(box("sales"))).toBe("sales");
});

it("finds the capable accounts no inbox holds", () => {
  const accounts = [acct("b", "bluesky"), acct("f", "facebook"), acct("x", "x")];
  expect(unboxed(accounts, [box("all"), box("one", ["b"])]).map((a) => a.id)).toEqual(["f", "x"]);
  expect(unboxed(accounts, [box("all"), box("one", ["b"]), box("two", ["f", "b"])]).map((a) => a.id)).toEqual(["x"]);
});

it("steps through inboxes and wraps around", () => {
  const list = [box("all"), box("a"), box("b")];
  expect(stepInbox(list, "all", 1)?.id).toBe("a");
  expect(stepInbox(list, "b", 1)?.id).toBe("all");
  expect(stepInbox(list, "all", -1)?.id).toBe("b");
  expect(stepInbox(list, undefined, 1)?.id).toBe("a");
  expect(stepInbox([box("all")], "all", 1)).toBeNull();
});

it("sends the name, the accounts and the filters", async () => {
  const fetch = vi.fn(async () => Response.json(box("n", ["b"]), { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  const body = { name: "Sales", account_ids: ["b"], filters: { kinds: [], keywords: ["price"], unanswered: true } };
  await createInbox(body);
  await updateInbox("n", body);
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  expect(calls[0]![1].method).toBe("POST");
  expect(calls[1]![0]).toMatch(/\/v1\/inboxes\/n$/);
  expect(calls[1]![1].method).toBe("PUT");
  for (const [, init] of calls) expect(JSON.parse(String(init.body))).toEqual(body);
});
