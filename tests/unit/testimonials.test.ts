import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addTestimonial,
  attribution,
  changeTestimonial,
  deleteTestimonial,
  listTestimonials,
  markdownQuote,
  postText,
  quoteText,
  startPost,
  takePostText,
} from "@/lib/testimonials";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];
const last = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.at(-1) as unknown as [string, RequestInit];
const sent = (fetch: ReturnType<typeof vi.fn>) => JSON.parse(String(last(fetch)[1].body));

const quote = {
  id: "t1",
  inbox_item_id: "i1",
  contact_id: null,
  text: "Best shop I know.",
  author_name: "Fan Test",
  author_handle: "fan.test",
  platform: "bluesky",
  source_url: "https://bsky.app/profile/fan.test/post/1",
  permission: "granted" as const,
  note: null,
  created_by: "u1",
  created_at: "2026-11-28T10:00:00Z",
  updated_at: "2026-11-28T10:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("the words and who said them", () => {
  it("names the person, their handle and the network, each when known", () => {
    expect(attribution(quote)).toBe("Fan Test (@fan.test) on Bluesky");
    expect(attribution({ ...quote, author_name: null })).toBe("@fan.test on Bluesky");
    expect(attribution({ ...quote, author_handle: null })).toBe("Fan Test on Bluesky");
    expect(attribution({ ...quote, platform: null })).toBe("Fan Test (@fan.test)");
    expect(attribution({ author_name: null, author_handle: null, platform: "x" })).toBe("on X");
  });

  it("copies the quote with an attribution line under it", () => {
    expect(quoteText(quote)).toBe('"Best shop I know."\nFan Test (@fan.test) on Bluesky');
    expect(quoteText({ ...quote, author_name: null, author_handle: null, platform: null })).toBe('"Best shop I know."');
    // The quote is trimmed, and its own line breaks stay.
    expect(quoteText({ ...quote, text: "  Two lines\nof praise  " })).toBe('"Two lines\nof praise"\nFan Test (@fan.test) on Bluesky');
  });

  it("makes a Markdown blockquote with the attribution and the original", () => {
    expect(markdownQuote(quote)).toBe(
      "> Best shop I know.\n\nFan Test (@fan.test) on Bluesky, [the original post](https://bsky.app/profile/fan.test/post/1)",
    );
    expect(markdownQuote({ ...quote, text: "One\nTwo", source_url: null })).toBe("> One\n> Two\n\nFan Test (@fan.test) on Bluesky");
    expect(markdownQuote({ ...quote, author_name: null, author_handle: null, platform: null, source_url: null })).toBe("> Best shop I know.");
  });

  it("hands the quote to the composer without the network or the link", () => {
    expect(postText(quote)).toBe('"Best shop I know."\nFan Test (@fan.test) on Bluesky');
  });
});

describe("a post from a testimonial", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("opens a new post from the quote, and a new Post it replaces it", () => {
    expect(startPost(quote)).toBe("/posts/new?testimonial=t1");
    expect(takePostText()).toBe('"Best shop I know."\nFan Test (@fan.test) on Bluesky');
    // Kept for this post, so a form rendered twice still finds it.
    expect(takePostText()).toBe('"Best shop I know."\nFan Test (@fan.test) on Bluesky');
    expect(startPost({ ...quote, id: "t2", text: "Another" })).toBe("/posts/new?testimonial=t2");
    expect(takePostText()).toContain("Another");
  });

  it("still opens the composer when the browser refuses storage", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(startPost(quote)).toBe("/posts/new?testimonial=t1");
    expect(takePostText()).toBeNull();
  });
});

describe("testimonial requests", () => {
  it("lists newest first with a cursor", async () => {
    const fetch = reply(200, { items: [quote], next_cursor: null });
    vi.stubGlobal("fetch", fetch);
    expect(await listTestimonials("c1")).toEqual({ items: [quote], next_cursor: null });
    const url = new URL(call(fetch)[0]);
    expect(url.pathname).toBe("/v1/testimonials");
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: "50", cursor: "c1" });
  });

  it("adds one from an inbox item, with a note only when one is written", async () => {
    const fetch = reply(201, quote);
    vi.stubGlobal("fetch", fetch);
    expect(await addTestimonial("i1", "  From launch day  ")).toEqual(quote);
    expect(call(fetch)[0]).toContain("/v1/testimonials");
    expect(call(fetch)[1].method).toBe("POST");
    expect(sent(fetch)).toEqual({ inbox_item_id: "i1", note: "From launch day" });
    await addTestimonial("i1", "   ");
    expect(sent(fetch)).toEqual({ inbox_item_id: "i1" });
  });

  it("changes the permission and reads brain's named field", async () => {
    const fetch = reply(200, { ...quote, permission: "declined" });
    vi.stubGlobal("fetch", fetch);
    expect(await changeTestimonial("t1", { permission: "declined" })).toMatchObject({ permission: "declined" });
    expect(sent(fetch)).toEqual({ permission: "declined" });

    vi.stubGlobal("fetch", reply(422, { error: "invalid_testimonial", field: "permission" }));
    expect(await changeTestimonial("t1", { permission: "maybe" as never })).toEqual({ code: "invalid_testimonial", field: "permission" });
  });

  it("says an item is already a testimonial, and a DM is not one", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "already_testimonial" }));
    expect(await addTestimonial("i1")).toEqual({ code: "already_testimonial" });
    vi.stubGlobal("fetch", reply(422, { error: "not_a_comment" }));
    expect(await addTestimonial("d1")).toEqual({ code: "not_a_comment" });
  });

  it("removes one", async () => {
    const fetch = reply(204);
    vi.stubGlobal("fetch", fetch);
    expect(await deleteTestimonial("t1")).toBe("ok");
    expect(call(fetch)[1].method).toBe("DELETE");
  });
});
