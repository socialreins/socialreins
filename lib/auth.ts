import { apiUrl, captchaError, type Captcha } from "@/lib/waitlist";
import { MY_TEAM, teamPath } from "@/lib/team-path";
import { createCredential, getCredential, type CreationOptionsJSON, type RequestOptionsJSON } from "@/lib/webauthn";

export type LinkResult = "sent" | "invalid" | Captcha | "rate_limited" | "timeout" | "error";
export type Role = "owner" | "admin" | "member";
// `code` is the team's permanent address: /t/<code>/... (lib/team-path.ts). `slug` is the address the team
// picked for itself, shown instead of the code when set; brain takes either in X-Team and ?team=.
// `public_pages`: posts of the team may have a public page (`/p/<code>`); `newsletter`: those pages offer a sign-up;
// `require_approval`: a member's post waits for an owner or admin to approve it.
export type Team = { id: string; name: string; code: string; slug?: string | null; role: Role; public_pages?: boolean; newsletter?: boolean; newsletter_sender?: { name: string; address: string; logo?: string | null } | null; require_approval?: boolean };
export type User = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  current_team: Team;
  // Site admins see the /admin console; optional until every brain sends it.
  is_admin?: boolean;
};
// "not_found": the address names a team the user is not in, or no team at all; brain answers both the same.
export type MeResult = { user: User } | "signed_out" | "not_found" | "error";

// The team this tab is on, by code (never the slug, which may change mid-session; only the first call of
// a page carries what the address says). The app shell sets it from the address, and every call to brain
// carries it, so two tabs on two teams each act in their own. null: brain uses the account's current team.
let tabTeam: string | null = null;
export const setTabTeam = (code: string | null) => void (tabTeam = code);
export const getTabTeam = () => tabTeam;

const TIMEOUT_MS = 10_000;
// The session cookie lives on the API host, so every call sends it with credentials.
const opts = (init: RequestInit = {}): RequestInit => ({
  credentials: "include",
  ...init,
  headers: { ...init.headers, ...(tabTeam && { "X-Team": tabTeam }) },
  signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
});

// The API answers 202 for any valid email, so the reply never says whether an account exists.
// `token` is the Turnstile token, sent only when brain has Turnstile on. `name` comes from the sign-up form; without one the link only logs in to an existing account.
export async function requestLink(email: string, token: string | null = null, name: string | null = null): Promise<LinkResult> {
  try {
    const res = await fetch(
      `${apiUrl}/auth/link`,
      opts({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...(name ? { name } : { login_only: true }), ...(token && { turnstile_token: token }) }) }),
    );
    if (res.ok) return "sent";
    if (res.status === 422 || res.status === 503) {
      const captcha = await captchaError(res);
      if (captcha) return captcha;
    }
    if (res.status === 422) return "invalid";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";
  }
}

export async function getMe(): Promise<MeResult> {
  try {
    const res = await fetch(`${apiUrl}/auth/me`, opts());
    if (res.status === 401) return "signed_out";
    if (res.status === 404) return "not_found";
    if (!res.ok) return "error";
    return { user: (await res.json()) as User };
  } catch {
    return "error";
  }
}

export async function signOut(): Promise<boolean> {
  try {
    const ok = (await fetch(`${apiUrl}/auth/logout`, opts({ method: "POST" }))).ok;
    // The next person to sign in on this tab starts in their own current team.
    if (ok) tabTeam = null;
    return ok;
  } catch {
    return false;
  }
}

// Error codes brain sends for the auth endpoints.
export const codes = [
  "invalid_credentials",
  "reauth_required",
  "invalid_name",
  "invalid_challenge",
  "invalid_passkey",
  "passkey_exists",
  "not_found",
  "forbidden",
  "last_team",
  "last_owner",
  "invalid_role",
  "invalid_email",
  "already_member",
  "already_invited",
  "mail_failed",
  "email_mismatch",
  "invalid_handle",
  "unsupported_pds",
  "bluesky_unreachable",
  "invalid_query",
  "invalid_mode",
  "invalid_domains",
  "too_many_sets",
  "name_taken",
  "default_set",
  "invalid_sets",
  "default_set_required",
  "too_long",
  "too_many_images",
  "too_many_parts",
  "invalid_media",
  "empty_post",
  "invalid_set",
  "unsupported_platform",
  "too_many_posts",
  "not_editable",
  "details_too_long",
  "public_pages_off",
  "not_deletable",
  "publish_quota",
  "refreshed_recently",
  "invalid_range",
  "media_required",
  "thread_not_supported",
  "first_comment_not_supported",
  "first_comment_too_long",
  "cover_not_supported",
  "invalid_cover",
  "cover_needs_one_video",
  "media_type_not_supported",
  "mixed_media",
  "media_too_large",
  "invalid_cover_type",
  "cover_too_large",
  "tiktok_privacy_not_offered",
  "invalid_override",
  "no_accounts",
  "invalid_filters",
  "too_many_inboxes",
  "invalid_accounts",
  "invalid_upload",
  "too_many_uploads",
  "upload_interrupted",
  "uploads_in_progress",
  "all_inbox",
  "invalid_state",
  "invalid_text",
  "reply_in_progress",
  "invalid_trigger",
  "invalid_conditions",
  "invalid_actions",
  "invalid_fallback",
  "invalid_steps",
  "actions_and_steps",
  "too_many_automations",
  "invalid_expiry",
  "too_many_tokens",
  "invalid_post",
  "invalid_order",
  "invalid_position",
  "invalid_url",
  "invalid_pick",
  "nothing_picked",
  "tiktok_not_supported",
  "tiktok_privacy_required",
  "invalid_tiktok_privacy",
  "invalid_tiktok_disclosure",
  "tiktok_disclosure_incomplete",
  "tiktok_branded_content_private",
  "reconnect_required",
  "tiktok_failed",
  "invalid_time_zone",
  "invalid_slot",
  "duplicate_slot",
  "too_many_slots",
  "queue_with_scheduled_at",
  "queue_empty",
  "queue_not_supported",
  "already_in_library",
  "library_full",
  "snippet_name_taken",
  "too_many_snippets",
  "invalid_snippet",
  "approval_required",
  "not_awaiting_approval",
  "not_scheduled",
  "repeat_not_supported",
  "invalid_repeat",
  "too_many_repeats",
  "invalid_feed",
  "platform_not_supported",
  "feed_unreadable",
  "too_many_feeds",
  "checked_recently",
  "invalid_slug",
  "slug_taken",
  "slug_changed_too_often",
  "invalid_contact",
  "invalid_assignee",
  "invalid_broadcast",
  "already_started",
  "still_sending",
  "audience_changed",
  "another_sending",
  "no_recipients",
  "too_many_recipients",
  "too_many_broadcasts",
  "not_sending",
  "not_paused",
  "invalid_sender",
  "invalid_newsletter",
  "sender_required",
  "test_required",
  "too_many_newsletters",
  "invalid_key",
  "plan_limit",
  "plan_limit_accounts",
  "plan_limit_members",
  "plan_limit_automation",
  "plan_limit_plan",
  "plan_limit_inboxes",
  "already_subscribed",
  "no_customer",
  "billing_unavailable",
  "stripe_failed",
  "invalid_plan",
  "unsupported_account",
  "meta_one_private_reply",
  "meta_reply_window",
  "has_paid_plan",
  "invalid_pack",
] as const;
export type Failure = (typeof codes)[number] | "rate_limited" | "signed_out" | "timeout" | "error";
export type Passkey = { id: string; name: string; created_at: string; last_used_at: string | null };
export type AddResult = Passkey | Failure | "cancelled" | "unsupported";

// Sign-in failures are 401 with a code; any other 401 means the session is gone.
// A known code wins (a 429 can be publish_quota); any other 429 is a rate limit.
export async function failure(res: Response): Promise<Failure> {
  const body = await res.json().catch(() => null);
  const code: unknown = body?.error;
  // A plan limit answers 402 {error: "plan_limit", limit}: one code per limit, so the message can name it.
  const known = codes.find((c) => c === (code === "plan_limit" ? `plan_limit_${body.limit}` : code));
  if (known) return known;
  if (code === "plan_limit") return "plan_limit";
  if (res.status === 429) return "rate_limited";
  return res.status === 401 ? "signed_out" : "error";
}

const caught = (e: unknown): Failure =>
  e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";

const send = (method: string, body: unknown, ms = TIMEOUT_MS) =>
  opts({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });

export async function listPasskeys(): Promise<Passkey[] | Failure> {
  try {
    const res = await fetch(`${apiUrl}/auth/passkeys`, opts());
    return res.ok ? ((await res.json()) as Passkey[]) : await failure(res);
  } catch (e) {
    return caught(e);
  }
}

export async function removePasskey(id: string): Promise<"ok" | Failure> {
  try {
    const res = await fetch(`${apiUrl}/auth/passkeys/${encodeURIComponent(id)}`, opts({ method: "DELETE" }));
    return res.ok ? "ok" : await failure(res);
  } catch (e) {
    return caught(e);
  }
}

// Start, the device ceremony, then finish. A blank name becomes "Passkey" on the server.
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export async function addPasskey(name: string): Promise<AddResult> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return "unsupported";
  try {
    const start = await fetch(`${apiUrl}/auth/passkeys/register/start`, send("POST", {}));
    if (!start.ok) return await failure(start);
    const { challenge_id, options } = (await start.json()) as { challenge_id: string; options: CreationOptionsJSON };
    let credential;
    try {
      credential = await createCredential(options);
    } catch (e) {
      // NotAllowedError: cancelled or timed out. InvalidStateError: this device already holds one.
      if (e instanceof DOMException && e.name === "NotAllowedError") return "cancelled";
      if (e instanceof DOMException && e.name === "InvalidStateError") return "passkey_exists";
      return "error";
    }
    const finish = await fetch(`${apiUrl}/auth/passkeys/register/finish`, send("POST", { challenge_id, credential, name }));
    return finish.ok ? ((await finish.json()) as Passkey) : await failure(finish);
  } catch (e) {
    return caught(e);
  }
}

// Discoverable credential: the device picks the account, so no email is asked for.
export async function signInWithPasskey(): Promise<"ok" | Failure | "cancelled"> {
  try {
    const start = await fetch(`${apiUrl}/auth/passkeys/login/start`, opts({ method: "POST" }));
    if (!start.ok) return await failure(start);
    const { challenge_id, options } = (await start.json()) as { challenge_id: string; options: RequestOptionsJSON };
    let credential;
    try {
      credential = await getCredential(options);
    } catch (e) {
      // NotAllowedError: cancelled, timed out or no passkey on this device.
      return e instanceof DOMException && e.name === "NotAllowedError" ? "cancelled" : "error";
    }
    const finish = await fetch(`${apiUrl}/auth/passkeys/login/finish`, send("POST", { challenge_id, credential }));
    return finish.ok ? "ok" : await failure(finish);
  } catch (e) {
    return caught(e);
  }
}

// One call to brain, for callers that read the raw response (e.g. an error body with extra fields).
export async function request(path: string, method = "GET", body?: unknown, ms = TIMEOUT_MS): Promise<Response | Failure> {
  try {
    const init = body === undefined ? opts({ method, signal: AbortSignal.timeout(ms) }) : send(method, body, ms);
    return await fetch(`${apiUrl}${path}`, init);
  } catch (e) {
    return caught(e);
  }
}

// One JSON call to brain: the parsed body on success ("ok" for 204), else the mapped failure.
// `ms` raises the timeout for calls brain answers only after its own outbound requests.
export async function api<T = "ok">(path: string, method = "GET", body?: unknown, ms = TIMEOUT_MS): Promise<T | Failure> {
  try {
    const init = body === undefined ? opts({ method, signal: AbortSignal.timeout(ms) }) : send(method, body, ms);
    const res = await fetch(`${apiUrl}${path}`, init);
    if (!res.ok) return await failure(res);
    return (res.status === 204 ? "ok" : await res.json()) as T;
  } catch (e) {
    return caught(e);
  }
}

export type Providers = { google: boolean; turnstileSiteKey: string | null };

// Sign-in methods this brain offers besides email links and passkeys; self-hosters may skip Google.
// turnstileSiteKey is null when brain has Turnstile off, so forms submit without a token.
// A network failure is retried once after `retryMs`; any answer from brain, even an error, is final.
export async function getProviders(retryMs = 2000): Promise<Providers> {
  let res = await request("/auth/providers");
  if (typeof res === "string") {
    await new Promise((done) => setTimeout(done, retryMs));
    res = await request("/auth/providers");
  }
  if (typeof res === "string" || !res.ok) return { google: false, turnstileSiteKey: null };
  const body = await res.json().catch(() => null);
  const key: unknown = body?.turnstile_site_key;
  return { google: body?.google === true, turnstileSiteKey: typeof key === "string" && key ? key : null };
}

// A path on this site to return to after sign-in, else the current team's home. Mirrors brain's oauth::safe_next, and
// also refuses "//" anywhere, so "/a//evil.com" can't turn into another host.
export function safeNext(raw: string | null | undefined): string {
  const ok =
    !!raw &&
    raw.startsWith("/") &&
    !raw.includes("//") &&
    !raw.includes("\\") &&
    raw.length <= 512 &&
    !/[\s\p{Cc}]/u.test(raw);
  return ok ? raw : teamPath(MY_TEAM, "/home");
}

// A full-page navigation, not a fetch: brain sends the browser to Google and back to `next`.
// `loginOnly` never creates an account: brain sends a new Google account to /signup instead.
export const googleStartUrl = (next?: string | null, loginOnly = false) =>
  `${apiUrl}/auth/google/start?next=${encodeURIComponent(safeNext(next))}${loginOnly ? "&mode=login" : ""}`;

// brain trims the name and takes 1 to 80 characters (code points), no control characters, else 422 invalid_name.
export const MAX_NAME = 80;
export const cleanName = (name: string) => {
  const n = name.trim();
  return n && [...n].length <= MAX_NAME && !/\p{Cc}/u.test(n) ? n : null;
};
export const updateName = (name: string) => api<User>("/auth/me", "PATCH", { name });
