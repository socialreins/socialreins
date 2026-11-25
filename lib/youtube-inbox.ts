import { failure, request, type Failure } from "@/lib/auth";
import { CONNECT_TIMEOUT_MS } from "@/lib/connections";

// A YouTube channel's inbox, as brain's GET /v1/connections/{id}/youtube-inbox answers. Reading comments costs YouTube
// quota units (the Google project's 10,000 a day are shared by every team), so it is off until a person turns it on.
export type YouTubeInbox = {
  enabled: boolean;
  poll_minutes: number;
  daily_units: number;
  units_today: number;
  write_units_today: number;
  // Why reading stopped (budget, quota, errors) and what to do; null while it runs.
  paused: string | null;
  message: string | null;
  last_error: string | null;
  last_read_at: string | null;
  reconnect: boolean;
  reconnect_for_comments: boolean;
  shared_exhausted: boolean;
  idle_units_per_day: number;
  write_units: number;
  limits: { min_poll_minutes: number; max_poll_minutes: number; default_poll_minutes: number; min_daily_units: number; max_daily_units: number; default_daily_units: number };
};
export type YouTubeInboxInput = { enabled?: boolean; poll_minutes?: number; daily_units?: number };
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

export const getYouTubeInbox = (id: string) => call<YouTubeInbox>(`/v1/connections/${enc(id)}/youtube-inbox`, "GET");
export const setYouTubeInbox = (id: string, input: YouTubeInboxInput) => call<YouTubeInbox>(`/v1/connections/${enc(id)}/youtube-inbox`, "PUT", input);
export const resumeYouTubeInbox = (id: string) => call<YouTubeInbox>(`/v1/connections/${enc(id)}/youtube-inbox/resume`, "POST", {});

// What brain's codes mean to a person.
export const youtubeMessages: Record<string, string> = {
  invalid_poll: "Read every 10 minutes to once a day.",
  invalid_budget: "Choose a daily budget between 20 and 2000 units.",
  reconnect_for_comments: "This channel was connected without the permission to read comments. Reconnect it.",
  reconnect_required: "YouTube refused this channel's sign-in. Reconnect it first.",
  youtube_reconnect_required: "YouTube refused this channel's sign-in, or a permission is missing. Reconnect it.",
  rate_limited: "Too many at once. Try again in a minute.",
};

export const POLL_CHOICES = [10, 15, 30, 60, 120, 240, 720, 1440];
export const BUDGET_CHOICES = [100, 300, 600, 1000, 2000];
