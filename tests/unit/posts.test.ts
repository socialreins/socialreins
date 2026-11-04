import { afterEach, describe, expect, it, vi } from "vitest";
import {
  charCount,
  checkPost,
  checkThread,
  createPost,
  createPostGroup,
  limits,
  deletePost,
  fromLocalInput,
  getPost,
  graphemes,
  listPosts,
  monthRange,
  monthWeeks,
  publishPost,
  toLocalInput,
  updatePost,
  utf8Bytes,
} from "@/lib/posts";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];
const input = { social_set_id: "s1", platform: "bluesky" as const, body: "Hi", media: [], scheduled_at: null };

afterEach(() => vi.unstubAllGlobals());

describe("post requests", () => {
  it("lists posts with only the filters given", async () => {
    let fetch = reply(200, []);
    vi.stubGlobal("fetch", fetch);
    await listPosts();
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/posts`);
    fetch = reply(200, []);
    vi.stubGlobal("fetch", fetch);
    await listPosts({ social_set_id: "", status: "draft", from: "2026-11-01T00:00:00.000Z" });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/posts?status=draft&from=2026-11-01T00%3A00%3A00.000Z`);
    expect(call(fetch)[1]).toMatchObject({ credentials: "include" });
  });

  it.each([
    ["createPost", () => createPost(input), "/v1/posts", "POST", input],
    ["updatePost", () => updatePost("p/1", input), "/v1/posts/p%2F1", "PUT", input],
  ] as const)("%s sends the post as JSON", async (_, run, path, method, body) => {
    const fetch = reply(201, { id: "p1" });
    vi.stubGlobal("fetch", fetch);
    expect(await run()).toEqual({ id: "p1" });
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}${path}`);
    expect(init).toMatchObject({ method, credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("creates a post group and lists a group's posts", async () => {
    const group = { ...input, platforms: ["bluesky", "instagram"] as const, overrides: { instagram: { body: "Insta" } } };
    let fetch = reply(201, { group_id: "g1", posts: [] });
    vi.stubGlobal("fetch", fetch);
    expect(await createPostGroup({ ...group, platforms: [...group.platforms] })).toEqual({ group_id: "g1", posts: [] });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/post-groups`);
    expect(call(fetch)[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(call(fetch)[1].body as string)).toMatchObject({ platforms: ["bluesky", "instagram"], overrides: { instagram: { body: "Insta" } } });
    fetch = reply(200, []);
    vi.stubGlobal("fetch", fetch);
    await listPosts({ group_id: "g1" });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/posts?group_id=g1`);
  });

  it("gets and publishes a post", async () => {
    let fetch = reply(200, { id: "p1" });
    vi.stubGlobal("fetch", fetch);
    await getPost("p1");
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/posts/p1`);
    fetch = reply(202, { id: "p1", status: "queued" });
    vi.stubGlobal("fetch", fetch);
    expect(await publishPost("p1")).toEqual({ id: "p1", status: "queued" });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/posts/p1/publish`);
    expect(call(fetch)[1]).toMatchObject({ method: "POST" });
  });

  it.each([
    [422, "too_long"],
    [422, "too_many_images"],
    [422, "invalid_media"],
    [422, "empty_post"],
    [422, "invalid_set"],
    [422, "unsupported_platform"],
    [422, "media_required"],
    [422, "thread_not_supported"],
    [422, "invalid_override"],
    [422, "no_accounts"],
    [409, "too_many_posts"],
    [409, "not_editable"],
    [429, "publish_quota"],
    [429, "rate_limited"],
    [422, "invalid_query"],
  ])("maps %i %s", async (status, code) => {
    vi.stubGlobal("fetch", reply(status, { error: code }));
    expect(await createPost(input)).toBe(code);
  });

  it("deletes: 204 is ok, 200 is the taken-down post, 422 carries brain's message", async () => {
    vi.stubGlobal("fetch", reply(204));
    expect(await deletePost("p1")).toBe("ok");
    vi.stubGlobal("fetch", reply(200, { id: "p1", status: "deleted" }));
    expect(await deletePost("p1")).toEqual({ id: "p1", status: "deleted" });
    vi.stubGlobal("fetch", reply(422, { error: "takedown_failed", message: "Delete it on Bluesky by hand." }));
    expect(await deletePost("p1")).toEqual({ takedownFailed: "Delete it on Bluesky by hand." });
    vi.stubGlobal("fetch", reply(409, { error: "not_deletable" }));
    expect(await deletePost("p1")).toBe("not_deletable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("slow", "TimeoutError")));
    expect(await deletePost("p1")).toBe("timeout");
  });
});

describe("post checks", () => {
  it("counts graphemes, so an emoji family is one character", () => {
    expect(graphemes("hello")).toBe(5);
    expect(graphemes("👨‍👩‍👧")).toBe(1);
    expect(graphemes("é")).toBe(1);
    expect(utf8Bytes("é")).toBe(2);
  });

  it("mirrors brain's save rules", () => {
    expect(checkPost("", [])).toBe("empty_post");
    expect(checkPost("  ", [])).toBe("empty_post");
    expect(checkPost("", ["https://example.com/a.png"])).toBeNull();
    expect(checkPost("a".repeat(300), [])).toBeNull();
    expect(checkPost("a".repeat(301), [])).toBe("too_long");
    expect(checkPost("👨‍👩‍👧".repeat(200), [])).toBe("too_long");
    expect(checkPost("hi", Array(5).fill("https://example.com/a.png"))).toBe("too_many_images");
    expect(checkPost("hi", ["http://example.com/a.png"])).toBe("invalid_media");
    expect(checkPost("hi", ["https://"])).toBe("invalid_media");
  });

  it("counts graphemes on Bluesky and code points elsewhere, as brain does", () => {
    expect(charCount("bluesky", "é")).toBe(1);
    expect(charCount("threads", "é")).toBe(2);
    expect(charCount("instagram", "🦀")).toBe(1);
  });

  it("applies each platform's limits from brain", () => {
    const img = (n: number) => Array(n).fill("https://example.com/a.jpg");
    expect(limits).toEqual({
      bluesky: { chars: 300, media: 4, thread: true },
      threads: { chars: 500, media: 20, thread: true },
      linkedin: { chars: 3000, media: 20, thread: false },
      facebook: { chars: 63_206, media: 10, thread: false },
      instagram: { chars: 2200, media: 10, thread: false },
    });
    expect(checkPost("a".repeat(500), [], "threads")).toBeNull();
    expect(checkPost("a".repeat(501), [], "threads")).toBe("too_long");
    expect(checkPost("x", img(20), "threads")).toBeNull();
    expect(checkPost("x", img(21), "threads")).toBe("too_many_images");
    expect(checkPost("a".repeat(3000), img(20), "linkedin")).toBeNull();
    expect(checkPost("a".repeat(3001), [], "linkedin")).toBe("too_long");
    expect(checkPost("x", img(21), "linkedin")).toBe("too_many_images");
    expect(checkPost("a".repeat(63_206), img(10), "facebook")).toBeNull();
    expect(checkPost("a".repeat(63_207), [], "facebook")).toBe("too_long");
    expect(checkPost("x", img(11), "facebook")).toBe("too_many_images");
    expect(checkPost("no picture", [], "instagram")).toBe("media_required");
    expect(checkPost("", img(1), "instagram")).toBeNull();
    expect(checkPost(" ", [], "instagram")).toBe("empty_post");
    expect(checkPost("a".repeat(2200), img(10), "instagram")).toBeNull();
    expect(checkPost("a".repeat(2201), img(1), "instagram")).toBe("too_long");
    // A long Instagram caption without media: brain answers media_required first.
    expect(checkPost("a".repeat(2201), [], "instagram")).toBe("media_required");
  });

  it("allows threads only on Bluesky and Threads", () => {
    const part = [{ body: "two", media: ["https://example.com/a.jpg"] }];
    expect(checkThread("hi", [], part, "threads")).toBeNull();
    expect(checkThread("hi", [], [{ body: "a".repeat(501), media: [] }], "threads")).toEqual({ failure: "too_long", part: 1 });
    expect(checkThread("hi", [], part, "facebook")).toEqual({ failure: "thread_not_supported" });
    expect(checkThread("hi", [], part, "linkedin")).toEqual({ failure: "thread_not_supported" });
    expect(checkThread("hi", ["https://example.com/a.jpg"], part, "instagram")).toEqual({ failure: "thread_not_supported" });
    expect(checkThread("hi", [], [], "facebook")).toBeNull();
  });

  it("checks every post of a thread and names the follow-up at fault", () => {
    expect(checkThread("hi", [], [{ body: "two", media: [] }])).toBeNull();
    expect(checkThread("", [], [{ body: "two", media: [] }])).toEqual({ failure: "empty_post" });
    expect(checkThread("hi", [], [{ body: "ok", media: [] }, { body: " ", media: [] }])).toEqual({ failure: "empty_post", part: 2 });
    expect(checkThread("hi", [], Array(26).fill({ body: "x", media: [] }))).toEqual({ failure: "too_many_parts" });
  });
});

describe("dates", () => {
  it("round-trips datetime-local values through ISO UTC", () => {
    const iso = fromLocalInput("2026-11-20T09:30")!;
    expect(new Date(iso).getHours()).toBe(9);
    expect(toLocalInput(iso)).toBe("2026-11-20T09:30");
    expect(fromLocalInput("")).toBeNull();
    expect(toLocalInput(null)).toBe("");
  });

  it("builds a month range and Monday-first weeks", () => {
    const { from, to } = monthRange(2026, 10);
    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(to).getMonth()).toBe(11);
    const weeks = monthWeeks(2026, 10); // November 2026 starts on a Sunday.
    expect(weeks[0]!.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(weeks[0]![6]!.getDate()).toBe(1);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});
