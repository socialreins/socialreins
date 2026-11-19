import { failure, request, type Failure } from "@/lib/auth";
import type { Connection } from "@/lib/connections";

// What a feed does with a new item: save a draft, take the set's next queue slot, or post at once.
export type FeedMode = "draft" | "queue" | "now";
export type Feed = {
  id: string;
  url: string;
  social_set_id: string;
  platforms: string[];
  template: string;
  mode: FeedMode;
  active: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  items_posted: number;
  created_at: string;
};
export type FeedInput = Pick<Feed, "url" | "social_set_id" | "platforms" | "template" | "mode">;

// A refusal with what brain adds to it: `field` (invalid_feed), `platform` (platform_not_supported), `reason` (feed_unreadable).
export type Problem = { code: Failure; field?: string; platform?: string; reason?: string };
export const isProblem = (r: unknown): r is Problem => typeof r === "object" && r !== null && "code" in r;

const enc = encodeURIComponent;

async function call<T = "ok">(path: string, method = "GET", body?: unknown): Promise<T | Problem> {
  const res = await request(path, method, body);
  if (typeof res === "string") return { code: res };
  if (res.ok) return (res.status === 204 ? "ok" : await res.json()) as T;
  const code = await failure(res.clone());
  const extra = await res.json().catch(() => null);
  const p: Problem = { code };
  for (const k of ["field", "platform", "reason"] as const) if (typeof extra?.[k] === "string") p[k] = extra[k];
  return p;
}

// Oldest first. Every member reads; owners and admins write.
export const listFeeds = () => call<Feed[]>("/v1/feeds");
// brain reads the feed once and marks what it holds as seen, so only later items post.
export const createFeed = (f: FeedInput) => call<Feed>("/v1/feeds", "POST", f);
export const updateFeed = (id: string, f: FeedInput & { active: boolean }) => call<Feed>(`/v1/feeds/${enc(id)}`, "PUT", f);
export const deleteFeed = (id: string) => call(`/v1/feeds/${enc(id)}`, "DELETE");
// At most once a minute per feed: 429 checked_recently.
export const checkFeed = (id: string) => call<Feed>(`/v1/feeds/${enc(id)}/check`, "POST");

// The whole feed as PUT takes it, for a change of one thing (the On/Off switch).
export const feedInput = (f: Feed): FeedInput & { active: boolean } => ({
  url: f.url,
  social_set_id: f.social_set_id,
  platforms: f.platforms,
  template: f.template,
  mode: f.mode,
  active: f.active,
});

export const MAX_FEEDS = 20;
export const MAX_TEMPLATE = 2000;
export const DEFAULT_TEMPLATE = "{title}\n{link}";
export const PLACEHOLDERS = ["{title}", "{link}", "{summary}"] as const;
// An item has no video, so brain refuses these two.
export const UNSUPPORTED = ["tiktok", "youtube"];

export const modes: { id: FeedMode; summary: string; label: string; hint: string }[] = [
  { id: "draft", summary: "Saves a draft", label: "Save a draft", hint: "Each new item waits in Posts as a draft until someone schedules it." },
  { id: "queue", summary: "Adds to the queue", label: "Add to the queue", hint: "Each new item takes the set's next free queue slot. With no slot free it is saved as a draft." },
  { id: "now", summary: "Posts right away", label: "Post right away", hint: "Each new item is posted as soon as it is found." },
];
export const modeSummary = (m: FeedMode) => modes.find((x) => x.id === m)?.summary ?? m;

// The networks a feed of this set can post to: the set's connected ones, in `order`, without TikTok and YouTube.
export function feedPlatforms(setId: string, accounts: Pick<Connection, "provider" | "set_ids">[], order: string[]) {
  const has = new Set(accounts.filter((a) => a.set_ids.includes(setId)).map((a) => a.provider));
  return order.filter((p) => has.has(p) && !UNSUPPORTED.includes(p));
}

export type FeedField = "url" | "set" | "platforms" | "template" | "mode";
const fields: Record<string, FeedField> = { url: "url", social_set_id: "set", platforms: "platforms", template: "template", mode: "mode" };
// The form field a refusal is about; null when it concerns the whole form.
export function feedField(p: Problem): FeedField | null {
  if (p.code === "feed_unreadable") return "url";
  if (p.code === "platform_not_supported") return "platforms";
  return p.code === "invalid_feed" ? (fields[p.field ?? ""] ?? null) : null;
}

const invalid: Record<FeedField, string> = {
  url: "Use a public https link to the feed, like https://example.com/feed.xml.",
  set: "That set no longer exists. Pick another one.",
  platforms: "Tick at least one network the set has an account for.",
  template: `Write the post text, and keep it within ${MAX_TEMPLATE} characters.`,
  mode: "Pick what happens to a new item.",
};

// What the feeds' own refusals mean; null for the rest, which the shared messages in team-ui cover.
// `name` turns brain's platform id into its name.
export function feedText(p: Problem, name: (platform: string) => string = (x) => x): string | null {
  switch (p.code) {
    case "invalid_feed": {
      const f = feedField(p);
      return f ? invalid[f] : "That feed isn't valid. Check each field and try again.";
    }
    case "platform_not_supported":
      return `Feeds can't post to ${p.platform ? name(p.platform) : "that network"}: it takes video only, and a feed item has none.`;
    case "feed_unreadable":
      return `That feed couldn't be read${p.reason ? ` (${p.reason})` : ""}. Check that the link opens an RSS or Atom feed.`;
    case "too_many_feeds":
      return `This team already has ${MAX_FEEDS} feeds, the most allowed. Delete one first.`;
    case "checked_recently":
      return "This feed was checked less than a minute ago. Try again in a minute.";
    case "forbidden":
      return "Only team owners and admins can add or change feeds.";
    case "not_found":
      return "That feed no longer exists. Reload the page.";
    default:
      return null;
  }
}

// A made-up item for the template preview.
export const SAMPLE_ITEM = {
  title: "Five ways to plan a week of posts",
  link: "https://example.com/blog/plan-a-week",
  summary: "A short guide to batching ideas, picking times and keeping a steady rhythm.",
};
// The template with its placeholders filled in, as brain does for each item (before any cut to a network's limit).
export const fillTemplate = (template: string, item: { title: string; link: string; summary: string } = SAMPLE_ITEM) =>
  template.replace(/\{(title|link|summary)\}/g, (_, k: "title" | "link" | "summary") => item[k]);

// The feed's host and the rest of its address, to show the host in bold.
export function feedHost(url: string): [string, string] {
  try {
    const u = new URL(url);
    return [u.host, u.pathname === "/" && !u.search ? "" : u.pathname + u.search];
  } catch {
    return [url, ""];
  }
}
