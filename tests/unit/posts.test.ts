import { afterEach, describe, expect, it, vi } from "vitest";
import {
  altList,
  capAlt,
  keepsAlt,
  altMap,
  altOut,
  isImageLink,
  charCount,
  checkComment,
  checkCover,
  checkMediaTypes,
  checkPost,
  overLimit,
  coverTypeHint,
  charLimit,
  checkThread,
  checkTikTok,
  createPost,
  createPostGroup,
  limits,
  deletePost,
  fromLocalInput,
  fromZoneInput,
  moveToZoneDay,
  inZone,
  getPost,
  getTikTokCreator,
  graphemes,
  listPosts,
  mergeCreators,
  monthRange,
  noTikTok,
  noRepeat,
  repeatForm,
  repeatRule,
  repeatSummary,
  untilUtc,
  monthWeeks,
  publishPost,
  takeDownGroup,
  toLocalInput,
  toZoneInput,
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

describe("take down group", () => {
  it("posts once to the group's take down and returns each platform's result", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push(`${init.method} ${url}`);
      return Response.json({ group_id: "g 1", posts: [], results: [{ post_id: "a", platform: "bluesky", state: "taken_down", message: null }] });
    });
    expect(await takeDownGroup("g 1")).toEqual({ group_id: "g 1", posts: [], results: [{ post_id: "a", platform: "bluesky", state: "taken_down", message: null }] });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^POST .*\/v1\/post-groups\/g%201\/takedown$/);
  });

  it("maps brain's rate limit and a missing group to failures", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "rate_limited" }, { status: 429 }));
    expect(await takeDownGroup("g")).toBe("rate_limited");
    vi.stubGlobal("fetch", async () => Response.json({ error: "not_found" }, { status: 404 }));
    expect(await takeDownGroup("g")).toBe("not_found");
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

  it("converts wall times in a set's zone, across DST", () => {
    // New York is UTC-4 in summer and UTC-5 in winter.
    expect(fromZoneInput("2026-07-01T09:30", "America/New_York")).toBe("2026-07-01T13:30:00.000Z");
    expect(fromZoneInput("2026-12-01T09:30", "America/New_York")).toBe("2026-12-01T14:30:00.000Z");
    expect(toZoneInput("2026-07-01T13:30:00.000Z", "America/New_York")).toBe("2026-07-01T09:30");
    expect(toZoneInput("2026-11-20T09:30:00Z", "Asia/Dhaka")).toBe("2026-11-20T15:30");
    // The day the clocks go forward (8 March 2026), either side of the jump.
    expect(fromZoneInput("2026-03-08T01:30", "America/New_York")).toBe("2026-03-08T06:30:00.000Z");
    expect(fromZoneInput("2026-03-08T03:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
  });

  it("moves a skipped time forward and takes the first of a repeated one, in every zone", () => {
    // Gaps: New York 8 March 02:00 to 03:00, London 29 March 01:00 to 02:00, Sydney 4 October 02:00 to 03:00.
    expect(fromZoneInput("2026-03-08T02:30", "America/New_York")).toBe("2026-03-08T07:00:00.000Z");
    expect(toZoneInput("2026-03-08T07:00:00.000Z", "America/New_York")).toBe("2026-03-08T03:00");
    expect(fromZoneInput("2026-03-29T01:30", "Europe/London")).toBe("2026-03-29T01:00:00.000Z");
    expect(toZoneInput("2026-03-29T01:00:00.000Z", "Europe/London")).toBe("2026-03-29T02:00");
    expect(fromZoneInput("2026-10-04T02:30", "Australia/Sydney")).toBe("2026-10-03T16:00:00.000Z");
    expect(toZoneInput("2026-10-03T16:00:00.000Z", "Australia/Sydney")).toBe("2026-10-04T03:00");
    // Overlaps, the first (summer time) occurrence: New York 1 November, London 25 October, Sydney 5 April.
    expect(fromZoneInput("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
    expect(fromZoneInput("2026-10-25T01:30", "Europe/London")).toBe("2026-10-25T00:30:00.000Z");
    expect(fromZoneInput("2026-04-05T02:30", "Australia/Sydney")).toBe("2026-04-04T15:30:00.000Z");
    // Next to a change, an ordinary time is itself.
    expect(fromZoneInput("2026-10-04T03:30", "Australia/Sydney")).toBe("2026-10-03T16:30:00.000Z");
    expect(fromZoneInput("2026-03-29T00:30", "Europe/London")).toBe("2026-03-29T00:30:00.000Z");
  });

  it("reads a post's day and time in its set's zone, whatever the browser's", () => {
    // 22:00 UTC on 11 November is 09:00 on the 12th in Sydney.
    const d = inZone(new Date("2026-11-11T22:00:00Z"), "Australia/Sydney");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 12, 9, 0]);
    expect(inZone(new Date("2026-11-11T22:00:00Z"))).toEqual(new Date("2026-11-11T22:00:00Z"));
  });

  it("moves a post to another day at the same wall time in the set's zone", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    // 09:00 in Dhaka (UTC+6) on 10 March, moved to 12 March, stays 09:00 there whatever the browser's zone.
    const to = moveToZoneDay(new Date("2026-03-10T03:00:00Z"), new Date(2026, 2, 12), "Asia/Dhaka", now);
    expect(to?.toISOString()).toBe("2026-03-12T03:00:00.000Z");
    // Across New York's spring change, 09:00 stays 09:00.
    const ny = moveToZoneDay(new Date("2026-03-06T14:00:00Z"), new Date(2026, 2, 9), "America/New_York", now);
    expect(ny?.toISOString()).toBe("2026-03-09T13:00:00.000Z");
    expect(moveToZoneDay(new Date("2026-03-06T14:00:00Z"), new Date(2025, 0, 1), "UTC", now)).toBeNull();
    expect(fromZoneInput("2026-11-20T09:30", "UTC")).toBe("2026-11-20T09:30:00.000Z");
    expect(fromZoneInput("", "UTC")).toBeNull();
    expect(toZoneInput(null, "UTC")).toBe("");
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

describe("sizeHint", () => {
  it("names only the limits of the platforms given", async () => {
    const { sizeHint } = await import("@/lib/posts");
    expect(sizeHint(["threads", "instagram"])).toBe("Size limits: a video up to 1 GB; an image or PDF up to 100 MB. Sizes are checked when you save.");
    expect(sizeHint(["bluesky", "threads", "x"])).toBe(
      "Size limits: a video up to 1 GB (100 MB on Bluesky, 512 MB on X); an image or PDF up to 100 MB (a photo too large for a network is made smaller for you); a GIF up to 1 MB on Bluesky, 15 MB on X. Sizes are checked when you save.",
    );
    expect(sizeHint(["bluesky"])).toBe("Size limits: a video up to 100 MB on Bluesky; an image or PDF up to 100 MB (a photo too large for a network is made smaller for you); a GIF up to 1 MB on Bluesky. Sizes are checked when you save.");
  });
});

describe("rows", () => {
  it("puts the versions of one group that share the key in one row and leaves the rest alone", async () => {
    const { rows } = await import("@/lib/posts");
    const p = (id: string, group_id: string | null, status = "draft") => ({ id, group_id, status }) as Parameters<typeof rows>[0][number];
    const list = [p("a", "g1"), p("b", null), p("c", "g1"), p("d", "g1", "published"), p("e", "g2"), p("f", null)];
    expect(rows(list, (x) => x.status).map((r) => r.map((x) => x.id))).toEqual([["a", "c"], ["b"], ["d"], ["e"], ["f"]]);
  });
});

describe("public page text", () => {
  it("splits text on its links, leaving closing punctuation outside", async () => {
    const { linked } = await import("@/lib/posts");
    expect(linked("See https://example.com/a. Then (https://en.wikipedia.org/wiki/Foo_(bar)), HTTPS://X.test/b!")).toEqual([
      "See ",
      "https://example.com/a",
      ". Then (",
      "https://en.wikipedia.org/wiki/Foo_(bar)",
      "), ",
      "HTTPS://X.test/b",
      "!",
    ]);
    expect(linked("no links, javascript:alert(1) data:text/html,x")).toEqual(["no links, javascript:alert(1) data:text/html,x"]);
    // Every odd entry is a link and starts with http.
    expect(linked("https://a.test https://b.test").filter((_, i) => i % 2)).toEqual(["https://a.test", "https://b.test"]);
  });

  it("turns media links into pictures or link buttons for the public page", async () => {
    const { pageMedia } = await import("@/lib/posts");
    const thumb = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
    expect(
      pageMedia([
        "https://e.test/a.JPG?x=1",
        "https://drive.google.com/file/d/abc_D-1/view?usp=sharing",
        "https://drive.google.com/open?id=xyz",
        "https://drive.google.com/uc?id=uc1&export=download",
        "https://www.dropbox.com/scl/fi/k1/photo.png?rlkey=r&dl=0",
        "https://dropbox.com/s/k2/pic.webp?dl=1",
        "https://www.dropbox.com/scl/fi/k3/clip.mp4?dl=0",
        "https://e.test/c.MOV",
        "https://e.test/doc.pdf",
        "https://e.test/c.webm#t=1",
      ]),
    ).toEqual([
      { kind: "image", src: "https://e.test/a.JPG?x=1" },
      { kind: "image", src: thumb("abc_D-1"), href: "https://drive.google.com/file/d/abc_D-1/view?usp=sharing" },
      { kind: "image", src: thumb("xyz"), href: "https://drive.google.com/open?id=xyz" },
      { kind: "image", src: thumb("uc1"), href: "https://drive.google.com/uc?id=uc1&export=download" },
      { kind: "image", src: "https://www.dropbox.com/scl/fi/k1/photo.png?rlkey=r&raw=1", href: "https://www.dropbox.com/scl/fi/k1/photo.png?rlkey=r&dl=0" },
      { kind: "image", src: "https://dropbox.com/s/k2/pic.webp?raw=1", href: "https://dropbox.com/s/k2/pic.webp?dl=1" },
      { kind: "link", href: "https://www.dropbox.com/scl/fi/k3/clip.mp4?dl=0", label: "Open the video" },
      { kind: "link", href: "https://e.test/c.MOV", label: "Open the video" },
      { kind: "link", href: "https://e.test/doc.pdf", label: "Open the file" },
      { kind: "link", href: "https://e.test/c.webm#t=1", label: "Open the video" },
    ]);
  });

  it("drops hostile and non-https media and never builds a thumbnail without a clean Drive id", async () => {
    const { pageMedia } = await import("@/lib/posts");
    expect(pageMedia(["javascript:alert(1)//.png", "data:image/png;base64,AA.png", "http://e.test/a.png", "not a url", ""])).toEqual([]);
    expect(pageMedia(["https://drive.google.com/file/d/", "https://drive.google.com/open", "https://drive.google.com/open?id=a%22b", "https://drive.google.com/drive/folders/f.png"])).toEqual([
      { kind: "link", href: "https://drive.google.com/file/d/", label: "Open the file" },
      { kind: "link", href: "https://drive.google.com/open", label: "Open the file" },
      { kind: "link", href: "https://drive.google.com/open?id=a%22b", label: "Open the file" },
      { kind: "link", href: "https://drive.google.com/drive/folders/f.png", label: "Open the file" },
    ]);
    // A look-alike host is no Drive link, and a Dropbox page that is not a share stays a link.
    expect(pageMedia(["https://drive.google.com.evil.test/file/d/x/view", "https://www.dropbox.com/home/a.png"])).toEqual([
      { kind: "link", href: "https://drive.google.com.evil.test/file/d/x/view", label: "Open the file" },
      { kind: "link", href: "https://www.dropbox.com/home/a.png", label: "Open the file" },
    ]);
  });

  it("builds a public page's link preview", async () => {
    const { pageMeta } = await import("@/lib/posts");
    const post = { team: "Acme", body: "", media: [], thread: [], details: "", published_at: "2026-11-03T08:00:00Z", links: [] };
    expect(pageMeta(post)).toEqual({
      title: "A post by Acme",
      description: undefined,
      robots: { index: false },
      openGraph: { title: "A post by Acme", description: undefined, type: "article", images: undefined },
      twitter: { card: "summary", title: "A post by Acme", description: undefined, images: undefined },
    });
    const long = pageMeta({ ...post, body: `${"a".repeat(80)}\n${"b ".repeat(150)}`, media: ["https://e.test/c.mp4"], thread: [{ body: "", media: ["https://drive.google.com/file/d/id1/view"] }] });
    expect([...String(long.title)]).toHaveLength(70);
    expect(String(long.title).endsWith("\u2026")).toBe(true);
    expect([...String(long.description)]).toHaveLength(200);
    expect(long.openGraph).toMatchObject({ images: ["https://drive.google.com/thumbnail?id=id1&sz=w1600"] });
    expect(long.twitter).toMatchObject({ card: "summary_large_image", images: ["https://drive.google.com/thumbnail?id=id1&sz=w1600"] });
    // One line: the details describe it.
    expect(pageMeta({ ...post, body: "Launch day", details: "Slides:\nhttps://e.test/s" })).toMatchObject({ title: "Launch day", description: "Slides: https://e.test/s" });
  });
});

describe("X post length by plan", () => {
  it("holds X to 280 unless the accounts take long posts", () => {
    expect(charLimit("x")).toBe(280);
    expect(charLimit("x", true)).toBe(25_000);
    expect(charLimit("bluesky", true)).toBe(300);
    expect(checkPost("a".repeat(281), [], "x")).toBe("too_long");
    expect(checkPost("a".repeat(281), [], "x", true)).toBeNull();
    expect(checkPost("a".repeat(25_001), [], "x", true)).toBe("too_long");
    expect(overLimit("x", "a".repeat(300), true)).toBe(false);
    expect(overLimit("x", "a".repeat(300))).toBe(true);
  });

  it("applies the long limit to every thread part", () => {
    const parts = [{ body: "a".repeat(400), media: [] }];
    expect(checkThread("one", [], parts, "x")).toEqual({ failure: "too_long", part: 1 });
    expect(checkThread("one", [], parts, "x", true)).toBeNull();
  });
});

describe("post list filters", () => {
  it("reads the URL, dropping values brain doesn't know, and writes back only what is set", async () => {
    const { parseFilters, filterQuery } = await import("@/lib/posts");
    const f = parseFilters(new URLSearchParams("q=%20Launch%20&status=failed&network=x"));
    expect(f).toEqual({ q: "Launch", status: "failed", network: "x", approval: "all" });
    expect(filterQuery(f)).toBe("?q=Launch&status=failed&network=x");
    expect(parseFilters(new URLSearchParams("status=nope&network=myspace"))).toEqual({ q: "", status: "all", network: "all", approval: "all" });
    expect(filterQuery({ q: "", status: "all", network: "all", approval: "all" })).toBe("");
    expect(parseFilters(new URLSearchParams("approval=pending")).approval).toBe("pending");
    expect(parseFilters(new URLSearchParams("approval=approved")).approval).toBe("all");
    expect(filterQuery({ q: "", status: "all", network: "all", approval: "rejected" })).toBe("?approval=rejected");
  });

  it("matches a row on its text, status and any version's network, skipping one filter for counts", async () => {
    const { matchesFilters } = await import("@/lib/posts");
    type Row = Parameters<typeof matchesFilters>[0];
    const row = [
      { body: "Launch DAY", status: "failed", platform: "bluesky" },
      { body: "Launch DAY", status: "failed", platform: "x" },
    ] as Row;
    expect(matchesFilters(row, { q: "launch day", status: "failed", network: "x", approval: "all" })).toBe(true);
    expect(matchesFilters(row, { q: "other", status: "all", network: "all", approval: "all" })).toBe(false);
    expect(matchesFilters(row, { q: "", status: "published", network: "all", approval: "all" })).toBe(false);
    expect(matchesFilters(row, { q: "", status: "published", network: "all", approval: "all" }, "status")).toBe(true);
    expect(matchesFilters(row, { q: "", status: "all", network: "threads", approval: "all" })).toBe(false);
    expect(matchesFilters(row, { q: "", status: "all", network: "threads", approval: "all" }, "network")).toBe(true);
  });

  it("says a scheduled post waits for approval and a rejected one needs changes, and filters on it", async () => {
    const { approvalState, matchesFilters } = await import("@/lib/posts");
    type P = Parameters<typeof approvalState>[0];
    const post = (status: string, approval: string | null) => ({ body: "", status, platform: "x", approval }) as P;
    expect(approvalState(post("scheduled", "pending"))).toBe("pending");
    expect(approvalState(post("draft", "pending"))).toBeNull();
    expect(approvalState(post("scheduled", "rejected"))).toBe("rejected");
    expect(approvalState(post("draft", "rejected"))).toBe("rejected");
    expect(approvalState(post("published", "rejected"))).toBeNull();
    expect(approvalState(post("scheduled", "approved"))).toBeNull();
    expect(approvalState(post("scheduled", null))).toBeNull();
    const all = { q: "", status: "all", network: "all" } as const;
    expect(matchesFilters([post("scheduled", "pending")], { ...all, approval: "pending" })).toBe(true);
    expect(matchesFilters([post("scheduled", "approved")], { ...all, approval: "pending" })).toBe(false);
    expect(matchesFilters([post("scheduled", "approved")], { ...all, approval: "pending" }, "approval")).toBe(true);
  });

  it("approves one post at its own address and a group at the group's, sending a note only when there is one", async () => {
    const { decidePost } = await import("@/lib/posts");
    const calls: { url: string; body: unknown }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      const group = String(url).includes("post-groups");
      if (String(url).endsWith("/p9/approve")) return new Response(JSON.stringify({ error: "not_awaiting_approval" }), { status: 409 });
      return new Response(JSON.stringify(group ? { posts: [{ id: "a" }, { id: "b" }] } : { id: "p1" }));
    }) as typeof fetch;
    try {
      expect(await decidePost({ id: "p1", group_id: null }, "approve")).toEqual([{ id: "p1" }]);
      expect(await decidePost({ id: "a", group_id: "g1" }, "reject", " Fix the link ")).toEqual([{ id: "a" }, { id: "b" }]);
      expect(await decidePost({ id: "p9", group_id: null }, "approve")).toBe("not_awaiting_approval");
    } finally {
      globalThis.fetch = real;
    }
    expect(calls.map((c) => c.url.replace(/^.*\/v1/, ""))).toEqual(["/posts/p1/approve", "/post-groups/g1/reject", "/posts/p9/approve"]);
    expect(calls.map((c) => c.body)).toEqual([{}, { note: "Fix the link" }, {}]);
  });
});

describe("repeat", () => {
  const form = { ...noRepeat };
  it("says the rule in plain words", () => {
    expect(repeatSummary({ every: "day", interval: 1, until: null, remaining: null })).toBe("Repeats every day");
    expect(repeatSummary({ every: "week", interval: 2, until: null, remaining: 5 })).toBe("Repeats every 2 weeks, 5 more times");
    expect(repeatSummary({ every: "week", interval: 1, until: null, remaining: 1 })).toBe("Repeats every week, 1 more time");
    expect(repeatSummary({ every: "month", interval: 1, until: untilUtc("2026-12-31"), remaining: null })).toBe("Repeats every month until Dec 31, 2026");
  });
  it("maps the form to brain's rule", () => {
    expect(repeatRule(form)).toBeNull();
    expect(repeatRule({ ...form, every: "week" })).toEqual({ every: "week", interval: 1, until: null, remaining: null });
    expect(repeatRule({ ...form, every: "custom", unit: "month", interval: "3", ends: "count", count: "7" })).toEqual({ every: "month", interval: 3, until: null, remaining: 7 });
    expect(repeatRule({ ...form, every: "day", ends: "date", until: "2026-12-31", count: "9" })).toEqual({ every: "day", interval: 1, until: untilUtc("2026-12-31"), remaining: null });
    // Out of range or blank numbers are kept within brain's limits; a missing date never ends.
    expect(repeatRule({ ...form, every: "custom", unit: "day", interval: "40", ends: "count", count: "" })).toEqual({ every: "day", interval: 12, until: null, remaining: 1 });
    expect(repeatRule({ ...form, every: "day", ends: "date", until: "" })).toEqual({ every: "day", interval: 1, until: null, remaining: null });
  });
  it("fills the form from a saved rule and back", () => {
    expect(repeatForm(null)).toEqual(noRepeat);
    for (const r of [
      { every: "week", interval: 1, until: null, remaining: null },
      { every: "day", interval: 3, until: null, remaining: 4 },
      { every: "month", interval: 2, until: "2027-01-31", remaining: null },
    ] as const)
      expect(repeatRule(repeatForm(r))).toEqual(r);
  });
});

describe("repeat until", () => {
  it("round-trips a local end date through brain's UTC date", async () => {
    const { untilLocal, untilUtc } = await import("@/lib/posts");
    for (const day of ["2026-12-05", "2026-12-31", "2027-02-28"]) expect(untilLocal(untilUtc(day))).toBe(day);
    // The local day's last second, as a UTC date.
    expect(untilUtc("2026-12-05")).toBe(new Date(2026, 11, 5, 23, 59, 59).toISOString().slice(0, 10));
  });
});

describe("alt text", () => {
  const a = "https://example.com/a.png";
  const b = "https://example.com/b.png";
  it("is collected by link from a post and its thread, the first one winning", () => {
    const posts = [{ media: [a, b], media_alt: ["A cat", ""], thread: [{ body: "", media: [b, a], media_alt: ["B dog", "other"] }] }];
    expect(altMap(posts)).toEqual({ [a]: "A cat", [b]: "B dog" });
    expect(altMap([{ media: [a] }])).toEqual({});
  });

  it("follows its image when images are added, removed or reordered", () => {
    const alts = { [a]: " A cat ", [b]: "B dog" };
    expect(altList([a, b], alts)).toEqual(["A cat", "B dog"]);
    expect(altList([b, "https://example.com/c.png", a], alts)).toEqual(["B dog", "", "A cat"]);
    expect(altList([b], alts)).toEqual(["B dog"]);
  });

  it("is left out of a new post without any, and always sent on an edit", () => {
    expect(altOut([a], {}, false)).toBeUndefined();
    expect(altOut([a], { [a]: "x" }, false)).toEqual(["x"]);
    expect(altOut([a, b], {}, true)).toEqual(["", ""]);
    expect(altOut([], { [a]: "x" }, true)).toBeUndefined();
  });

  it("is for images only", () => {
    expect(isImageLink(a)).toBe(true);
    expect(isImageLink("https://drive.google.com/file/d/abc/view")).toBe(true);
    expect(isImageLink("https://example.com/pic.GIF?x=1")).toBe(true);
    expect(isImageLink("https://example.com/clip.mp4")).toBe(false);
    expect(isImageLink("https://example.com/doc.pdf")).toBe(false);
  });

  it("stays with a link only while the same link is typed on", () => {
    expect(keepsAlt(a, a + "x")).toBe(true);
    expect(keepsAlt(a, a.slice(0, -1), "deleteContentBackward")).toBe(true);
    // A pasted link, even one character away, and any big change, is taken for another image.
    expect(keepsAlt(a, b, "insertFromPaste")).toBe(false);
    expect(keepsAlt(a, b, "insertFromDrop")).toBe(false);
    expect(keepsAlt(a, "https://cdn.example.org/photos/other-picture.jpg", "insertText")).toBe(false);
    expect(keepsAlt(a, "", "deleteContentBackward")).toBe(false);
  });

  it("is capped by code points as brain counts, so emoji are not cut short", () => {
    expect([...capAlt("😀".repeat(1000))]).toHaveLength(1000);
    expect([...capAlt("😀".repeat(1001))]).toHaveLength(1000);
    expect(capAlt("short")).toBe("short");
  });
});
