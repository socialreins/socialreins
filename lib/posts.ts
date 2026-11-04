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
};
// A follow-up post of a thread: a reply to the one before.
export type ThreadPart = { body: string; media: string[] };
// The platforms brain publishes to.
export type Platform = "bluesky" | "threads" | "linkedin" | "facebook" | "instagram";
export type Post = {
  id: string;
  social_set_id: string;
  platform: Platform;
  body: string;
  media: string[];
  thread: ThreadPart[];
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
  // ISO time to publish; null keeps the post a draft. A past time means now.
  scheduled_at: string | null;
  // A list to put the post in; one it is already in would move it to the end.
  list_id?: string;
};
// One post per platform, each with the shared body, media and thread unless overridden.
export type PostGroupInput = Omit<PostInput, "platform"> & {
  platforms: Platform[];
  overrides?: Partial<Record<Platform, { body?: string; media?: string[]; thread?: ThreadPart[] }>>;
};
export type PostFilter = { social_set_id?: string; status?: PostStatus; from?: string; to?: string; group_id?: string };

// Each platform's limits, as brain's crates/core/src/post.rs checks them. `chars` counts graphemes
// on Bluesky and Unicode code points elsewhere; `media` is images or videos per post.
export const limits: Record<Platform, { chars: number; media: number; thread: boolean }> = {
  bluesky: { chars: 300, media: 4, thread: true },
  threads: { chars: 500, media: 20, thread: true },
  linkedin: { chars: 3000, media: 20, thread: false },
  facebook: { chars: 63_206, media: 10, thread: false },
  instagram: { chars: 2200, media: 10, thread: false },
};
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

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
// What Bluesky counts as characters: user-perceived graphemes, so an emoji family is one.
export const graphemes = (text: string) => (segmenter ? [...segmenter.segment(text)].length : [...text].length);
export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

// The length brain checks against limits[platform].chars.
export const charCount = (platform: Platform, text: string) => (platform === "bluesky" ? graphemes(text) : [...text].length);

// Mirrors brain's checks, in brain's order, so most mistakes show before a request. brain stays the judge.
export function checkPost(body: string, media: string[], platform: Platform = "bluesky"): Failure | null {
  const max = limits[platform];
  if (!body.trim() && media.length === 0) return "empty_post";
  if (platform === "instagram" && media.length === 0) return "media_required";
  if (charCount(platform, body) > max.chars || (platform === "bluesky" && utf8Bytes(body) > MAX_BYTES)) return "too_long";
  if (media.length > max.media) return "too_many_images";
  if (media.some((m) => !/^https:\/\/[^\s/]+\/?\S*$/.test(m))) return "invalid_media";
  return null;
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
