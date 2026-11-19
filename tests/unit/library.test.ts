import { afterEach, describe, expect, it, vi } from "vitest";
import { addMedia, createSnippet, deleteMedia, insertAt, libraryText, listMedia, listSnippets, mediaLabel, renameMedia, updateSnippet } from "@/lib/library";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];
const item = { id: "m1", url: "https://example.com/a.png", name: "A", created_at: "2026-11-01T10:00:00Z", created_by: "u1" };

afterEach(() => vi.unstubAllGlobals());

describe("media library requests", () => {
  it("lists a page with the search and cursor", async () => {
    const fetch = reply(200, { items: [item], next_cursor: "c2" });
    vi.stubGlobal("fetch", fetch);
    expect(await listMedia(" cat ", "c1", 12)).toEqual({ items: [item], next_cursor: "c2" });
    const url = new URL(call(fetch)[0]);
    expect(url.pathname).toBe("/v1/media-library");
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: "12", q: "cat", cursor: "c1" });
    expect(call(fetch)[1]).toMatchObject({ credentials: "include" });
  });

  it("adds, renames and deletes", async () => {
    let fetch = reply(201, item);
    vi.stubGlobal("fetch", fetch);
    expect(await addMedia(item.url, " A ")).toEqual(item);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/media-library`);
    expect(JSON.parse(call(fetch)[1].body as string)).toEqual({ url: item.url, name: "A" });

    fetch = reply(200, { ...item, name: "B" });
    vi.stubGlobal("fetch", fetch);
    expect(await renameMedia("m/1", "B")).toMatchObject({ name: "B" });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/media-library/m%2F1`);
    expect(call(fetch)[1]).toMatchObject({ method: "PATCH" });

    vi.stubGlobal("fetch", reply(204));
    expect(await deleteMedia("m1")).toBe("ok");
  });

  it("keeps the existing item's id on already_in_library", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "already_in_library", id: "m9" }));
    expect(await addMedia(item.url)).toEqual({ code: "already_in_library", id: "m9" });
  });

  it("keeps the field on invalid_media and maps library_full", async () => {
    vi.stubGlobal("fetch", reply(422, { error: "invalid_media", field: "url" }));
    expect(await addMedia("https://x")).toEqual({ code: "invalid_media", field: "url" });
    vi.stubGlobal("fetch", reply(422, { error: "library_full" }));
    expect(await addMedia("https://x")).toEqual({ code: "library_full" });
  });

  it("maps a lost session, an unknown error and a network failure", async () => {
    vi.stubGlobal("fetch", reply(401, { error: "unauthorized" }));
    expect(await listMedia()).toEqual({ code: "signed_out" });
    vi.stubGlobal("fetch", reply(500));
    expect(await listMedia()).toEqual({ code: "error" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await listMedia()).toEqual({ code: "error" });
  });
});

describe("snippet requests", () => {
  it("lists by kind, creates and updates", async () => {
    let fetch = reply(200, { items: [] });
    vi.stubGlobal("fetch", fetch);
    expect(await listSnippets("hashtags")).toEqual({ items: [] });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/snippets?kind=hashtags`);

    const s = { kind: "caption" as const, name: "Hi", body: "Hello" };
    fetch = reply(201, { id: "s1", ...s });
    vi.stubGlobal("fetch", fetch);
    await createSnippet(s);
    expect(call(fetch)[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(call(fetch)[1].body as string)).toEqual(s);

    fetch = reply(200, { id: "s1", ...s });
    vi.stubGlobal("fetch", fetch);
    await updateSnippet("s1", s);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/snippets/s1`);
    expect(call(fetch)[1]).toMatchObject({ method: "PUT" });
  });

  it("maps snippet_name_taken, too_many_snippets and invalid_snippet with its field", async () => {
    const s = { kind: "caption" as const, name: "Hi", body: "Hello" };
    vi.stubGlobal("fetch", reply(409, { error: "snippet_name_taken" }));
    expect(await createSnippet(s)).toEqual({ code: "snippet_name_taken" });
    vi.stubGlobal("fetch", reply(422, { error: "too_many_snippets" }));
    expect(await createSnippet(s)).toEqual({ code: "too_many_snippets" });
    vi.stubGlobal("fetch", reply(422, { error: "invalid_snippet", field: "body" }));
    expect(await createSnippet(s)).toEqual({ code: "invalid_snippet", field: "body" });
  });
});

describe("libraryText", () => {
  it("says what the library's refusals mean, by field", () => {
    expect(libraryText({ code: "already_in_library", id: "m9" })).toBe("That link is already in the library.");
    expect(libraryText({ code: "invalid_media", field: "url" })).toMatch(/https link/);
    expect(libraryText({ code: "invalid_media", field: "name" })).toMatch(/name is too long/);
    expect(libraryText({ code: "snippet_name_taken" })).toMatch(/already has that name/);
    expect(libraryText({ code: "invalid_snippet", field: "name" })).toMatch(/Give the snippet a name/);
    expect(libraryText({ code: "invalid_snippet", field: "body" })).toMatch(/snippet's text/);
    expect(libraryText({ code: "library_full" })).toMatch(/full/);
    expect(libraryText({ code: "too_many_snippets" })).toMatch(/Delete one/);
    expect(libraryText({ code: "signed_out" })).toBeNull();
  });
});

describe("insertAt", () => {
  it("inserts into empty text as is", () => {
    expect(insertAt("", 0, 0, "#a #b", "hashtags")).toEqual({ text: "#a #b", caret: 5 });
  });

  it("adds a space before hashtags after a word, and after when a word follows", () => {
    expect(insertAt("Hello", 5, 5, "#a", "hashtags")).toEqual({ text: "Hello #a", caret: 8 });
    expect(insertAt("Hello world", 5, 5, "#a", "hashtags")).toEqual({ text: "Hello #a world", caret: 8 });
    expect(insertAt("Hello world", 6, 6, "#a", "hashtags")).toEqual({ text: "Hello #a world", caret: 8 });
  });

  it("puts a caption on its own line and replaces a selection", () => {
    expect(insertAt("Intro", 5, 5, "Sign off", "caption")).toEqual({ text: "Intro\nSign off", caret: 14 });
    expect(insertAt("Intro\n", 6, 6, "Sign off", "caption")).toEqual({ text: "Intro\nSign off", caret: 14 });
    expect(insertAt("Say XX now", 4, 6, "this", "caption")).toEqual({ text: "Say this now", caret: 8 });
    expect(insertAt("abc", 1, 1, "X", "caption")).toEqual({ text: "a\nX\nbc", caret: 3 });
  });
});

describe("mediaLabel", () => {
  it("uses the name, else the file name, else the host", () => {
    expect(mediaLabel({ url: "https://e.com/x/My%20cat.png", name: "Cat" })).toBe("Cat");
    expect(mediaLabel({ url: "https://e.com/x/My%20cat.png", name: " " })).toBe("My cat.png");
    expect(mediaLabel({ url: "https://e.com/", name: "" })).toBe("e.com");
    expect(mediaLabel({ url: "https://drive.google.com/file/d/abc/view", name: "" })).toBe("drive.google.com");
  });
});
