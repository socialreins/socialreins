import { afterEach, describe, expect, it, vi } from "vitest";
import {
  charCount,
  checkComment,
  checkCover,
  checkMediaTypes,
  checkPost,
  coverTypeHint,
  checkThread,
  checkTikTok,
  createPost,
  createPostGroup,
  limits,
  deletePost,
  fromLocalInput,
  getPost,
  getTikTokCreator,
  graphemes,
  listPosts,
  mergeCreators,
  monthRange,
  noTikTok,
  monthWeeks,
  publishPost,
  takeDownAll,
  toLocalInput,
  updatePost,
  utf8Bytes,
  xWeight,
  youtubeText,
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
    [422, "first_comment_not_supported"],
    [422, "first_comment_too_long"],
    [422, "cover_not_supported"],
    [422, "invalid_cover"],
    [422, "cover_needs_one_video"],
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

describe("take down all", () => {
  // Answers each DELETE from `answers` by post id and records the order and any overlap.
  function brain(answers: Record<string, () => Response>) {
    const calls: string[] = [];
    let open = 0;
    let overlap = false;
    vi.stubGlobal("fetch", async (url: string) => {
      const id = url.split("/").at(-1)!;
      calls.push(id);
      overlap ||= ++open > 1;
      await new Promise((r) => setTimeout(r, 1));
      open--;
      return answers[id]!();
    });
    return { calls, overlapped: () => overlap };
  }
  const gone = () => Response.json({ id: "x", status: "deleted" });

  it("takes the posts down one after another, in order", async () => {
    const b = brain({ a: gone, b: gone, c: gone });
    expect(await takeDownAll(["a", "b", "c"])).toEqual([
      { id: "a", state: "down" },
      { id: "b", state: "down" },
      { id: "c", state: "down" },
    ]);
    expect(b.calls).toEqual(["a", "b", "c"]);
    expect(b.overlapped()).toBe(false);
  });

  it("keeps going after a failure and reports each post", async () => {
    brain({
      a: () => Response.json({ error: "takedown_failed", message: "Revoked." }, { status: 422 }),
      b: () => Response.json({ error: "not_found" }, { status: 404 }),
      c: () => Response.json({ error: "not_deletable" }, { status: 409 }),
      d: gone,
    });
    expect(await takeDownAll(["a", "b", "c", "d"])).toEqual([
      { id: "a", state: "failed", message: "Revoked." },
      { id: "b", state: "gone" },
      { id: "c", state: "failed", failure: "not_deletable" },
      { id: "d", state: "down" },
    ]);
  });

  it("stops at brain's rate limit and leaves the rest waiting", async () => {
    const b = brain({ a: gone, b: () => Response.json({ error: "rate_limited" }, { status: 429 }), c: gone });
    expect(await takeDownAll(["a", "b", "c"])).toEqual([
      { id: "a", state: "down" },
      { id: "b", state: "waiting" },
      { id: "c", state: "waiting" },
    ]);
    expect(b.calls).toEqual(["a", "b"]);
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
      bluesky: { chars: 300, media: 4, thread: true, comment: null, cover: false },
      threads: { chars: 500, media: 20, thread: true, comment: null, cover: false },
      linkedin: { chars: 3000, media: 20, thread: false, comment: 1250, cover: false },
      facebook: { chars: 63_206, media: 10, thread: false, comment: 8000, cover: true },
      instagram: { chars: 2200, media: 20, thread: false, comment: 2200, cover: true },
      youtube: { chars: 100, media: 1, thread: false, comment: 10_000, cover: true },
      x: { chars: 280, media: 4, thread: true, comment: null, cover: false },
      tiktok: { chars: 2200, media: 35, thread: false, comment: null, cover: false },
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
    expect(checkPost("a".repeat(2200), img(20), "instagram")).toBeNull();
    expect(checkPost("x", img(21), "instagram")).toBe("too_many_images");
    expect(checkPost("a".repeat(2201), img(1), "instagram")).toBe("too_long");
    expect(checkPost("a".repeat(2200), img(35), "tiktok")).toBeNull();
    expect(checkPost("", img(1), "tiktok")).toBeNull();
    expect(checkPost("a".repeat(2201), img(1), "tiktok")).toBe("too_long");
    expect(checkPost("x", img(36), "tiktok")).toBe("too_many_images");
    // TikTok counts UTF-16 code units: an emoji is two.
    expect(checkPost("🙂".repeat(1100), img(1), "tiktok")).toBeNull();
    expect(checkPost("🙂".repeat(1101), img(1), "tiktok")).toBe("too_long");
    expect(checkPost("a caption", [], "tiktok")).toBe("media_required");
    expect(checkPost(" ", [], "tiktok")).toBe("empty_post");
    // A long Instagram caption without media: brain answers media_required first.
    expect(checkPost("a".repeat(2201), [], "instagram")).toBe("media_required");
  });

  it("counts an X post's weight as brain does: links 23, CJK and emoji 2", () => {
    expect(xWeight("hello")).toBe(5);
    expect(xWeight("é ü")).toBe(3);
    expect(xWeight("日本")).toBe(4);
    expect(xWeight("🙂")).toBe(2);
    expect(xWeight("https://example.com/a/very/long/path?x=1")).toBe(23);
    expect(xWeight("http://a.co")).toBe(23);
    expect(xWeight("see https://example.com.")).toBe(4 + 23 + 1);
    expect(xWeight("example.com/x")).toBe(23);
    expect(xWeight("e.g. this")).toBe(9);
    expect(xWeight("a\nb  c")).toBe(6);
    expect(charCount("x", "日本")).toBe(4);
  });

  it("takes 280 weighted characters, 4 images and threads on X", () => {
    const img = (n: number) => Array(n).fill("https://example.com/a.jpg");
    expect(checkPost("a".repeat(280), [], "x")).toBeNull();
    expect(checkPost("a".repeat(281), [], "x")).toBe("too_long");
    expect(checkPost("日".repeat(140), [], "x")).toBeNull();
    expect(checkPost("日".repeat(141), [], "x")).toBe("too_long");
    const link = (n: number) => `${"a".repeat(n)} https://example.com/${"b".repeat(80)}`;
    expect(checkPost(link(256), [], "x")).toBeNull();
    expect(checkPost(link(257), [], "x")).toBe("too_long");
    expect(checkPost("x", img(4), "x")).toBeNull();
    expect(checkPost("x", img(5), "x")).toBe("too_many_images");
    expect(checkPost("", img(1), "x")).toBeNull();
    expect(checkPost(" ", [], "x")).toBe("empty_post");
    expect(checkThread("one", [], [{ body: "two", media: img(4) }], "x")).toBeNull();
    expect(checkThread("one", [], [{ body: "two", media: [] }, { body: "a".repeat(281), media: [] }], "x")).toEqual({
      failure: "too_long",
      part: 2,
    });
  });

  it("takes one video on YouTube, titled by the first line", () => {
    const video = (n: number) => Array(n).fill("https://example.com/a.mp4");
    expect(youtubeText("  Title \n\n rest\nmore \n")).toEqual({ title: "Title", description: "rest\nmore" });
    expect(youtubeText("Only a title")).toEqual({ title: "Only a title", description: "" });
    expect(checkPost("Title\nAbout it", video(1), "youtube")).toBeNull();
    // Brain's order: a body, a video, the text, the length, the count.
    expect(checkPost("", video(1), "youtube")).toBe("empty_post");
    expect(checkPost(" \n ", video(1), "youtube")).toBe("empty_post");
    expect(checkPost("Title", [], "youtube")).toBe("media_required");
    expect(checkPost("a <b> c", video(1), "youtube")).toBe("invalid_text");
    expect(checkPost("T\n1 > 0", video(1), "youtube")).toBe("invalid_text");
    expect(checkPost("é".repeat(100), video(1), "youtube")).toBeNull();
    expect(checkPost("é".repeat(101), video(1), "youtube")).toBe("too_long");
    expect(checkPost(`T\n${"a".repeat(5000)}`, video(1), "youtube")).toBeNull();
    expect(checkPost(`T\n${"a".repeat(5001)}`, video(1), "youtube")).toBe("too_long");
    // The description counts bytes, the title characters.
    expect(checkPost(`T\n${"é".repeat(2501)}`, video(1), "youtube")).toBe("too_long");
    expect(checkPost("Title", video(2), "youtube")).toBe("too_many_images");
    expect(charCount("youtube", "Title\nThe description is long")).toBe(5);
    expect(checkThread("Title", video(1), [{ body: "two", media: [] }], "youtube")).toEqual({ failure: "thread_not_supported" });
  });

  it("checks a first comment as brain does: four platforms, each with its limit, blank is none", () => {
    for (const p of ["bluesky", "threads", "x", "tiktok"] as const) {
      expect(limits[p].comment).toBeNull();
      expect(checkComment("sources", p)).toBe("first_comment_not_supported");
      expect(checkComment("  \n", p)).toBeNull();
    }
    for (const [p, max] of [["facebook", 8000], ["instagram", 2200], ["linkedin", 1250], ["youtube", 10_000]] as const) {
      expect(limits[p].comment).toBe(max);
      expect(checkComment("é".repeat(max), p)).toBeNull();
      expect(checkComment("é".repeat(max + 1), p)).toBe("first_comment_too_long");
    }
    // Code points, as brain counts characters: an emoji is one.
    expect(checkComment("🙂".repeat(1250), "linkedin")).toBeNull();
  });

  it("checks a cover as brain does: three platforms, a public https link, exactly one media item, blank is none", () => {
    const link = "https://example.com/cover.jpg";
    for (const p of ["bluesky", "threads", "linkedin", "x", "tiktok"] as const) {
      expect(limits[p].cover).toBe(false);
      expect(checkCover(link, p, 1)).toBe("cover_not_supported");
      expect(checkCover("  ", p, 0)).toBeNull();
    }
    for (const p of ["facebook", "instagram", "youtube"] as const) {
      expect(limits[p].cover).toBe(true);
      expect(checkCover(` ${link} `, p, 1)).toBeNull();
      expect(checkCover("http://example.com/cover.jpg", p, 1)).toBe("invalid_cover");
      expect(checkCover("not a link", p, 1)).toBe("invalid_cover");
      expect(checkCover(link, p, 0)).toBe("cover_needs_one_video");
      expect(checkCover(link, p, 2)).toBe("cover_needs_one_video");
    }
  });

  it("hints at media types by link, never blocking a save, and leaves links without an extension to brain", () => {
    const u = (...names: string[]) => names.map((n) => `https://cdn.example/${n}`);
    expect(checkMediaTypes(u("clip.mp4", "a.jpg"), "tiktok")).toBe("mixed_media");
    // brain turns a PNG into a JPEG for TikTok and Instagram.
    expect(checkMediaTypes(u("a.png"), "tiktok")).toBeNull();
    expect(checkMediaTypes(u("a.gif"), "tiktok")).toBe("media_type_not_supported");
    expect(checkMediaTypes(u("a.jpg", "b.webp"), "tiktok")).toBeNull();
    expect(checkMediaTypes(u("a.png", "clip.MP4?dl=1"), "bluesky")).toBe("mixed_media");
    expect(checkMediaTypes(u("a.gif", "b.jpg"), "x")).toBe("mixed_media");
    expect(checkMediaTypes(u("doc.pdf"), "facebook")).toBe("media_type_not_supported");
    expect(checkMediaTypes(u("doc.pdf"), "linkedin")).toBeNull();
    expect(checkMediaTypes(u("doc.pdf", "a.jpg"), "linkedin")).toBe("mixed_media");
    expect(checkMediaTypes(u("clip.mov"), "linkedin")).toBe("media_type_not_supported");
    expect(checkMediaTypes(u("clip.mp4", "a.png"), "threads")).toBeNull();
    expect(checkMediaTypes(u("a.png", "b.webp"), "instagram")).toBeNull();
    expect(checkMediaTypes(u("a.gif"), "instagram")).toBe("media_type_not_supported");
    // No extension (a Drive link) or an unknown one: brain probes the file.
    const drive = "https://drive.google.com/file/d/1AbC/view?usp=sharing";
    expect(checkMediaTypes([drive, ...u("clip.mp4")], "bluesky")).toBe("mixed_media");
    expect(checkMediaTypes([drive, drive], "tiktok")).toBeNull();
    // Hints only: a save is never blocked by an extension, since brain reads the bytes.
    expect(checkPost("hi", u("a.gif"), "tiktok")).toBeNull();
    expect(checkPost("hi", u("clip.mp4", "a.jpg"), "bluesky")).toBeNull();
    expect(checkThread("hi", [], [{ body: "two", media: u("doc.pdf") }], "bluesky")).toBeNull();
    expect(checkCover("https://cdn.example/c.gif", "instagram", 1)).toBeNull();
    expect(coverTypeHint("https://cdn.example/c.png", "instagram")).toBeNull();
    expect(coverTypeHint("https://cdn.example/c.gif", "instagram")).toBe("invalid_cover_type");
    expect(coverTypeHint("https://cdn.example/c.png", "youtube")).toBeNull();
    expect(coverTypeHint("https://cdn.example/c.webp", "facebook")).toBe("invalid_cover_type");
  });

  it("checks TikTok settings as brain does", () => {
    const t = (patch: Partial<typeof noTikTok>) => checkTikTok({ ...noTikTok, ...patch });
    expect(t({})).toBe("tiktok_privacy_required");
    expect(t({ privacy_level: "EVERYONE" })).toBe("invalid_tiktok_privacy");
    expect(t({ privacy_level: "SELF_ONLY" })).toBeNull();
    expect(t({ privacy_level: "SELF_ONLY", your_brand: true })).toBe("invalid_tiktok_disclosure");
    expect(t({ privacy_level: "SELF_ONLY", commercial_content: true })).toBe("tiktok_disclosure_incomplete");
    expect(t({ privacy_level: "SELF_ONLY", commercial_content: true, your_brand: true })).toBeNull();
    expect(t({ privacy_level: "SELF_ONLY", commercial_content: true, branded_content: true })).toBe("tiktok_branded_content_private");
    expect(t({ privacy_level: "PUBLIC_TO_EVERYONE", commercial_content: true, your_brand: true, branded_content: true })).toBeNull();
  });

  it("reads an account's creator info and merges several accounts", async () => {
    const creator = {
      nickname: "Ann",
      username: "ann",
      privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
      comment_disabled: false,
      duet_disabled: false,
      stitch_disabled: false,
      max_video_post_duration_sec: 600,
      can_post: true,
      reason: null,
    };
    const fetch = reply(200, creator);
    vi.stubGlobal("fetch", fetch);
    expect(await getTikTokCreator("a/1")).toEqual(creator);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/connections/a%2F1/tiktok`);
    vi.stubGlobal("fetch", reply(409, { error: "reconnect_required" }));
    expect(await getTikTokCreator("a1")).toBe("reconnect_required");

    const other = { ...creator, nickname: "Bob", privacy_level_options: ["SELF_ONLY"], duet_disabled: true, max_video_post_duration_sec: 180 };
    expect(mergeCreators([creator, other])).toMatchObject({
      nickname: "Ann, Bob",
      privacy_level_options: ["SELF_ONLY"],
      duet_disabled: true,
      max_video_post_duration_sec: 180,
      can_post: true,
    });
    expect(mergeCreators([creator, { ...other, can_post: false, reason: "Limit." }])).toMatchObject({ can_post: false, reason: "Limit." });
    expect(mergeCreators([])).toMatchObject({ can_post: false, privacy_level_options: [] });
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
