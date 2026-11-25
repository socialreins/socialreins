import { failure, request, type Failure } from "@/lib/auth";
import { CONNECT_TIMEOUT_MS } from "@/lib/connections";

// An X account's inbox, as brain's GET /v1/connections/{id}/x-inbox answers. Reading X costs money (X bills each
// post, user and DM returned), so it is off until a person turns it on, and the amounts here are in dollars.
export type XInbox = {
  enabled: boolean;
  read_dms: boolean;
  poll_minutes: number;
  budget_usd: number;
  spent_usd: number;
  // Why polling stopped (credits, usage_capped, budget, errors) and what to do; null while it runs.
  paused: string | null;
  message: string | null;
  last_error: string | null;
  last_read_at: string | null;
  can_read_dms: boolean;
  can_like: boolean;
  can_hide: boolean;
  reconnect: boolean;
  // With billing on, the team's X credits pay too.
  credits: boolean;
  reads_per_credit: number;
  estimate: { per_mention_usd: number; per_dm_usd: number; idle_month_usd: number; projected_month_usd: number };
  limits: { min_poll_minutes: number; max_poll_minutes: number; default_poll_minutes: number; min_budget_usd: number; max_budget_usd: number; default_budget_usd: number };
};
export type XInboxInput = { enabled?: boolean; read_dms?: boolean; poll_minutes?: number; budget_usd?: number };
// A refusal brain explains with a code (and, for a send, a message).
export type Refusal = { code: string; message: string | null };
export const isRefusal = (r: unknown): r is Refusal => typeof r === "object" && r !== null && "code" in r;

const enc = encodeURIComponent;

async function call<T>(path: string, method: string, body?: unknown): Promise<T | Failure | Refusal> {
  const res = await request(path, method, body, CONNECT_TIMEOUT_MS);
  if (typeof res === "string") return res;
  if (res.ok) return (res.status === 204 ? "ok" : await res.json()) as T;
  const b = await res.clone().json().catch(() => null);
  if ([409, 422, 429].includes(res.status) && typeof b?.error === "string") return { code: b.error, message: typeof b.message === "string" ? b.message : null };
  return failure(res);
}

export const getXInbox = (id: string) => call<XInbox>(`/v1/connections/${enc(id)}/x-inbox`, "GET");
export const setXInbox = (id: string, input: XInboxInput) => call<XInbox>(`/v1/connections/${enc(id)}/x-inbox`, "PUT", input);
export const resumeXInbox = (id: string) => call<XInbox>(`/v1/connections/${enc(id)}/x-inbox/resume`, "POST", {});

export type XAction = "like" | "repost" | "hide" | "unhide";
export const xAction = (itemId: string, action: XAction) => call<"ok">(`/v1/inbox-items/${enc(itemId)}/x-action`, "POST", { action });

// What brain's codes mean to a person.
export const xMessages: Record<string, string> = {
  invalid_poll: "Read every 15 minutes to once a day.",
  invalid_budget: "Choose a monthly budget between $0.10 and $100.",
  reconnect_for_dms: "This account was connected without the DM permissions. Reconnect it to read and send DMs.",
  action_in_progress: "Another action on this item is still going out. Try again in a moment.",
  reconnect_required: "X refused this account's sign-in. Reconnect it first.",
  x_reconnect_required: "This account was connected without that permission, or X refused its sign-in. Reconnect it.",
  not_repliable: "That doesn't work on this item.",
  rate_limited: "Too many at once. Try again in a minute.",
  invalid_action: "That doesn't work on this item.",
};

export const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
// A short label for a number of minutes between reads.
export const everyText = (m: number) => (m % 1440 === 0 ? (m === 1440 ? "day" : `${m / 1440} days`) : m % 60 === 0 ? (m === 60 ? "hour" : `${m / 60} hours`) : `${m} minutes`);
export const POLL_CHOICES = [15, 30, 60, 120, 240, 720, 1440];
