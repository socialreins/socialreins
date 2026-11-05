import { api, failure, request, type Failure } from "@/lib/auth";
import { CONNECT_TIMEOUT_MS } from "@/lib/connections";

export type PostStatus = "draft" | "scheduled" | "queued" | "published" | "failed" | "deleted";
export type Target = {
  id: string;
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
export type Platform = "bluesky" | "threads" | "linkedin" | "facebook" | "instagram" | "youtube" | "x" | "tiktok";
export type Post = {
  id: string;
  social_set_id: string;
  platform: Platform;
  body: string;
  media: string[];
  thread: ThreadPart[];
  // Text the account comments on the post right after it is published; null for none.
  first_comment?: string | null;
  // Cover image link for the post's one video; null for none.
  cover?: string | null;
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
};
export type PostInput = {
  social_set_id: string;
  platform: Platform;
  body: string;
  media: string[];
  thread?: ThreadPart[];
  first_comment?: string;
  // A cover image link for the post's one video (Instagram, Facebook, YouTube); "" or absent for none.
  cover?: string;
  // ISO time to publish; null keeps the post a draft. A past time means now.
  scheduled_at: string | null;
  // A list to put the post in; one it is already in would move it to the end.
  list_id?: string;
};
// One post per platform, each with the shared body, media, thread and first comment unless overridden
// (a first_comment of "" leaves it out on a platform that can't post one).
export type PostGroupInput = Omit<PostInput, "platform"> & {
  platforms: Platform[];
  overrides?: Partial<Record<Platform, { body?: string; media?: string[]; thread?: ThreadPart[]; first_comment?: string; cover?: string }>>;
};
export type PostFilter = { social_set_id?: string; status?: PostStatus; from?: string; to?: string; group_id?: string };

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
  instagram: { chars: 2200, media: 10, thread: false, comment: 2200, cover: true },
  youtube: { chars: 100, media: 1, thread: false, comment: 10_000, cover: true },
  x: { chars: 280, media: 4, thread: true, comment: null, cover: false },
  tiktok: { chars: 2200, media: 35, thread: false, comment: null, cover: false },
};
// The image types each cover platform takes: Instagram's cover_url wants a JPEG; Facebook and YouTube take JPEG or PNG.
export const coverTypes: Partial<Record<Platform, string>> = { instagram: "a JPEG", facebook: "a JPEG or PNG", youtube: "a JPEG or PNG" };
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
export const overLimit = (platform: Platform, text: string) =>
  charCount(platform, text) > limits[platform].chars ||
  (platform === "youtube" && utf8Bytes(youtubeText(text).description) > YOUTUBE_DESCRIPTION_BYTES);

// Mirrors brain's checks, in brain's order, so most mistakes show before a request. brain stays the judge.
export function checkPost(body: string, media: string[], platform: Platform = "bluesky"): Failure | null {
  const max = limits[platform];
  // A YouTube video needs a title, so it needs a body even with its video.
  if (!body.trim() && (media.length === 0 || platform === "youtube")) return "empty_post";
  if ((platform === "instagram" || platform === "youtube" || platform === "tiktok") && media.length === 0) return "media_required";
  if (platform === "youtube" && /[<>]/.test(body)) return "invalid_text";
  if (overLimit(platform, body) || (platform === "bluesky" && utf8Bytes(body) > MAX_BYTES)) return "too_long";
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

// Mirrors brain's cover checks: blank is none, three platforms take one, it is a public https link and the
// post has exactly one media item (that it is a video is only known to brain once it downloads it).
export function checkCover(url: string, platform: Platform, mediaCount: number): Failure | null {
  const cover = url.trim();
  if (!cover) return null;
  if (!limits[platform].cover) return "cover_not_supported";
  if (!/^https:\/\/[^\s/]+\/?\S*$/.test(cover)) return "invalid_cover";
  return mediaCount === 1 ? null : "cover_needs_one_video";
}

// checkPost for the first post and every part; `part` is the 1-based follow-up at fault, as brain answers.
export function checkThread(
  body: string,
  media: string[],
  thread: ThreadPart[],
  platform: Platform = "bluesky",
): { failure: Failure; part?: number } | null {
  const first = checkPost(body, media, platform);
  if (first) return { failure: first };
  if (thread.length > 0 && !limits[platform].thread) return { failure: "thread_not_supported" };
  if (thread.length > MAX_PARTS) return { failure: "too_many_parts" };
  for (const [i, p] of thread.entries()) {
    const failure = checkPost(p.body, p.media, platform);
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

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
