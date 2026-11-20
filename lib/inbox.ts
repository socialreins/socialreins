import { api, failure, request, type Failure } from "@/lib/auth";
import { CONNECT_TIMEOUT_MS } from "@/lib/connections";

export type Kind = "comment" | "mention" | "dm";
export const KINDS: Kind[] = ["comment", "mention", "dm"];
export type ItemState = "open" | "done";

export type Filters = {
  social_set_id?: string | null;
  account_ids: string[];
  kinds: Kind[];
  platforms: string[];
  keywords: string[];
  unanswered: boolean;
};
// `open_count` (open items, follows left out) comes with the list only.
export type Inbox = { id: string; name: string; is_all: boolean; filters: Filters; open_count?: number; created_at: string; updated_at: string };
export type Author = { id: string; handle: string | null; name: string | null; avatar_url: string | null };
export type Reply = {
  id: string;
  kind: "public" | "dm";
  text: string;
  remote_id: string | null;
  remote_url: string | null;
  sent_by: string | null;
  automation_id: string | null;
  created_at: string;
};
export type Item = {
  id: string;
  social_account_id: string;
  platform: string;
  // A follow (a new Bluesky follower) is listed only when asked for, but an automation run links to one.
  kind: Kind | "follow";
  remote_id: string;
  remote_url: string | null;
  convo_id: string | null;
  post_id: string | null;
  author: Author;
  text: string;
  received_at: string;
  state: ItemState;
  replied_at: string | null;
  replies: Reply[];
  // The contact behind the author, its tags and the team member the item is assigned to. Missing from an older brain.
  contact_id?: string | null;
  contact_tags?: string[];
  assigned_to?: { id: string; name: string } | null;
  // On a list row that stands for a whole DM conversation (the row is its latest DM); null or missing otherwise.
  conversation?: Conversation | null;
};
export type Conversation = { count: number; open_count: number; first_at: string; last_at: string };
export type ItemPage = { items: Item[]; next_cursor: string | null };

// Bluesky's limits as brain checks them: a public reply is a post, a DM is a chat message.
export const MAX_PUBLIC = 300;
export const MAX_DM = 1000;
// Facebook takes comments of 8000 characters and messages of 2000; Instagram comments of 2200 and messages of 1000.
const META_MAX: Record<string, { public: number; dm: number }> = { facebook: { public: 8000, dm: 2000 }, instagram: { public: 2200, dm: 1000 } };
export const maxFor = (kind: Item["kind"], provider?: string) => {
  const meta = provider ? META_MAX[provider] : undefined;
  if (meta) return kind === "dm" ? meta.dm : meta.public;
  return kind === "dm" ? MAX_DM : MAX_PUBLIC;
};

export const kindName: Record<Item["kind"], string> = { comment: "Comment", mention: "Mention", dm: "DM", follow: "Follow" };

const enc = encodeURIComponent;

export const listInboxes = () => api<Inbox[]>("/v1/inboxes");
export const createInbox = (name: string, filters: Filters) => api<Inbox>("/v1/inboxes", "POST", { name, filters });
export const updateInbox = (id: string, name: string, filters: Filters) =>
  api<Inbox>(`/v1/inboxes/${enc(id)}`, "PUT", { name, filters });
export const deleteInbox = (id: string) => api(`/v1/inboxes/${enc(id)}`, "DELETE");

// `search` looks in the text and the author's name and handle; brain takes 1 to 100 characters.
// `assigned` is "me", "none" or a user id; `tag` is a contact tag.
// `conversations` asks for DMs as one row per person and account; comments and mentions come as they are.
export function listItems(inboxId: string, state: ItemState, cursor?: string | null, kind?: Kind | null, search?: string, more: { assigned?: string; tag?: string; conversations?: boolean } = {}) {
  const q = new URLSearchParams(more.conversations ? { state, group: "conversations" } : { state });
  if (kind) q.set("kind", kind);
  if (search) q.set("q", search);
  if (more.assigned) q.set("assigned", more.assigned);
  if (more.tag) q.set("tag", more.tag);
  if (cursor) q.set("cursor", cursor);
  return api<ItemPage>(`/v1/inboxes/${enc(inboxId)}/items?${q}`);
}
export type Page = { items: Item[]; next: string | null };

// The newest page, fetched again, over the loaded pages. A complete fresh page, or one sharing
// nothing with the list, replaces it. Otherwise items newer than the list go on top, known ones
// update, and known ones gone from the fresh page's span drop. Unknown older items are left
// for Load more, so the order and its cursor stay right.
export function mergeFresh(loaded: Page, fresh: ItemPage): Page {
  const known = new Set(loaded.items.map((i) => i.id));
  if (!fresh.next_cursor || !fresh.items.some((i) => known.has(i.id))) return { items: fresh.items, next: fresh.next_cursor };
  const byId = new Map(fresh.items.map((i) => [i.id, i]));
  const newest = loaded.items[0]!.received_at;
  const oldest = fresh.items.at(-1)!.received_at;
  // A conversation whose latest DM changed has a new row id: its old row goes, wherever it sits.
  const threads = new Set(fresh.items.map(threadKey));
  const kept = loaded.items.flatMap((i) => (byId.has(i.id) ? [byId.get(i.id)!] : i.received_at >= oldest || threads.has(threadKey(i)) ? [] : [i]));
  return { items: [...fresh.items.filter((i) => !known.has(i.id) && i.received_at > newest), ...kept], next: loaded.next };
}

export const getItem = (id: string) => api<Item>(`/v1/inbox-items/${enc(id)}`);
// `conversation` applies the change, or the reply's Mark done, to every DM of the item's conversation.
const whole = (conversation: boolean) => (conversation ? { conversation: true } : {});
export const setItemState = (id: string, state: ItemState, conversation = false) =>
  api<Item>(`/v1/inbox-items/${enc(id)}`, "PATCH", { state, ...whole(conversation) });
// A team member's user id, or null for nobody.
export const assignItem = (id: string, userId: string | null, conversation = false) =>
  api<Item>(`/v1/inbox-items/${enc(id)}`, "PATCH", { assigned_to: userId, ...whole(conversation) });

// A page of a DM conversation, oldest first; `before` is the id of the oldest item on screen.
export type ConversationPage = { items: Item[]; has_more: boolean };
export function getConversation(id: string, before?: string) {
  const q = before ? `?before=${enc(before)}` : "";
  return api<ConversationPage>(`/v1/inbox-items/${enc(id)}/conversation${q}`);
}

// What a list row or an open item belongs to: a DM to its person and account, anything else to itself.
export const threadKey = (i: Item) => (i.kind === "dm" ? `dm:${i.social_account_id}:${i.author.id}` : i.id);

export const messageCount = (n: number) => `${n} ${n === 1 ? "message" : "messages"}`;

const dayOf = (iso: string) => new Date(iso).toDateString();
// "Today", "Yesterday", else the date, in the reader's own time zone.
export function dayLabel(iso: string, now = Date.now()) {
  const day = dayOf(iso);
  if (day === new Date(now).toDateString()) return "Today";
  if (day === new Date(now - 86_400_000).toDateString()) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export type ChatRow =
  | { type: "day"; key: string; label: string }
  | { type: "them"; key: string; at: string; text: string; item: Item }
  | { type: "us"; key: string; at: string; text: string; reply: Reply };
// A conversation as chat rows: their messages and our replies in time order, a day row before each new day.
export function chatRows(items: Item[], now = Date.now()): ChatRow[] {
  const seen = new Set<string>();
  const rows = items.flatMap((item): Exclude<ChatRow, { type: "day" }>[] => [
    { type: "them", key: item.id, at: item.received_at, text: item.text, item },
    ...item.replies.filter((r) => !seen.has(r.id) && seen.add(r.id)).map((reply) => ({ type: "us" as const, key: `r-${reply.id}`, at: reply.created_at, text: reply.text, reply })),
  ]);
  rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return rows.flatMap((row, n) => (n > 0 && dayOf(rows[n - 1]!.at) === dayOf(row.at) ? [row] : [{ type: "day" as const, key: `day-${row.key}`, label: dayLabel(row.at, now) }, row]));
}

// The inbox's one-key shortcuts. Never while typing, with a modifier key, or inside a dialog.
const SHORTCUTS = { j: "next", k: "previous", e: "done", r: "reply", a: "assign", "/": "search", "?": "help" } as const;
export type Shortcut = (typeof SHORTCUTS)[keyof typeof SHORTCUTS];
type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: EventTarget | null };
export function shortcutFor(e: KeyLike): Shortcut | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const el = e.target as (Partial<HTMLElement> & { closest?: (s: string) => unknown }) | null;
  if (el?.isContentEditable || el?.closest?.("input, textarea, select, [contenteditable], dialog, [role=menu]")) return null;
  return SHORTCUTS[e.key.toLowerCase() as keyof typeof SHORTCUTS] ?? null;
}

// A send that did not happen: brain's code and its message saying what to do.
export type SendError = { code: string; message: string };
// No clear answer. brain sends first and answers after, so a timeout, a lost connection or a 5xx
// may follow a reply that went out: never offer a plain retry for one.
export type Unsure = { unsure: true };
export type ReplyResult = Item | Failure | SendError | Unsure;

// 201 with the item and its replies. Sending waits on Bluesky, so it gets the connect timeout.
// Only a 4xx with a code brain names is a refusal; anything else is Unsure.
export async function replyToItem(id: string, text: string, conversation = false): Promise<ReplyResult> {
  const unsure: Unsure = { unsure: true };
  const res = await request(`/v1/inbox-items/${enc(id)}/reply`, "POST", { text, ...whole(conversation) }, CONNECT_TIMEOUT_MS);
  if (typeof res === "string" || res.status >= 500) return unsure;
  if (res.ok) return ((await res.json().catch(() => null)) as Item | null) ?? unsure;
  const body = await res.clone().json().catch(() => null);
  if (res.status === 422 && typeof body?.message === "string") return { code: String(body.error), message: body.message };
  const refused = await failure(res);
  return refused === "error" ? unsure : refused;
}

// The item that already carries our reply with this text, sent in the last two minutes: an unsure send that did go out.
export const SENT_WINDOW_MS = 120_000;
export const sentAlready = (items: Item[], text: string, now = Date.now()) =>
  items.find((i) => i.replies.some((r) => r.text.trim() === text.trim() && Math.abs(now - Date.parse(r.created_at)) <= SENT_WINDOW_MS));

// A fresh newest page laid over the loaded conversation. Earlier pages already loaded stay, with their own
// `has_more`; when the fresh page reaches past everything loaded, or shares nothing with it, the fresh page says.
export function mergeConversation(loaded: ConversationPage | null, fresh: ConversationPage): ConversationPage {
  const ids = new Set(fresh.items.map((i) => i.id));
  if (!loaded?.items[0] || ids.has(loaded.items[0].id) || !loaded.items.some((i) => ids.has(i.id))) return fresh;
  return { items: [...loaded.items.filter((i) => !ids.has(i.id)), ...fresh.items], has_more: loaded.has_more };
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
// "5 minutes ago", "yesterday"; under a minute is "now".
export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return "now";
}

export const authorName = (a: Author) => a.name || (a.handle ? `@${a.handle}` : a.id);
