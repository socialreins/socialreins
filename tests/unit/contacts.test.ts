import { afterEach, describe, expect, it, vi } from "vitest";
import { addTag, cleanTag, contactName, listContacts, updateContact } from "@/lib/contacts";
import { assignItem, listItems } from "@/lib/inbox";
import { apiUrl } from "@/lib/waitlist";

afterEach(() => vi.unstubAllGlobals());
const urls = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map((c) => (c as unknown as [string])[0].replace(apiUrl, ""));

describe("tags", () => {
  it("cleans a tag as brain keeps it: lower case, no commas, 30 characters at most", () => {
    expect(cleanTag("  VIP ")).toBe("vip");
    expect(cleanTag("Big,  Spender")).toBe("big spender");
    expect(cleanTag(" , ")).toBe("");
    expect(cleanTag("x".repeat(40))).toHaveLength(30);
    // Counted by characters, so an emoji is never cut in half.
    expect(cleanTag("😀".repeat(31))).toBe("😀".repeat(30));
  });

  it("adds a tag once, and none past the limit", () => {
    const tags = ["vip"];
    expect(addTag(tags, "Lead")).toEqual(["vip", "lead"]);
    expect(addTag(tags, " VIP")).toBe(tags);
    expect(addTag(tags, ",")).toBe(tags);
    expect(addTag(tags, "new", 1)).toBe(tags);
    const full = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(addTag(full, "one-more")).toBe(full);
  });
});

describe("contact requests", () => {
  it("lists with only the filters that are set, and patches tags and notes", async () => {
    const fetch = vi.fn(async () => Response.json({ items: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetch);
    await listContacts({});
    await listContacts({ q: "bo b", tag: "vip", platform: "bluesky" }, "c2");
    await updateContact("k 1", { tags: ["vip"], notes: null });
    expect(urls(fetch)).toEqual(["/v1/contacts", "/v1/contacts?q=bo+b&tag=vip&platform=bluesky&cursor=c2", "/v1/contacts/k%201"]);
    expect((fetch.mock.calls[2] as unknown as [string, RequestInit])[1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ tags: ["vip"], notes: null }) });
  });

  it("names a contact by its display name, then its handle, then its id", () => {
    expect(contactName({ display_name: "Bob", handle: "bob", external_id: "did:1" })).toBe("Bob");
    expect(contactName({ display_name: null, handle: "bob", external_id: "did:1" })).toBe("@bob");
    expect(contactName({ display_name: null, handle: null, external_id: "did:1" })).toBe("did:1");
  });
});

describe("inbox assignment", () => {
  it("asks for assigned and tag, and patches assigned_to with a user id or null", async () => {
    const fetch = vi.fn(async () => Response.json({ items: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetch);
    await listItems("all", "open", "c9", null, "", { assigned: "me", tag: "big spender" });
    await assignItem("p1", "u2");
    await assignItem("p1", null);
    expect(urls(fetch)[0]).toBe("/v1/inboxes/all/items?state=open&group=conversations&assigned=me&tag=big+spender&cursor=c9");
    const bodies = fetch.mock.calls.slice(1).map((c) => (c as unknown as [string, RequestInit])[1].body);
    expect(bodies).toEqual([JSON.stringify({ assigned_to: "u2" }), JSON.stringify({ assigned_to: null })]);
  });
});
