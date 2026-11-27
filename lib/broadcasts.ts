import { api, failure, request, type Failure } from "@/lib/auth";

// One DM to every reachable contact with a tag. Every member reads; owners and admins write, preview and send.
export type BroadcastStatus = "draft" | "sending" | "paused" | "sent" | "cancelled";
export type Counts = { total: number; sent: number; skipped: number; failed: number; pending: number };
export type Broadcast = {
  id: string;
  // The number in its address; the UUID `id` still works in brain's API and in old links.
  number: number;
  name: string;
  text: string;
  tag: string;
  // null: Bluesky, Facebook and Instagram together.
  platform: string | null;
  status: BroadcastStatus;
  // Only while paused: what the network said.
  pause_reason: string | null;
  counts: Counts;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
export type BroadcastInput = Pick<Broadcast, "name" | "text" | "tag" | "platform">;

export const PREVIEW_REASONS = ["opted_out", "outside_window", "no_conversation", "account_disconnected", "recently_messaged"] as const;
export type PreviewReason = (typeof PREVIEW_REASONS)[number];
// Who a draft would go to if it started now. `total` is `reachable` plus the five reasons.
export type Preview = {
  total: number;
  reachable: number;
  by_reason: Record<PreviewReason, number>;
  by_platform: { platform: string; reachable: number }[];
  sample: { contact_id: string; display_name: string | null; platform: string }[];
};

// `delivering`: the send to this person has started.
export type RecipientStatus = "pending" | "sending" | "delivering" | "sent" | "skipped" | "failed";
// The contact's fields are null once it was deleted.
export type Recipient = {
  id: string;
  contact_id: string | null;
  contact_number: number | null;
  display_name: string | null;
  handle: string | null;
  platform: string | null;
  status: RecipientStatus;
  reason: string | null;
  updated_at: string;
};
export type RecipientPage = { items: Recipient[]; next_cursor: string | null };

// A refusal with what brain adds to it: `field` (invalid_broadcast), `preview` (audience_changed).
export type Problem = { code: Failure; field?: string; preview?: Preview };
export const isProblem = (r: unknown): r is Problem => typeof r === "object" && r !== null && "code" in r;

async function call<T>(path: string, method: string, body: unknown): Promise<T | Problem> {
  const res = await request(path, method, body);
  if (typeof res === "string") return { code: res };
  if (res.ok) return (await res.json()) as T;
  const code = await failure(res.clone());
  const extra = await res.json().catch(() => null);
  return { code, field: typeof extra?.field === "string" ? extra.field : undefined, preview: code === "audience_changed" && extra?.preview ? extra.preview : undefined };
}

const enc = encodeURIComponent;
const one = (id: string) => `/v1/broadcasts/${enc(id)}`;

// Newest first, the latest 200.
export const listBroadcasts = () => api<Broadcast[]>("/v1/broadcasts");
export const getBroadcast = (id: string) => api<Broadcast>(one(id));
export const createBroadcast = (b: BroadcastInput) => call<Broadcast>("/v1/broadcasts", "POST", b);
// Drafts only: 409 already_started for anything else.
export const updateBroadcast = (id: string, b: BroadcastInput) => call<Broadcast>(one(id), "PUT", b);
// A draft or a finished one: 409 still_sending while it sends or is paused.
export const deleteBroadcast = (id: string) => api(one(id), "DELETE");
export const previewBroadcast = (id: string) => api<Preview>(`${one(id)}/preview`, "POST");
// Starts a draft only when `confirmTotal` is still the reachable count: else 409 audience_changed with the new preview.
export const sendBroadcast = (id: string, confirmTotal: number) => call<Broadcast>(`${one(id)}/send`, "POST", { confirm_total: confirmTotal });
export const cancelBroadcast = (id: string) => api<Broadcast>(`${one(id)}/cancel`, "POST");
export const resumeBroadcast = (id: string) => api<Broadcast>(`${one(id)}/resume`, "POST");
// 100 a page; pass `next_cursor` back as `cursor`. Owners and admins.
export function listRecipients(id: string, status?: RecipientStatus | null, cursor?: string | null) {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (cursor) p.set("cursor", cursor);
  return api<RecipientPage>(`${one(id)}/recipients${p.size ? `?${p}` : ""}`);
}

export const MAX_NAME = 80;
export const MAX_TEXT = 1000;
export const MAX_RECIPIENTS = 1000;
// The networks a broadcast can message.
export const PLATFORMS = ["bluesky", "facebook", "instagram"];
export const NAME = "{name}";
// brain checks the text with every {name} at its longest, 64 characters, counted by code points.
export const broadcastLength = (text: string) => [...text.trim().replaceAll(NAME, "n".repeat(64))].length;
// What a person called `name` gets; brain says "there" to someone without a usable name.
export const example = (text: string, name?: string | null) => text.replaceAll(NAME, name?.trim() || "there");

export const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

// What is true of every broadcast, for the empty list and the review step.
export const RULES = [
  "Facebook and Instagram only let you message someone within 24 hours of their last message to you.",
  "Bluesky delivers only to people who accept DMs.",
  'Anyone who replies "stop" is opted out and gets no more broadcasts. "start" opts them back in.',
  "Nobody gets more than one broadcast in 24 hours.",
  "A broadcast pauses itself when a network refuses it or slows it down, and waits for you to resume.",
  `A team can start 3 broadcasts a day, each to at most ${MAX_RECIPIENTS} people.`,
];

// Why a person with the tag would not get a draft, for a count of them ("3 opted out of broadcasts").
const notReached: Record<PreviewReason, string> = {
  opted_out: "opted out of broadcasts",
  outside_window: "last wrote more than 24 hours ago, and Facebook and Instagram allow no message after that",
  no_conversation: "never sent you a message, so there is no conversation to write in",
  account_disconnected: "wrote to an account that is disconnected or needs a reconnect",
  recently_messaged: "already got a broadcast in the last 24 hours",
};
// The preview's reasons above zero, biggest first, each with its count and plain words.
export const breakdown = (p: Preview) =>
  PREVIEW_REASONS.map((reason) => ({ reason, count: p.by_reason[reason] ?? 0, text: notReached[reason] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

const reasons: Record<string, string> = {
  opted_out: "Opted out of broadcasts",
  outside_window: "Last wrote more than 24 hours ago",
  no_conversation: "Never sent a message",
  account_disconnected: "The account is disconnected",
  recently_messaged: "Got another broadcast in the last 24 hours",
  untagged: "The tag was removed",
  dm_not_allowed: "Does not accept DMs",
  cancelled: "The broadcast was cancelled first",
  contact_gone: "The contact was deleted",
  too_long: "The message was too long with their name",
  interrupted: "Cut off while sending, not tried again",
  internal: "Something went wrong on our side",
  rate_limited: "The network slowed us down",
};
// Why one recipient was skipped or failed, in plain words. A network's own refusal keeps its code.
export const reasonText = (reason: string | null) => (reason ? (reasons[reason] ?? `The network refused it (${reason.replaceAll("_", " ")})`) : "");

export const statusName: Record<BroadcastStatus, string> = { draft: "Draft", sending: "Sending", paused: "Paused", sent: "Sent", cancelled: "Cancelled" };
export const recipientStatusName: Record<RecipientStatus, string> = { pending: "Waiting", sending: "Sending", delivering: "Sending", sent: "Sent", skipped: "Skipped", failed: "Failed" };

export const PARTS = ["sent", "skipped", "failed", "pending"] as const;
// Sent, skipped, failed and pending as percents of the total, and `done`: the whole percent no longer waiting.
// null before the start, when there is nobody yet.
export function progress(c: Counts) {
  if (!(c.total > 0)) return null;
  const of = (n: number) => (Math.min(Math.max(0, n), c.total) / c.total) * 100;
  // Never 100 while someone waits: 999 of 1000 is 99.
  return { sent: of(c.sent), skipped: of(c.skipped), failed: of(c.failed), pending: of(c.pending), done: Math.floor(of(c.total - c.pending)) };
}

const invalid: Record<string, string> = {
  name: `Give the broadcast a name of 1 to ${MAX_NAME} characters.`,
  text: `Write the message, and keep it within ${MAX_TEXT} characters. Each {name} counts as 64.`,
  tag: "Pick the tag of the people to message.",
  platform: "Pick Bluesky, Facebook, Instagram or all three.",
};

// What a broadcast's own refusals mean; null for the rest, which the shared messages in team-ui cover.
export function broadcastText(code: Failure, field?: string): string | null {
  switch (code) {
    case "invalid_broadcast":
      return invalid[field ?? ""] ?? "That broadcast isn't valid. Check each field and try again.";
    case "already_started":
      return "This broadcast was already started, so it can't be changed or sent again. Reload to see it.";
    case "still_sending":
      return "This broadcast is still going out. Cancel it first, then delete it.";
    case "audience_changed":
      return "The people who can get this changed while you were looking. Check the new numbers, then send again.";
    case "another_sending":
      return "Another broadcast of this team is still going out. Wait until it finishes, or cancel it.";
    case "no_recipients":
      return "Nobody with this tag can get a message right now, so nothing was sent.";
    case "too_many_recipients":
      return `A broadcast goes to at most ${MAX_RECIPIENTS} people. Pick a smaller tag or one network.`;
    case "too_many_broadcasts":
      return "This team already started 3 broadcasts in the last 24 hours, the most allowed. Try again later.";
    case "not_sending":
      return "This broadcast is no longer going out, so there is nothing to cancel. Reload to see it.";
    case "not_paused":
      return "This broadcast is not paused. Reload to see it.";
    case "forbidden":
      return "Only team owners and admins can write and send broadcasts.";
    case "not_found":
      return "That broadcast no longer exists.";
    default:
      return null;
  }
}
