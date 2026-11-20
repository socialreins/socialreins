import { api } from "@/lib/auth";
import type { Platform, Post } from "@/lib/posts";

// Post analytics: the numbers brain reads from each network for a published post (`targets[].metrics`),
// and their sums from GET /v1/analytics.
export const STATS = ["likes", "comments", "shares", "views"] as const;
export type Stat = (typeof STATS)[number];
// null: no network in the sum gives that number.
export type Numbers = Record<Stat, number | null>;
export type Analytics = {
  supported: string[];
  totals: Numbers & { posts: number };
  by_platform: (Numbers & { platform: string; posts: number; supported: boolean })[];
  by_day: (Numbers & { date: string; posts: number })[];
  top_posts: Post[];
};

// The networks brain reads stats from; the Analytics page takes the list from brain's `supported` instead.
export const STAT_NETWORKS: Platform[] = ["bluesky", "facebook", "instagram", "youtube"];
export const hasStats = (p: string) => (STAT_NETWORKS as string[]).includes(p);
export const REFRESH_NOTE = "Numbers refresh about every hour for two days after a post goes out, then twice a day, for 30 days.";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const parseRange = (v: string | null): Range => RANGES.find((r) => String(r) === v) ?? 30;
// The last `days` days ending today, as brain's UTC dates.
export function rangeDates(days: number, now = Date.now()) {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: day(now - (days - 1) * 86_400_000), to: day(now) };
}

export function getAnalytics(setId: string, days: Range, now = Date.now()) {
  const q = new URLSearchParams({ ...(setId && { social_set_id: setId }), ...rangeDates(days, now) });
  return api<Analytics>(`/v1/analytics?${q}`);
}
export const refreshMetrics = (id: string) => api<Post>(`/v1/posts/${encodeURIComponent(id)}/metrics/refresh`, "POST");

// 1234 as "1.2K". English on purpose, like the rest of the app's words.
const short = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const compact = (n: number) => short.format(n);

// Sums the numbers of every account the posts went to; null when brain has read none yet.
export function postTotals(posts: Pick<Post, "targets">[]): Numbers | null {
  const read = posts.flatMap((p) => p.targets.flatMap((t) => (t.metrics ? [t.metrics] : [])));
  if (read.length === 0) return null;
  const sum = (k: Stat) => read.reduce<number | null>((a, m) => (m[k] === null ? a : (a ?? 0) + m[k]), null);
  return { likes: sum("likes"), comments: sum("comments"), shares: sum("shares"), views: sum("views") };
}
// "12 likes, 1 comment": only the numbers the network gives, or only `keys`.
export function statWords(n: Numbers, keys: readonly Stat[] = STATS) {
  return keys.filter((k) => n[k] !== null).map((k) => `${compact(n[k]!)} ${n[k] === 1 ? k.slice(0, -1) : k}`).join(", ");
}
export const engagement = (n: Numbers) => (n.likes ?? 0) + (n.comments ?? 0) + (n.shares ?? 0);
