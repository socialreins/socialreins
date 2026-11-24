import type { Metadata } from "next";
import { api, failure, request, type Failure } from "@/lib/auth";
import { CONNECT_TIMEOUT_MS } from "@/lib/connections";
import { apiUrl } from "@/lib/waitlist";

export type PostStatus = "draft" | "scheduled" | "queued" | "published" | "failed" | "deleted";
// What a network reports for a published post, as brain last read it. A null number is one that network does not give.
export type Metrics = { likes: number | null; comments: number | null; shares: number | null; views: number | null; fetched_at: string };
export type Target = {
  id: string;
  // null until brain has read the numbers, and on a network it has no stats for.
  metrics?: Metrics | null;
  social_account_id: string | null;
  status: "pending" | "publishing" | "published" | "failed" | "deleted";
  remote_id: string | null;
  remote_url: string | null;
  error: string | null;
  published_at: string | null;
  // The thread posts published so far, in order.
  parts: { remote_id: string; remote_url: string | null; published_at: string | null }[];
  // The first comment: null before it is tried, then posting, posted or failed (with comment_error).
  comment_status?: "posting" | "posted" | "failed" | null;
  comment_id?: string | null;
  comment_error?: string | null;
  // Why the cover image could not be set on the published video; the post is up (a warning).
  cover_error?: string | null;
};
// A follow-up post of a thread: a reply to the one before.
export type ThreadPart = { body: string; media: string[] };
// The platforms brain publishes to.
// What the user chooses for a TikTok post, as brain's POST /v1/posts takes it (TikTok's Content Sharing
// Guidelines): who can see it (no default), the interactions (all off), the commercial content disclosure
// and the AI-generated flag. privacy_level is one of the account's privacy_level_options.
export type TikTokSettings = {
  privacy_level: string | null;
  allow_comment: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  commercial_content: boolean;
  your_brand: boolean;
  branded_content: boolean;
  ai_generated: boolean;
};
export const noTikTok: TikTokSettings = {
  privacy_level: null,
  allow_comment: false,
  allow_duet: false,
  allow_stitch: false,
  commercial_content: false,
  your_brand: false,
  branded_content: false,
  ai_generated: false,
};
// What GET /v1/connections/{id}/tiktok says an account may post now.
export type TikTokCreator = {
  nickname: string;
  username: string | null;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number | null;
  can_post: boolean;
  reason: string | null;
};
export const getTikTokCreator = (accountId: string) => api<TikTokCreator>(`/v1/connections/${encodeURIComponent(accountId)}/tiktok`);
export const privacyName: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};
// Several accounts of one set get the same settings, so the editor offers what every one of them does:
// the levels all are offered, an interaction off if any creator turned it off, the shortest video limit.
export function mergeCreators(list: TikTokCreator[]): TikTokCreator {
  const [first, ...rest] = list;
  if (!first) return { nickname: "", username: null, privacy_level_options: [], comment_disabled: false, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: null, can_post: false, reason: null };
  return rest.reduce<TikTokCreator>(
    (a, c) => ({
      nickname: `${a.nickname}, ${c.nickname}`,
      username: null,
      privacy_level_options: a.privacy_level_options.filter((o) => c.privacy_level_options.includes(o)),
      comment_disabled: a.comment_disabled || c.comment_disabled,
      duet_disabled: a.duet_disabled || c.duet_disabled,
      stitch_disabled: a.stitch_disabled || c.stitch_disabled,
      max_video_post_duration_sec: [a.max_video_post_duration_sec, c.max_video_post_duration_sec].filter((n): n is number => n !== null).sort((x, y) => x - y)[0] ?? null,
      can_post: a.can_post && c.can_post,
      reason: a.reason ?? c.reason,
    }),
    first,
  );
}

// A YouTube video's visibility (brain's `youtube.privacy`); brain uploads as private without one.
export type YouTubePrivacy = "private" | "unlisted" | "public";
export const youtubePrivacyName: Record<YouTubePrivacy, string> = { private: "Private", unlisted: "Unlisted", public: "Public" };
export type Platform = "bluesky" | "threads" | "linkedin" | "facebook" | "instagram" | "youtube" | "x" | "tiktok";
export type Post = {
  id: string;
  social_set_id: string;
  platform: Platform;
  // The accounts picked for it; null or absent: every account of its platform in its set.
  account_ids?: string[] | null;
  body: string;
  media: string[];
  thread: ThreadPart[];
  // Text the account comments on the post right after it is published; null for none.
  first_comment?: string | null;
  // Cover image link for the post's one video; null for none.
  cover?: string | null;
  // A TikTok post's settings; null for none (a post made through the API).
  tiktok?: TikTokSettings | null;
  // A YouTube post's settings; null or no privacy means private.
  youtube?: { privacy?: YouTubePrivacy | null } | null;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  targets: Target[];
  // The lists the post is in, with its 1-based position ("Part N") in each.
  lists: { id: string; name: string; position: number }[];
  // Ties the posts of one POST /v1/post-groups call; null for a single post.
  group_id: string | null;
  // Set when the team requires approval and a member scheduled the post: it goes out only once approved.
  approval?: Approval | null;
  // What the owner or admin wrote when approving or asking for changes.
  approval_note?: string | null;
  approval_by?: string | null;
  approval_at?: string | null;
  // A scheduled post that goes out again and again; null for one that goes out once.
  repeat?: Repeat | null;
};
// brain's repeat rule: every `interval` (1 to 12) days, weeks or months, until a date (YYYY-MM-DD), for
// `remaining` (1 to 100) more posts, or for good when both are null. When the post goes out brain schedules
// the next copy and moves the rule to it.
// brain reads `until` as a UTC date; the form's date is local. The last local day's end falls on this UTC date.
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function untilUtc(local: string) {
  const [y, m, d] = local.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59).toISOString().slice(0, 10);
}
export function untilLocal(utc: string) {
  const [y, m, d] = utc.split("-").map(Number);
  for (const shift of [0, -1, 1]) {
    const local = ymd(new Date(y!, m! - 1, d! + shift));
    if (untilUtc(local) === utc) return local;
  }
  return utc;
}

export type Repeat = { every: "day" | "week" | "month"; interval: number; until: string | null; remaining: number | null };
// The Repeat control as the form holds it: number boxes keep their text.
export type RepeatForm = { every: "none" | Repeat["every"] | "custom"; unit: Repeat["every"]; interval: string; ends: "never" | "count" | "date"; count: string; until: string };
export const noRepeat: RepeatForm = { every: "none", unit: "week", interval: "2", ends: "never", count: "5", until: "" };
const within = (text: string, max: number) => Math.min(max, Math.max(1, Math.round(Number(text)) || 1));
// The rule the form stands for; null for "Does not repeat". "On a date" with no date picked yet never ends.
export function repeatRule(f: RepeatForm): Repeat | null {
  if (f.every === "none") return null;
  return {
    every: f.every === "custom" ? f.unit : f.every,
    interval: f.every === "custom" ? within(f.interval, 12) : 1,
    until: f.ends === "date" && f.until ? untilUtc(f.until) : null,
    remaining: f.ends === "count" ? within(f.count, 100) : null,
  };
}
export function repeatForm(r: Repeat | null | undefined): RepeatForm {
  if (!r) return noRepeat;
  return {
    every: r.interval === 1 ? r.every : "custom",
    unit: r.every,
    interval: String(r.interval === 1 ? 2 : r.interval),
    ends: r.until ? "date" : r.remaining ? "count" : "never",
    count: String(r.remaining ?? 5),
    until: r.until ? untilLocal(r.until) : "",
  };
}
// "Repeats every 2 weeks, 5 more times", "Repeats every month until Dec 31, 2026".
export function repeatSummary(r: Repeat): string {
  const [y, m, d] = (r.until ? untilLocal(r.until) : "").split("-").map(Number);
  return (
    `Repeats every ${r.interval === 1 ? r.every : `${r.interval} ${r.every}s`}` +
    (r.remaining ? `, ${r.remaining} more ${r.remaining === 1 ? "time" : "times"}` : "") +
    (r.until ? ` until ${new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { dateStyle: "medium" })}` : "")
  );
}
export type Approval = "pending" | "approved" | "rejected";
export const NOTE_MAX = 500;
// What a post's row and page say about approval: waiting (a scheduled post), or changes requested
// (until the post goes out or is edited back to pending). Null for everything else.
export function approvalState(p: Post): "pending" | "rejected" | null {
  if (p.approval === "pending" && p.status === "scheduled") return "pending";
  if (p.approval === "rejected" && (p.status === "scheduled" || p.status === "draft")) return "rejected";
  return null;
}
export const approvalName = { pending: "Needs approval", rejected: "Changes requested" } as const;
export type PostInput = {
  social_set_id: string;
  platform: Platform;
  // null: every account of the platform in the set. Absent: every one on a create, unchanged on an edit.
  // brain answers invalid_accounts for one outside it.
  account_ids?: string[] | null;
  body: string;
  media: string[];
  thread?: ThreadPart[];
  first_comment?: string;
  // A cover image link for the post's one video (Instagram, Facebook, YouTube); "" or absent for none.
  cover?: string;
  // TikTok settings: only a TikTok post takes them, and a group gives them to its TikTok post.
  tiktok?: TikTokSettings;
  // YouTube settings: only a YouTube post takes them, and a group gives them to its YouTube post.
  youtube?: { privacy: YouTubePrivacy };
  // ISO time to publish; null keeps the post a draft. A past time means now. Left out with `queue`.
  scheduled_at?: string | null;
  // New posts only: brain schedules the post at the set's earliest free queue slot.
  queue?: true;
  // A list to put the post in; one it is already in would move it to the end.
  list_id?: string;
};
// One post per platform, each with the shared body, media, thread and first comment unless overridden
// (a first_comment of "" leaves it out on a platform that can't post one).
export type PostGroupInput = Omit<PostInput, "platform"> & {
  platforms: Platform[];
  overrides?: Partial<Record<Platform, { body?: string; media?: string[]; thread?: ThreadPart[]; first_comment?: string; cover?: string }>>;
};
export type PostFilter = { social_set_id?: string; status?: PostStatus; from?: string; to?: string; group_id?: string; approval?: Approval };

// Each platform's limits, as brain's crates/core/src/post.rs checks them. `chars` counts graphemes
// on Bluesky, X's weighted count on X (`xWeight`), UTF-16 code units on TikTok and Unicode code points elsewhere (on YouTube it is the
// title's, the body's first line); `media` is images or videos per post (on X 4 images, or one GIF or video; on TikTok
// one video or up to 35 photos). `comment` is the first comment's limit in characters, null where the
// platform can't post one (brain answers first_comment_not_supported). Meta, LinkedIn and Google document
// no comment limit through their APIs, so these are the widely reported figures. `cover` is whether the
// platform has an API for a video's cover image (brain answers cover_not_supported elsewhere; TikTok only
// picks a frame).
export const limits: Record<Platform, { chars: number; media: number; thread: boolean; comment: number | null; cover: boolean }> = {
  bluesky: { chars: 300, media: 4, thread: true, comment: null, cover: false },
  threads: { chars: 500, media: 20, thread: true, comment: null, cover: false },
  linkedin: { chars: 3000, media: 20, thread: false, comment: 1250, cover: false },
  facebook: { chars: 63_206, media: 10, thread: false, comment: 8000, cover: true },
  instagram: { chars: 2200, media: 20, thread: false, comment: 2200, cover: true },
  youtube: { chars: 100, media: 1, thread: false, comment: 10_000, cover: true },
  x: { chars: 280, media: 4, thread: true, comment: null, cover: false },
  tiktok: { chars: 2200, media: 35, thread: false, comment: null, cover: false },
};
// The image types each cover platform takes: Instagram's cover_url wants a JPEG; Facebook and YouTube take JPEG or PNG.
export const coverTypes: Partial<Record<Platform, string>> = { instagram: "a JPEG, PNG or WebP", facebook: "a JPEG or PNG", youtube: "a JPEG or PNG" };
// The media types each platform's publisher takes (brain's media_types), and how to say them.
const JPEG = "jpeg", PNG = "png", GIF = "gif", WEBP = "webp", MP4 = "mp4", MOV = "mov", PDF = "pdf";
export const mediaTypes: Record<Platform, { types: string[]; text: string }> = {
  bluesky: { types: [JPEG, PNG, WEBP, GIF, MP4, MOV], text: "JPEG, PNG, WebP or GIF images or an MP4 or MOV video" },
  threads: { types: [JPEG, PNG, MP4, MOV], text: "JPEG or PNG images or MP4 or MOV videos" },
  linkedin: { types: [JPEG, PNG, GIF, MP4, PDF], text: "JPEG, PNG or GIF images, an MP4 video or a PDF" },
  facebook: { types: [JPEG, PNG, GIF, MP4, MOV], text: "JPEG, PNG or GIF images or an MP4 or MOV video" },
  // brain turns PNG and WebP images into JPEGs for Instagram, and PNG photos for TikTok, at publish.
  instagram: { types: [JPEG, PNG, WEBP, MP4, MOV], text: "JPEG, PNG or WebP images or MP4 or MOV videos" },
  youtube: { types: [MP4, MOV], text: "an MP4 or MOV video" },
  x: { types: [JPEG, PNG, WEBP, GIF, MP4, MOV], text: "JPEG, PNG, WebP or GIF images or an MP4 or MOV video" },
  tiktok: { types: [JPEG, PNG, WEBP, MP4, MOV], text: "one MP4 or MOV video, or JPEG, PNG or WebP photos" },
};
// The file sizes brain refuses on save, for the platforms given (crates/core/src/post.rs: VIDEO_LIMITS, size_limit).
// A still image over a platform's own limit is shrunk at publish, so only brain's 100 MB applies to it.
const ownSizes: Partial<Record<Platform, { name: string; video: number; gif: number }>> = {
  bluesky: { name: "Bluesky", video: 100, gif: 1 },
  x: { name: "X", video: 512, gif: 15 },
};
export function sizeHint(platforms: Platform[]): string {
  const own = platforms.flatMap((p) => ownSizes[p] ?? []);
  const each = (key: "video" | "gif") => own.map((o) => `${o[key]} MB on ${o.name}`).join(", ");
  // Every platform here has its own video limit only when none falls back to the 1 GB one.
  const video = own.length === platforms.length && own.length > 0 ? each("video") : `1 GB${own.length ? ` (${each("video")})` : ""}`;
  return `Size limits: a video up to ${video}; an image or PDF up to 100 MB${own.length ? " (a photo too large for a network is made smaller for you)" : ""}${own.length ? `; a GIF up to ${each("gif")}` : ""}. Sizes are checked when you save.`;
}
// What a link's extension says its file is; null when it says nothing (a Drive link, no extension).
export function linkType(url: string): string | null {
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url.split(/[?#]/)[0] ?? "")?.[1]?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return JPEG;
  return ext && [PNG, GIF, WEBP, MP4, MOV, PDF].includes(ext) ? ext : null;
}
// Whether a file of this type must be the post's only media item (a video, a PDF on LinkedIn, a GIF on X).
const alone = (platform: Platform, t: string) =>
  ((t === MP4 || t === MOV) && ["bluesky", "facebook", "linkedin", "x", "tiktok"].includes(platform)) ||
  (t === PDF && platform === "linkedin") ||
  (t === GIF && platform === "x");
// A hint from the links' extensions of what brain's media checks will likely say. Never blocks a save: brain
// reads each file's first bytes when the post is saved (a .mov may hold MP4 bytes, a host may not answer), so
// its answer is the final word, and only it knows sizes (media_too_large).
export function checkMediaTypes(media: string[], platform: Platform): Failure | null {
  const types = media.map(linkType);
  if (types.some((t) => t !== null && !mediaTypes[platform].types.includes(t))) return "media_type_not_supported";
  return media.length > 1 && types.some((t) => t !== null && alone(platform, t)) ? "mixed_media" : null;
}

// A YouTube video's description (the body after its first line) is limited in UTF-8 bytes.
export const YOUTUBE_DESCRIPTION_BYTES = 5000;
export const publishing = Object.keys(limits) as Platform[];
export const isPlatform = (p: string): p is Platform => p in limits;
export const MAX_BYTES = 3000;
export const MAX_PARTS = 25;

const enc = encodeURIComponent;

export function listPosts(filter: PostFilter = {}) {
  const q = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])));
  return api<Post[]>(`/v1/posts${q.size ? `?${q}` : ""}`);
}
export const getPost = (id: string) => api<Post>(`/v1/posts/${enc(id)}`);
export const createPost = (input: PostInput) => api<Post>("/v1/posts", "POST", input);
export const createPostGroup = (input: PostGroupInput) =>
  api<{ group_id: string; posts: Post[] }>("/v1/post-groups", "POST", input);
export const updatePost = (id: string, input: PostInput) => api<Post>(`/v1/posts/${enc(id)}`, "PUT", input);
// 202 with the post queued; poll getPost until it is published or failed.
export const publishPost = (id: string) => api<Post>(`/v1/posts/${enc(id)}/publish`, "POST");
// Sets the repeat rule on a scheduled post and the other scheduled posts of its group; null clears it.
// brain answers 409 not_scheduled, 422 repeat_not_supported (TikTok), invalid_repeat or too_many_repeats.
export const saveRepeat = (id: string, rule: Repeat | null) =>
  rule ? api<Post>(`/v1/posts/${enc(id)}/repeat`, "PUT", rule) : api<Post | "ok">(`/v1/posts/${enc(id)}/repeat`, "DELETE");
// Approves a waiting post or asks for changes (owners and admins), for every post of its group at once.
// Answers the posts as they are now; 409 not_awaiting_approval when none was waiting.
export async function decidePost(p: Pick<Post, "id" | "group_id">, decision: "approve" | "reject", note = ""): Promise<Post[] | Failure> {
  const body = note.trim() ? { note: note.trim() } : {};
  if (p.group_id) {
    const r = await api<{ posts: Post[] }>(`/v1/post-groups/${enc(p.group_id)}/${decision}`, "POST", body);
    return typeof r === "string" ? r : r.posts;
  }
  const r = await api<Post>(`/v1/posts/${enc(p.id)}/${decision}`, "POST", body);
  return typeof r === "string" ? r : [r];
}

export type DeleteResult = "ok" | Post | Failure | { takedownFailed: string };

// "ok": a draft or scheduled post is gone. A Post: a published post was taken down. brain answers
// a takedown it could not finish with 422 and a message saying what to do.
export async function deletePost(id: string): Promise<DeleteResult> {
  // A takedown calls Bluesky for every account, so it gets the connect timeout.
  const res = await request(`/v1/posts/${enc(id)}`, "DELETE", undefined, CONNECT_TIMEOUT_MS);
  if (typeof res === "string") return res;
  if (res.status === 204) return "ok";
  if (res.ok) return ((await res.json().catch(() => null)) as Post | null) ?? "error";
  const body = await res.clone().json().catch(() => null);
  if (body?.error === "takedown_failed") return { takedownFailed: String(body.message ?? "") };
  return failure(res);
}

// What happened to one post of a take-down-all run. "waiting": not tried, because brain's rate limit stopped the run.
export type Takedown =
  | { id: string; state: "down" | "gone" | "waiting" }
  | { id: string; state: "failed"; failure?: Failure; message?: string };

// Takes `ids` down one request after another, never in parallel: brain allows 10 publish or take-down
// calls a minute per user, and a group has at most one post per platform. A failure of one post does not
// stop the others; a rate limit does, since every later call would be refused too.
export async function takeDownAll(ids: string[]): Promise<Takedown[]> {
  const out: Takedown[] = [];
  for (const id of ids) {
    const r = await deletePost(id);
    if (r === "rate_limited") {
      out.push(...ids.slice(out.length).map((id) => ({ id, state: "waiting" as const })));
      break;
    }
    if (r === "not_found") out.push({ id, state: "gone" });
    else if (typeof r === "string" && r !== "ok") out.push({ id, state: "failed", failure: r });
    else if (typeof r === "object" && "takedownFailed" in r) out.push({ id, state: "failed", message: r.takedownFailed });
    else out.push({ id, state: "down" });
  }
  return out;
}

const segmenter =typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
// What Bluesky counts as characters: user-perceived graphemes, so an emoji family is one.
export const graphemes = (text: string) => (segmenter ? [...segmenter.segment(text)].length : [...text].length);
export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

// A YouTube post's title (the body's first line) and description (the rest), as brain's youtube_text splits them.
export function youtubeText(body: string) {
  const text = body.trim();
  const at = text.indexOf("\n");
  return at < 0 ? { title: text, description: "" } : { title: text.slice(0, at).trim(), description: text.slice(at + 1).trim() };
}

// What X counts a post as, as brain's x_weight does: most Latin, Greek, Cyrillic and punctuation characters 1,
// everything else (CJK, emoji) 2, and every link (http(s):// or a bare domain) 23. Conservative: a bare domain
// counts as a link even where X would not, so a post may be refused that X would take, never the reverse.
const X_LINK = 23;
const xLink = (word: string) => {
  if (/^https?:\/\//.test(word)) return true;
  const labels = (word.split(/[/?#]/)[0] ?? "").split(".");
  const tld = labels[labels.length - 1] ?? "";
  return labels.length >= 2 && labels.every((l) => /^[A-Za-z0-9-]+$/.test(l)) && /^[A-Za-z]{2,}$/.test(tld);
};
const xCharWeight = (c: string) => {
  const n = c.codePointAt(0)!;
  return n <= 0x10ff || (n >= 0x2000 && n <= 0x200d) || (n >= 0x2010 && n <= 0x201f) || (n >= 0x2032 && n <= 0x2037) ? 1 : 2;
};
export function xWeight(text: string) {
  let total = 0;
  for (const piece of text.split(/(\s+)/)) {
    // Trailing punctuation stays out of the link, as X does.
    const bare = piece.replace(/[.,;:!?)"']+$/, "");
    if (!/^\s*$/.test(piece) && xLink(bare)) total += X_LINK + [...piece.slice(bare.length)].reduce((n, c) => n + xCharWeight(c), 0);
    else total += [...piece].reduce((n, c) => n + xCharWeight(c), 0);
  }
  return total;
}

// What X takes when every X account of the post's set is on a paid plan (brain's X_MAX_LONG_WEIGHT).
export const X_LONG_CHARS = 25_000;
// The most characters a post may have on `platform`; `xLong`: every X account of the set takes long posts.
export const charLimit = (platform: Platform, xLong = false) => (platform === "x" && xLong ? X_LONG_CHARS : limits[platform].chars);

// The length brain checks against limits[platform].chars.
export const charCount = (platform: Platform, text: string) =>
  platform === "bluesky"
    ? graphemes(text)
    : platform === "x"
      ? xWeight(text)
      : platform === "tiktok"
        ? text.length
        : [...(platform === "youtube" ? youtubeText(text).title : text)].length;

// Whether the text is over the platform's limit; YouTube also limits its description's bytes.
export const overLimit = (platform: Platform, text: string, xLong = false) =>
  charCount(platform, text) > charLimit(platform, xLong) ||
  (platform === "youtube" && utf8Bytes(youtubeText(text).description) > YOUTUBE_DESCRIPTION_BYTES);

// Mirrors brain's checks, in brain's order, so most mistakes show before a request. brain stays the judge.
export function checkPost(body: string, media: string[], platform: Platform = "bluesky", xLong = false): Failure | null {
  const max = limits[platform];
  // A YouTube video needs a title, so it needs a body even with its video.
  if (!body.trim() && (media.length === 0 || platform === "youtube")) return "empty_post";
  if ((platform === "instagram" || platform === "youtube" || platform === "tiktok") && media.length === 0) return "media_required";
  if (platform === "youtube" && /[<>]/.test(body)) return "invalid_text";
  if (overLimit(platform, body, xLong) || (platform === "bluesky" && utf8Bytes(body) > MAX_BYTES)) return "too_long";
  if (media.length > max.media) return "too_many_images";
  if (media.some((m) => !/^https:\/\/[^\s/]+\/?\S*$/.test(m))) return "invalid_media";
  return null;
}

// Mirrors brain's first comment checks: blank is none, only four platforms take one, each with its own limit.
export function checkComment(text: string, platform: Platform): Failure | null {
  if (!text.trim()) return null;
  const max = limits[platform].comment;
  if (max === null) return "first_comment_not_supported";
  return [...text].length > max ? "first_comment_too_long" : null;
}

// Mirrors brain's TikTok settings checks: a level must be chosen, the disclosure needs one of its two boxes,
// and branded content cannot be private. Whether the account is offered the level is checked against its
// creator info in the editor.
export function checkTikTok(t: TikTokSettings): Failure | null {
  if (!t.privacy_level) return "tiktok_privacy_required";
  if (!(t.privacy_level in privacyName)) return "invalid_tiktok_privacy";
  if (!t.commercial_content && (t.your_brand || t.branded_content)) return "invalid_tiktok_disclosure";
  if (t.commercial_content && !t.your_brand && !t.branded_content) return "tiktok_disclosure_incomplete";
  return t.branded_content && t.privacy_level === "SELF_ONLY" ? "tiktok_branded_content_private" : null;
}

// Mirrors brain's cover checks: blank is none, three platforms take one, it is a public https link and the
// post has exactly one media item (that it is a video is only known to brain once it downloads it).
export function checkCover(url: string, platform: Platform, mediaCount: number): Failure | null {
  const cover = url.trim();
  if (!cover) return null;
  if (!limits[platform].cover) return "cover_not_supported";
  if (!/^https:\/\/[^\s/]+\/?\S*$/.test(cover)) return "invalid_cover";
  return mediaCount === 1 ? null : "cover_needs_one_video";
}

// A hint from the cover link's extension, like checkMediaTypes: Facebook and YouTube take a JPEG or PNG,
// Instagram a JPEG (brain turns a PNG or WebP into one). Never blocks a save; brain reads the file.
export function coverTypeHint(url: string, platform: Platform): Failure | null {
  const t = linkType(url.trim());
  return t === null || t === JPEG || t === PNG || (t === WEBP && platform === "instagram") ? null : "invalid_cover_type";
}

// checkPost for the first post and every part; `part` is the 1-based follow-up at fault, as brain answers.
export function checkThread(
  body: string,
  media: string[],
  thread: ThreadPart[],
  platform: Platform = "bluesky",
  xLong = false,
): { failure: Failure; part?: number } | null {
  const first = checkPost(body, media, platform, xLong);
  if (first) return { failure: first };
  if (thread.length > 0 && !limits[platform].thread) return { failure: "thread_not_supported" };
  if (thread.length > MAX_PARTS) return { failure: "too_many_parts" };
  for (const [i, p] of thread.entries()) {
    const failure = checkPost(p.body, p.media, platform, xLong);
    if (failure) return { failure, part: i + 1 };
  }
  return null;
}

// datetime-local works in the browser's time zone: "2026-11-02T09:30" is local time.
const pad = (n: number) => String(n).padStart(2, "0");
export function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

// How far `zone` is ahead of UTC at the instant `ms`, in ms (DST included).
function zoneOffset(ms: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(ms / 1000) * 1000;
}

// toLocalInput and fromLocalInput in an IANA `zone` instead of the browser's: the composer shows
// times in the set's queue zone. The same in every zone: a wall time a spring-forward change skips
// moves forward to the first time after the gap (02:30 becomes 03:00), and one a fall-back change
// repeats is its first occurrence (the earlier instant).
export function toZoneInput(iso: string | null, zone: string) {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  const d = new Date(ms + zoneOffset(ms, zone));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export function fromZoneInput(value: string, zone: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  // A change moves the offset at most once in a day: the offsets a day either side are the two.
  const DAY = 86_400_000;
  const before = zoneOffset(wall - DAY, zone);
  const after = zoneOffset(wall + DAY, zone);
  const fits = [wall - before, wall - after].filter((t) => zoneOffset(t, zone) === wall - t);
  if (fits.length) return new Date(Math.min(...fits)).toISOString();
  // In a gap: the change's instant, found by the minute, is the first valid time after it.
  let lo = Math.min(wall - before, wall - after);
  let hi = Math.max(wall - before, wall - after);
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
    if (zoneOffset(mid, zone) === after) hi = mid;
    else lo = mid;
  }
  return new Date(hi).toISOString();
}

// The wall time of `d` in `zone` as a browser-local Date, so the calendar's date maths (getDate,
// sameDay, monthWeeks) reads days of `zone`. No zone: `d` as it is, the browser's.
export function inZone(d: Date, zone?: string) {
  if (!zone) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(toZoneInput(d.toISOString(), zone))!;
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, d.getSeconds());
}

// `when` moved to the calendar day `day` at the same wall time in `zone`, the set's queue zone;
// null when that moment is not in the future. A skipped or repeated time follows fromZoneInput.
export function moveToZoneDay(when: Date, day: Date, zone: string, now = new Date()): Date | null {
  const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  const to = new Date(fromZoneInput(`${date}T${toZoneInput(when.toISOString(), zone).slice(11)}`, zone)!);
  return to.getTime() > now.getTime() ? to : null;
}

// The local month as an ISO range: from inclusive, to exclusive, as brain filters scheduled_at.
export const monthRange = (year: number, month: number) => ({
  from: new Date(year, month, 1).toISOString(),
  to: new Date(year, month + 1, 1).toISOString(),
});

// Weeks of the month, Monday first; days outside the month are null.
export function monthWeeks(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

// The day a post sits on in the calendar: when it is planned for, else when it went out.
export const postDay = (p: Post) => {
  const when = p.scheduled_at ?? p.published_at;
  return when ? new Date(when) : null;
};

// One row per post: the versions of a group that share `key` (what the row shows once, such as the status
// and time) become one row, in the order they first appear. A post outside a group is its own row.
export function rows(posts: Post[], key: (p: Post) => string): Post[][] {
  const out = new Map<string, Post[]>();
  for (const p of posts) {
    const k = p.group_id ? `${p.group_id} ${key(p)}` : p.id;
    out.set(k, [...(out.get(k) ?? []), p]);
  }
  return [...out.values()];
}

// The Posts list's filters, kept in the URL as ?q=&status=&network=&approval= (a value brain doesn't know means all).
export type PostFilters = { q: string; status: PostStatus | "all"; network: Platform | "all"; approval: "pending" | "rejected" | "all" };
const statuses: PostStatus[] = ["draft", "scheduled", "queued", "published", "failed", "deleted"];
export function parseFilters(params: { get: (k: string) => string | null }): PostFilters {
  const status = params.get("status") ?? "";
  const network = params.get("network") ?? "";
  const approval = params.get("approval");
  return {
    q: (params.get("q") ?? "").trim(),
    status: statuses.includes(status as PostStatus) ? (status as PostStatus) : "all",
    network: isPlatform(network) ? network : "all",
    approval: approval === "pending" || approval === "rejected" ? approval : "all",
  };
}
export function filterQuery(f: PostFilters): string {
  const q = new URLSearchParams();
  if (f.q) q.set("q", f.q);
  if (f.status !== "all") q.set("status", f.status);
  if (f.network !== "all") q.set("network", f.network);
  if (f.approval !== "all") q.set("approval", f.approval);
  return q.size ? `?${q}` : "";
}
// Whether a row (the versions of one post) passes the filters, leaving out `skip` to count that filter's choices.
export function matchesFilters(row: Post[], f: PostFilters, skip?: "status" | "network" | "approval"): boolean {
  const q = f.q.toLowerCase();
  return (
    (!q || row.some((p) => p.body.toLowerCase().includes(q))) &&
    (skip === "status" || f.status === "all" || row[0]!.status === f.status) &&
    (skip === "network" || f.network === "all" || row.some((p) => p.platform === f.network)) &&
    (skip === "approval" || f.approval === "all" || approvalState(row[0]!) === f.approval)
  );
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// `when` moved to the local day `day` at the same local time of day (the calendar's zone, the browser's);
// null when that moment is not in the future. A time a DST change skips moves on by the gap, as Date does.
export function moveToDay(when: Date, day: Date, now = new Date()): Date | null {
  const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), when.getHours(), when.getMinutes(), when.getSeconds(), when.getMilliseconds());
  return to.getTime() > now.getTime() ? to : null;
}

// A saved post as PUT /v1/posts/{id} takes it back, the way the editor sends an edit of an unchanged post,
// with only `scheduled_at` new. PUT replaces the post, so everything else must go back as it was.
export function editInput(p: Post, scheduled_at: string | null): PostInput {
  return {
    social_set_id: p.social_set_id,
    platform: p.platform,
    account_ids: p.account_ids ?? null,
    body: p.body,
    media: p.media,
    thread: limits[p.platform].thread ? (p.thread ?? []) : [],
    first_comment: p.first_comment?.trim() ? p.first_comment : undefined,
    cover: p.cover?.trim() || undefined,
    tiktok: p.platform === "tiktok" ? (p.tiktok ?? undefined) : undefined,
    youtube: p.platform === "youtube" ? { privacy: p.youtube?.privacy ?? "private" } : undefined,
    scheduled_at,
  };
}

// A post's public page, one per post or per group. `code` is null before the first save; `live` says
// whether anyone can open it now (switched on, the team allows pages, a version is published).
export type PostPage = { enabled: boolean; details: string; code: string | null; live: boolean };
export const DETAILS_MAX = 5000;
export const getPostPage = (id: string) => api<PostPage>(`/v1/posts/${enc(id)}/page`);
export const savePostPage = (id: string, input: { enabled: boolean; details: string }) => api<PostPage>(`/v1/posts/${enc(id)}/page`, "PUT", input);

// What brain shows anyone about a published post with a page.
export type PublicPost = {
  team: string;
  body: string;
  media: string[];
  thread: ThreadPart[];
  details: string;
  // The team offers a newsletter sign-up on its pages.
  newsletter?: boolean;
  published_at: string;
  links: { platform: string; url: string }[];
};

// null: there is no such page (or it is not public now); "error": brain could not be asked.
// `base` is brain's URL: the browser's apiUrl, or brainUrl() on the server.
export async function getPublicPost(code: string, base = apiUrl, timeoutMs = 10_000): Promise<PublicPost | null | "error"> {
  try {
    const res = await fetch(`${base}/v1/public/pages/${enc(code)}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 404) return null;
    return res.ok ? ((await res.json()) as PublicPost) : "error";
  } catch {
    return "error";
  }
}

// Text split on its links: odd entries are http(s) links, to render as anchors.
// A link ends before closing punctuation, but keeps a ")" or "]" that closes one of its own.
const count = (s: string, c: string) => s.split(c).length - 1;
const trailing = (url: string) => {
  const last = url.at(-1)!;
  if (".,;:!?\u3002".includes(last)) return true;
  return (last === ")" && count(url, ")") > count(url, "(")) || (last === "]" && count(url, "]") > count(url, "["));
};
export function linked(text: string): string[] {
  const out: string[] = [];
  let at = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
    let url = m[0];
    while (trailing(url)) url = url.slice(0, -1);
    out.push(text.slice(at, m.index), url);
    at = m.index + url.length;
  }
  out.push(text.slice(at));
  return out;
}
// How a public page shows each media link: a picture (linked to the share page for Drive and Dropbox) or a
// link button for what a browser can't show inline (a video, a PDF, an unknown share). Non-https links are dropped.
export type PageMedia = { kind: "image"; src: string; href?: string } | { kind: "link"; href: string; label: string };
const IMAGE_NAME = /\.(jpe?g|png|gif|webp)$/i;
const VIDEO_NAME = /\.(mp4|mov|webm)$/i;
const driveId = (u: URL) => {
  const id = /^\/file\/d\/([^/]+)/.exec(u.pathname)?.[1] ?? (u.pathname === "/open" || u.pathname === "/uc" ? u.searchParams.get("id") : null);
  return id && /^[\w-]+$/.test(id) ? id : null;
};
export function pageMedia(media: string[]): PageMedia[] {
  return media.flatMap((m): PageMedia[] => {
    let u: URL;
    try {
      u = new URL(m);
    } catch {
      return [];
    }
    if (u.protocol !== "https:") return [];
    const href = u.href;
    const drive = u.hostname === "drive.google.com";
    const dropbox = u.hostname === "www.dropbox.com" || u.hostname === "dropbox.com";
    const id = drive ? driveId(u) : null;
    if (id) {
      const src = new URL("https://drive.google.com/thumbnail");
      src.searchParams.set("id", id);
      src.searchParams.set("sz", "w1600");
      return [{ kind: "image", src: src.href, href }];
    }
    if (dropbox && /^\/(s|scl\/fi)\//.test(u.pathname) && IMAGE_NAME.test(u.pathname)) {
      const src = new URL(href);
      src.searchParams.delete("dl");
      src.searchParams.set("raw", "1");
      return [{ kind: "image", src: src.href, href }];
    }
    if (!drive && !dropbox && IMAGE_NAME.test(u.pathname)) return [{ kind: "image", src: href }];
    return [{ kind: "link", href, label: VIDEO_NAME.test(u.pathname) ? "Open the video" : "Open the file" }];
  });
}

// A link preview of a public page: the first line as the title, the rest of the body (or the details) as
// the description, and the first picture. Kept out of search results like the page.
const cut = (text: string, max: number) => {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}\u2026` : chars.join("");
};
export function pageMeta(post: PublicPost): Metadata {
  const { title: first, description: rest } = youtubeText(post.body);
  const title = first ? cut(first, 70) : `A post by ${post.team}`;
  const description = cut(rest || post.details, 200) || undefined;
  const image = pageMedia([post.media, ...post.thread.map((t) => t.media)].flat()).find((m) => m.kind === "image")?.src;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "article", images: image ? [image] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}
