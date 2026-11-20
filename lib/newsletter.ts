import { api, failure, request, type Failure, type Team } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { apiUrl } from "@/lib/waitlist";

const TIMEOUT_MS = 10_000;
const enc = encodeURIComponent;

export type SubscribeResult = "ok" | "invalid" | "gone" | "rate_limited" | "timeout" | "error";
export type NewsletterVerifyResult = { team: string } | "invalid" | "rate_limited" | "timeout" | "error";

const failed = (e: unknown) => (e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error");

// The same answer for a new email and a known one; brain mails a link to confirm. 404 means the page or its
// newsletter was switched off since the page loaded.
export async function subscribe(code: string, email: string): Promise<SubscribeResult> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/pages/${enc(code)}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "ok";
    if (res.status === 422) return "invalid";
    if (res.status === 404) return "gone";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return failed(e);
  }
}

// Confirms an email with the token from brain's link. Only a click calls this, never a page load, because mail
// scanners open links.
export async function verifyNewsletter(token: string): Promise<NewsletterVerifyResult> {
  if (!token) return "invalid";
  try {
    const res = await fetch(`${apiUrl}/v1/public/newsletter/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const team: unknown = (await res.json().catch(() => null))?.team;
      return { team: typeof team === "string" ? team : "" };
    }
    if (res.status === 422) return "invalid";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return failed(e);
  }
}

export type Subscriber = { id: string; email: string; confirmed: boolean; subscribed_at: string; unsubscribed_at?: string | null };
// Who a newsletter goes to: confirmed and not unsubscribed.
export const reachable = (s: Subscriber) => s.confirmed && !s.unsubscribed_at;

// The confirmed emails as a CSV for a mailing tool. Unconfirmed and unsubscribed ones never leave: nobody agreed to mail them.
export function subscribersCsv(list: Subscriber[]): string {
  const cell = (v: string) => csvCell(v, true);
  const rows = list.filter(reachable).map((s) => `${cell(s.email)},${cell(s.subscribed_at)}`);
  return ["email,subscribed_at", ...rows].join("\r\n") + "\r\n";
}

// Takes an email off a team's newsletter with the token from the email's link. Only a click calls this, never a
// page load. brain answers 200 for any token, so the page says the same for all of them.
export async function unsubscribe(token: string): Promise<"ok" | "rate_limited" | "timeout" | "error"> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/newsletter/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? "ok" : res.status === 429 ? "rate_limited" : "error";
  } catch (e) {
    return failed(e);
  }
}

// Sending: one email to every confirmed subscriber. Owners and admins only, session only.
export type Sender = { name: string; address: string };
export type NewsletterStatus = "draft" | "sending" | "paused" | "sent" | "cancelled";
export type NewsletterCounts = { total: number; sent: number; failed: number; pending: number };
export type Newsletter = {
  id: string;
  subject: string;
  body: string;
  status: NewsletterStatus;
  // Only while paused: why sending stopped.
  pause_reason: string | null;
  // When the current text was last sent to its writer as a test. An edit clears it.
  tested_at: string | null;
  counts: NewsletterCounts;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
export type NewsletterInput = Pick<Newsletter, "subject" | "body">;

// A refusal with what brain adds to it: `field` (invalid_newsletter, invalid_sender), `total` (audience_changed).
export type Problem = { code: Failure; field?: string; total?: number };
export const isProblem = (r: unknown): r is Problem => typeof r === "object" && r !== null && "code" in r;

async function call<T>(path: string, method: string, body: unknown): Promise<T | Problem> {
  const res = await request(path, method, body);
  if (typeof res === "string") return { code: res };
  if (res.ok) return (await res.json()) as T;
  const code = await failure(res.clone());
  const extra = await res.json().catch(() => null);
  return { code, field: typeof extra?.field === "string" ? extra.field : undefined, total: typeof extra?.total === "number" ? extra.total : undefined };
}

const one = (id: string) => `/v1/newsletters/${enc(id)}`;
export const setSender = (sender: Sender) => call<Team>("/v1/team", "PATCH", { newsletter_sender: sender });
export const listNewsletters = () => api<Newsletter[]>("/v1/newsletters");
export const getNewsletter = (id: string) => api<Newsletter>(one(id));
export const createNewsletter = (n: NewsletterInput) => call<Newsletter>("/v1/newsletters", "POST", n);
// Drafts only. An edit clears `tested_at`.
export const updateNewsletter = (id: string, n: NewsletterInput) => call<Newsletter>(one(id), "PUT", n);
export const deleteNewsletter = (id: string) => api(one(id), "DELETE");
// Sends the draft to the caller's own email and sets `tested_at`. 429 over 10 a day.
export const testNewsletter = (id: string) => api<unknown>(`${one(id)}/test`, "POST");
// Starts a draft only when `confirmTotal` is still the number of confirmed subscribers: else 409 audience_changed
// with the new `total`.
export const sendNewsletter = (id: string, confirmTotal: number) => call<Newsletter>(`${one(id)}/send`, "POST", { confirm_total: confirmTotal });
export const cancelNewsletter = (id: string) => api<Newsletter>(`${one(id)}/cancel`, "POST");
export const resumeNewsletter = (id: string) => api<Newsletter>(`${one(id)}/resume`, "POST");

export const MAX_SENDER_NAME = 80;
export const MIN_ADDRESS = 10;
export const MAX_ADDRESS = 300;
export const MAX_SUBJECT = 150;
export const MAX_BODY = 20_000;
export const MAX_LINKS = 20;
export const MAX_RECIPIENTS = 5000;

// A piece of a paragraph: plain text, bold text or a link. Text is never HTML: React escapes it when it draws it.
export type Piece = { text: string; bold?: true; href?: string };
// A bare https link ends at white space, a quote or an angle bracket.
const LINK = /\bhttps:\/\/[^\s<>"'`]+/g;
// A full stop or bracket right after a link belongs to the sentence, not the link.
const TAIL = /[.,;:!?)\]]+$/;

function linked(text: string, bold: boolean): Piece[] {
  const out: Piece[] = [];
  const add = (t: string, href?: string) => t && out.push({ text: t, ...(bold ? { bold: true as const } : {}), ...(href ? { href } : {}) });
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    const href = m[0].replace(TAIL, "");
    // "https://" alone links nowhere.
    if (href.length <= "https://".length) continue;
    add(text.slice(at, m.index));
    add(href, href);
    at = m.index + href.length;
  }
  add(text.slice(at));
  return out;
}

// The email body as brain renders it: a blank line starts a paragraph, **bold** is bold, a bare https link is a
// link. Nothing else is markup: HTML, http and javascript: links all stay plain text.
export function renderBody(body: string): Piece[][] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*(?:\n[ \t]*)+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/\*\*([^\n]+?)\*\*/).flatMap((part, i) => linked(part, i % 2 === 1)));
}

// Counted by code points, like brain.
export const length = (text: string) => [...text.trim()].length;
export const linkCount = (body: string) => renderBody(body).flat().filter((p) => p.href).length;
// Which field is wrong, as brain's `invalid_newsletter` would name it, or null.
export const draftProblem = (subject: string, body: string): "subject" | "body" | "links" | null =>
  length(subject) < 1 || length(subject) > MAX_SUBJECT || /[\r\n]/.test(subject.trim()) ? "subject" : length(body) < 1 || length(body) > MAX_BODY ? "body" : linkCount(body) > MAX_LINKS ? "links" : null;

// The foot of every newsletter email: who sent it, their postal address, why the reader gets it, and Unsubscribe.
// brain's footer line, word for word: the team name keeps only letters, digits, spaces, _ ' and -.
export const footerWhy = (team: string) => `You get this because you signed up on a ${team.replace(/[^\p{L}\p{N} _'-]/gu, " ").trim()} page.`;

export const subscribers = (n: number) => `${n} confirmed ${n === 1 ? "subscriber" : "subscribers"}`;

const invalid: Record<string, string> = {
  subject: `Write a subject of 1 to ${MAX_SUBJECT} characters, on one line.`,
  body: `Write the newsletter, and keep it within ${MAX_BODY.toLocaleString("en-US")} characters.`,
  links: `A newsletter can hold at most ${MAX_LINKS} links. Take some out.`,
  name: `Give the sender a name of 1 to ${MAX_SENDER_NAME} characters.`,
  address: `Write a postal address of ${MIN_ADDRESS} to ${MAX_ADDRESS} characters.`,
};

// What a newsletter's own refusals mean; null for the rest, which the shared messages in team-ui cover.
export function newsletterText(code: Failure, field?: string): string | null {
  switch (code) {
    case "invalid_newsletter":
      return invalid[field ?? ""] ?? "That newsletter isn't valid. Use plain text, no HTML, with at most 20 links.";
    case "invalid_sender":
      return invalid[field ?? ""] ?? "Those sender details aren't valid. Check the name and the address.";
    case "sender_required":
      return "Add your sender name and postal address first. The law requires them in every email.";
    case "test_required":
      return "Send yourself a test of this exact text first. A changed draft needs a new test.";
    case "no_recipients":
      return "Nobody has a confirmed subscription right now, so nothing was sent.";
    case "audience_changed":
      return "The number of confirmed subscribers changed while you were looking. Check the new number, then send again.";
    case "too_many_newsletters":
      return "This team already sent a newsletter in the last 24 hours, and one a day is the most allowed. Try again tomorrow.";
    case "too_many_recipients":
      return `A newsletter goes to at most ${MAX_RECIPIENTS.toLocaleString("en-US")} people, and this team has more confirmed subscribers than that.`;
    case "already_started":
      return "This newsletter was already started, so it can't be changed or sent again. Reload to see it.";
    case "still_sending":
      return "This newsletter is still going out. Cancel it first, then delete it.";
    case "not_sending":
      return "This newsletter is no longer going out, so there is nothing to cancel. Reload to see it.";
    case "not_paused":
      return "This newsletter is not paused. Reload to see it.";
    case "forbidden":
      return "Only team owners and admins can write and send newsletters.";
    case "not_found":
      return "That newsletter no longer exists.";
    default:
      return null;
  }
}
