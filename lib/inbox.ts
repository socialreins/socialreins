import { api, failure, request, type Failure } from "@/lib/auth";
import { CONNECT_TIMEOUT_MS } from "@/lib/connections";
import { graphemes, threadsLength } from "@/lib/posts";

export type Kind = "comment" | "mention" | "dm";
export const KINDS: Kind[] = ["comment", "mention", "dm"];
export type ActivityKind = "follow" | "like" | "repost";
export const isActivity = (kind: Item["kind"]): kind is ActivityKind => kind === "follow" || kind === "like" || kind === "repost";
// What the item list can be narrowed to: a kind, or all the quiet activity.
export type ListKind = Kind | "activity";
export type ItemState = "open" | "done";

// What narrows an inbox beyond its accounts. Empty lists mean any.
export type Filters = { kinds: Kind[]; keywords: string[]; unanswered: boolean };
// A custom inbox holds the items of its accounts; "All" (`is_all`) holds every item and no `account_ids`.
// `open_count` (open items, follows left out) comes with the list only.
export type Inbox = { id: string; number: number; name: string; is_all: boolean; account_ids: string[]; filters: Filters; open_count?: number; created_at: string; updated_at: string };

// Platforms whose accounts have an inbox.
export const INBOX_PLATFORMS = ["bluesky", "facebook", "instagram", "threads", "x", "youtube"];
export const inboxCapable = <A extends { provider: string }>(accounts: A[]) => accounts.filter((a) => INBOX_PLATFORMS.includes(a.provider));
export const inboxName = (i: Inbox) => (i.is_all ? "All inboxes" : i.name);
// Inbox-capable accounts no custom inbox holds: their items show only in All inboxes.
export function unboxed<A extends { id: string; provider: string }>(accounts: A[], inboxes: Inbox[]) {
  const held = new Set(inboxes.flatMap((i) => i.account_ids));
  return inboxCapable(accounts).filter((a) => !held.has(a.id));
}
// The inbox before or after `id` in the switcher, wrapping around; null with fewer than two.
export function stepInbox(inboxes: Inbox[], id: string | undefined, by: 1 | -1) {
  if (inboxes.length < 2) return null;
  const at = Math.max(0, inboxes.findIndex((i) => i.id === id));
  return inboxes[(at + by + inboxes.length) % inboxes.length]!;
}
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
  // The number in its address; the UUID `id` still works in brain's API and in old links.
  number: number;
  social_account_id: string;
  platform: string;
  // Activity (a new Bluesky follower, a like or repost of one of our posts) is quiet: stored done, listed only when asked for (`ListKind` "activity"), though an automation run links to a follow.
  kind: Kind | ActivityKind;
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
  contact_number?: number | null;
  contact_tags?: string[];
  assigned_to?: { id: string; name: string } | null;
  // The custom inboxes that hold it, for chips in All inboxes. Missing from an older brain.
  inbox_ids?: string[];
  // Photos, stickers, videos, files and links it carries, https only. Meta's links expire after a while. Missing from an older brain.
  attachments?: Attachment[];
  // On a list row that stands for a whole DM conversation (the row is its latest DM); null or missing otherwise.
  conversation?: Conversation | null;
  // Facebook and Instagram comments: what was done to it from here and what still can be. Missing for anything else or from an older brain.
  moderation?: Moderation | null;
  // Facebook and Instagram DMs: how long Meta takes a reply. Missing for anything else or from an older brain.
  reply_window?: ReplyWindow | null;
  // YouTube comments: the video it is on (as last read), and for a reply the comment it answers. Missing for anything else.
  video?: { id: string; title: string; thumbnail_url: string | null; url: string } | null;
  reply_to?: { author_name: string | null; text: string } | null;
};
// Facebook and Instagram: hide, unhide, delete, like, unlike. YouTube: hold (for review), publish again, reject (for good), ban the author too.
export type ModerationAction = "hide" | "unhide" | "delete" | "like" | "unlike" | "hold" | "publish" | "reject" | "ban";
export type Moderation = { hidden: boolean; liked: boolean; deleted: boolean; can: ModerationAction[] };
export type ReplyWindow = { last_message_at: string; closes_at: string; human_agent_until: string | null; open: boolean };
export type Attachment = { kind: "image" | "video" | "sticker" | "gif" | "audio" | "file" | "link"; url: string; preview_url?: string };
export const attachmentName: Record<Attachment["kind"], string> = { image: "Photo", video: "Video", sticker: "Sticker", gif: "GIF", audio: "Audio", file: "File", link: "Link" };
// What a list row says: the text, else what the item carries ("Photo", "Sticker and 1 more"), never "(no text)" when it carries something.
export function itemSummary(i: Pick<Item, "text" | "attachments"> & { kind?: Item["kind"] }): string {
  if (i.text) return i.text;
  if (i.kind === "like") return "Liked your post";
  if (i.kind === "repost") return "Reposted your post";
  if (i.kind === "follow") return "Followed you";
  const [first, ...rest] = i.attachments ?? [];
  if (!first) return "(no text)";
  return rest.length ? `${attachmentName[first.kind]} and ${rest.length} more` : attachmentName[first.kind];
}
export type Conversation = { count: number; open_count: number; first_at: string; last_at: string };
export type ItemPage = { items: Item[]; next_cursor: string | null };

// Bluesky's limits as brain checks them: a public reply is a post, a DM is a chat message.
export const MAX_PUBLIC = 300;
export const MAX_DM = 1000;
// Facebook takes comments of 8000 characters and messages of 2000; Instagram comments of 2200 and messages of 1000;
// X replies of 280 and messages of 10,000; Threads replies of 500 and no messages; YouTube replies of 10,000 and no messages. The reply counter counts characters, X weights them
// (a link is 23) and Threads counts an emoji as its UTF-8 bytes (`replyLength`), so brain has the last word.
const META_MAX: Record<string, { public: number; dm: number }> = {
  facebook: { public: 8000, dm: 2000 },
  instagram: { public: 2200, dm: 1000 },
  threads: { public: 500, dm: 0 },
  x: { public: 280, dm: 10000 },
  youtube: { public: 10000, dm: 0 },
};
// What a reply counts against `maxFor`: Threads counts an emoji as its UTF-8 bytes, every other network a character.
export const replyLength = (provider: string | undefined, text: string) => (provider === "threads" ? threadsLength(text) : graphemes(text));
export const maxFor = (kind: Item["kind"], provider?: string) => {
  const meta = provider ? META_MAX[provider] : undefined;
  if (meta) return kind === "dm" ? meta.dm : meta.public;
  return kind === "dm" ? MAX_DM : MAX_PUBLIC;
};

export const kindName: Record<Item["kind"], string> = { comment: "Comment", mention: "Mention", dm: "DM", follow: "Follow", like: "Like", repost: "Repost" };

const enc = encodeURIComponent;

export const listInboxes = () => api<Inbox[]>("/v1/inboxes");
export type InboxInput = { name: string; account_ids: string[]; filters: Filters };
export const createInbox = (input: InboxInput) => api<Inbox>("/v1/inboxes", "POST", input);
export const updateInbox = (id: string, input: InboxInput) => api<Inbox>(`/v1/inboxes/${enc(id)}`, "PUT", input);
export const deleteInbox = (id: string) => api(`/v1/inboxes/${enc(id)}`, "DELETE");

// `search` looks in the text and the author's name and handle; brain takes 1 to 100 characters.
// `assigned` is "me", "none" or a user id; `tag` is a contact tag.
// `conversations` asks for DMs as one row per person and account; comments and mentions come as they are.
export function listItems(inboxId: string, state: ItemState, cursor?: string | null, kind?: ListKind | null, search?: string, more: { assigned?: string; tag?: string; conversations?: boolean } = {}) {
  // Activity is stored done and never open work: it is listed whatever the Open / Done choice is.
  const q = new URLSearchParams(more.conversations ? { state, group: "conversations" } : { state });
  if (kind === "activity") q.delete("state");
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

// The posts above a comment, mention, like or repost in its Bluesky thread, read live as the account sees them:
// oldest first, a like or repost ending with the post that was liked. `truncated` when the chain ends at a deleted or hidden post.
export type ThreadPost = { uri: string; url: string | null; author: Author; text: string; created_at: string | null; attachments: Attachment[] };
export type ThreadContext = { posts: ThreadPost[]; truncated: boolean };
export const getThread = (id: string) => api<ThreadContext>(`/v1/inbox-items/${enc(id)}/thread`);
// Whether an item has a thread to read: replies and mentions, and the posts a like or repost points at.
// On Threads, the posts a reply or mention answers.
export const hasThread = (i: Pick<Item, "kind" | "platform">) =>
  (i.platform === "bluesky" && (i.kind === "comment" || i.kind === "mention" || i.kind === "like" || i.kind === "repost")) ||
  (i.platform === "threads" && (i.kind === "comment" || i.kind === "mention"));

// What a person does from a Bluesky item beyond replying. Brain asks for `confirm`, logs every attempt, and
// leaves block, hide, delete and report to owners and admins.
export type ActionName =
  | "like" | "unlike" | "repost" | "unrepost" | "follow" | "unfollow" | "mute_author" | "unmute_author" | "mute_thread" | "unmute_thread"
  | "block_author" | "unblock_author" | "hide_reply" | "unhide_reply" | "delete_reply" | "report"
  | "accept_convo" | "leave_convo" | "mute_convo" | "unmute_convo" | "mark_read" | "delete_message" | "react" | "unreact";
export type Viewer = { liked: boolean; reposted: boolean; following: boolean; blocking: boolean; muted: boolean; thread_muted: boolean };
export type ActionLog = { id: string; action: ActionName; status: "done" | "failed"; target: string; error: string | null; reply_id: string | null; done_by: string | null; created_at: string };
// `viewer` is null when Bluesky could not be read (`viewer_error` says why); `hidden` is the state the last hide or unhide here left.
// A DM's conversation as Bluesky has it now: `request` until the account accepts it, `group` when a reply reaches everyone in it.
export type Convo = { status: "accepted" | "request"; muted: boolean; group: boolean; members: number; unread: number };
export type ItemActions = { viewer: Viewer | null; viewer_error: string | null; convo: Convo | null; hidden: boolean; log: ActionLog[] };
export const getActions = (id: string) => api<ItemActions>(`/v1/inbox-items/${enc(id)}/actions`);
export const REPORT_REASONS: [string, string][] = [
  ["spam", "Spam"],
  ["violation", "Breaks the rules"],
  ["misleading", "Misleading"],
  ["sexual", "Sexual content"],
  ["rude", "Rude or harassing"],
  ["other", "Something else"],
];
export type ActionInput = { action: ActionName; reply_id?: string; reason_type?: string; reason?: string; account?: boolean; emoji?: string };
// The reactions offered on a message: Bluesky takes one emoji.
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢"];
export type ActionResult = { remote_id: string | null } | Failure | SendError;
// Sends one action, confirmed. A 4xx with a code and message from brain is a SendError saying what to do.
export async function runAction(id: string, input: ActionInput): Promise<ActionResult> {
  const res = await request(`/v1/inbox-items/${enc(id)}/actions`, "POST", { ...input, confirm: true }, CONNECT_TIMEOUT_MS);
  if (typeof res === "string") return res === "timeout" ? "timeout" : "error";
  if (res.ok) return ((await res.json().catch(() => null)) as { remote_id: string | null } | null) ?? { remote_id: null };
  const body = await res.clone().json().catch(() => null);
  if (res.status === 422 && typeof body?.message === "string") return { code: String(body.error), message: body.message };
  if (res.status === 409 && body?.error === "already_reported") return { code: "already_reported", message: "This was already reported from here." };
  return failure(res);
}

export type ActionButton = { action: ActionName; label: string; confirm: string; danger?: boolean };
// The actions an item offers, worded by the account's live state. Like, repost and thread mute need a post of ours to answer (a comment or
// mention); hiding needs one too; the rest act on its author. Block, hide and report are for owners and admins.
export function actionButtons(item: Pick<Item, "kind" | "platform" | "author">, v: Viewer | null, canManage: boolean): ActionButton[] {
  if (item.platform !== "bluesky") return [];
  const who = item.author.handle ? `@${item.author.handle}` : (item.author.name ?? "this person");
  const post = item.kind === "comment" || item.kind === "mention";
  const out: ActionButton[] = [];
  if (post) {
    out.push(v?.liked ? { action: "unlike", label: "Unlike", confirm: "Remove your like from this post?" } : { action: "like", label: "Like", confirm: `Like ${who}'s post as this account?` });
    out.push(v?.reposted ? { action: "unrepost", label: "Undo repost", confirm: "Remove your repost of this post?" } : { action: "repost", label: "Repost", confirm: `Repost ${who}'s post to this account's followers?` });
    out.push(v?.thread_muted ? { action: "unmute_thread", label: "Unmute thread", confirm: "Get notifications from this thread again?" } : { action: "mute_thread", label: "Mute thread", confirm: "Stop notifications from this thread on Bluesky?" });
  }
  out.push(v?.following ? { action: "unfollow", label: "Unfollow", confirm: `Unfollow ${who}?` } : { action: "follow", label: "Follow back", confirm: `Follow ${who} from this account?` });
  out.push(v?.muted ? { action: "unmute_author", label: "Unmute person", confirm: `Unmute ${who}?` } : { action: "mute_author", label: "Mute person", confirm: `Mute ${who} on this account? They are not told.` });
  if (canManage) {
    out.push(v?.blocking ? { action: "unblock_author", label: "Unblock", confirm: `Unblock ${who}?` } : { action: "block_author", label: "Block", confirm: `Block ${who}? They can no longer see this account's posts or reply to them.`, danger: true });
    if (post) out.push({ action: "hide_reply", label: "Hide reply", confirm: "Hide this reply from the thread? It stays on Bluesky, but is folded away for others.", danger: true });
  }
  return out;
}

// What each action says once it went through.
export const actionDone: Record<ActionName, string> = {
  like: "Liked.", unlike: "Like removed.", repost: "Reposted.", unrepost: "Repost removed.", follow: "Followed.", unfollow: "Unfollowed.",
  mute_author: "Muted.", unmute_author: "Unmuted.", mute_thread: "Thread muted.", unmute_thread: "Thread unmuted.", block_author: "Blocked.", unblock_author: "Unblocked.",
  hide_reply: "Reply hidden.", unhide_reply: "Reply shown again.", delete_reply: "Reply deleted from Bluesky.", report: "Reported to Bluesky.",
  accept_convo: "Request accepted.", leave_convo: "Request declined.", mute_convo: "Conversation muted.", unmute_convo: "Conversation unmuted.", mark_read: "Marked read.",
  delete_message: "Message deleted for this account.", react: "Reaction sent.", unreact: "Reaction removed.",
};

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
const SHORTCUTS = { j: "next", k: "previous", e: "done", r: "reply", a: "assign", "/": "search", "?": "help", "[": "previousInbox", "]": "nextInbox" } as const;
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

// A moderation that Meta did not take, or took: the item brain now holds. Delete and the rest are one call each.
// On YouTube `delete_reply` with a reply id takes back one of the channel's own replies.
export async function moderateItem(id: string, action: ModerationAction | "delete_reply", replyId?: string): Promise<Item | Failure | SendError> {
  const res = await request(`/v1/inbox-items/${enc(id)}/moderate`, "POST", replyId ? { action, reply_id: replyId } : { action }, CONNECT_TIMEOUT_MS);
  if (typeof res === "string") return res;
  if (res.ok) return (await res.json().catch(() => null)) ?? "error";
  const body = await res.clone().json().catch(() => null);
  if (res.status === 422 && typeof body?.message === "string") return { code: String(body.error), message: body.message };
  return failure(res);
}

const hoursLeft = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (minutes < 2880) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} ${h === 1 ? "hour" : "hours"}${m ? ` ${m} min` : ""}`;
  }
  return `${Math.floor(minutes / 1440)} days`;
};
// What a Meta DM's window says to the person replying: how long Meta still takes a message, or why none goes out.
// `blocked` is true when a send would be refused (the 24 hours are over and no Human Agent tag applies).
export function windowNote(w: ReplyWindow, now = Date.now()): { text: string; blocked: boolean } {
  const closes = Date.parse(w.closes_at);
  if (closes > now) return { text: `Meta takes a reply for ${hoursLeft(closes - now)} more, 24 hours after their last message.`, blocked: false };
  const agent = w.human_agent_until ? Date.parse(w.human_agent_until) : 0;
  if (agent > now) return { text: `The 24 hours are over. A reply still goes out as a person's reply for ${hoursLeft(agent - now)} more.`, blocked: false };
  return {
    text: w.human_agent_until
      ? "Meta takes no reply now: it is more than 7 days since their last message."
      : "Meta takes no message more than 24 hours after the person's last one. Answering later, up to 7 days, needs Meta's Human Agent permission, which SocialReins has not been granted yet.",
    blocked: true,
  };
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
