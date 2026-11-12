import { api } from "@/lib/auth";

// Every call here is for site admins only: brain answers 403 forbidden to everyone else.

export type Signup = {
  id: string;
  email: string;
  source: string | null;
  created_at: string;
  verified_at: string | null;
  // Set when an admin approved the email: it may sign up whatever the sign-up rules say.
  approved_at: string | null;
};
export type Waitlist = { total: number; verified: number; signups: Signup[] };
// null lists everyone; true or false only confirmed or unconfirmed signups.
export type Verified = boolean | null;

// The `?verified=` value of the admin page, as brain takes it; anything else means all.
export const parseVerified = (v: string | null): Verified => (v === "true" ? true : v === "false" ? false : null);

// The waitlist's own query, for brain and for the page's links alike: `?verified=&q=`, empty parts left out.
export function waitlistQuery(verified: Verified, q = "") {
  const p = new URLSearchParams();
  if (verified !== null) p.set("verified", String(verified));
  if (q.trim()) p.set("q", q.trim());
  return p.size ? `?${p}` : "";
}

// Newest first, at most 1000; the totals ignore the filter and the search.
export const listWaitlist = (verified: Verified, q = "") => api<Waitlist>(`/v1/admin/waitlist${waitlistQuery(verified, q)}`);

// `mail` says what happened to the "you can sign up now" email; the approval holds either way.
export type Approval = { signup: Signup; mail: "sent" | "failed" | "already_approved" };
export const approveSignup = (id: string) => api<Approval>(`/v1/admin/waitlist/${encodeURIComponent(id)}/approve`, "POST");
// Removing an approved entry takes its approval away.
export const removeSignup = (id: string) => api(`/v1/admin/waitlist/${encodeURIComponent(id)}`, "DELETE");

export function approvalText({ signup, mail }: Approval) {
  if (mail === "sent") return `Approved ${signup.email}. An email telling them they can sign up was sent.`;
  if (mail === "already_approved") return `${signup.email} was already approved. No new email was sent.`;
  return `Approved ${signup.email}, so they can sign up, but the email could not be sent. They were not told: let them know another way.`;
}

export type Overview = {
  users: number;
  new_users_7d: number;
  teams: number;
  // A provider with no accounts is absent from `by_provider`.
  accounts: { total: number; by_provider: Record<string, number> };
  // scheduled, published and failed are always there; other statuses only when a post has them.
  posts: Record<string, number>;
  waitlist: { total: number; verified: number; approved: number };
};
export const getOverview = () => api<Overview>("/v1/admin/overview");

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
  // null: never signed in, or signed out since.
  last_sign_in_at: string | null;
  teams: { id: string; name: string; role: string }[];
};
export type AdminUsers = { total: number; users: AdminUser[] };
export type AdminTeam = { id: string; name: string; created_at: string; members: number; accounts: number; posts: number; owner_email: string | null };
export type AdminTeams = { total: number; teams: AdminTeam[] };

// One page of an admin list: the search text and where the page starts.
export type Page = { q: string; limit: number; offset: number };
export const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// A whole number JavaScript holds exactly, which also fits brain's integers; anything else is null.
const whole = (v: string | null) => (v !== null && /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null);

// `?q=&limit=&offset=` of a list page, kept within what brain accepts so a hand-edited URL never gets a 422:
// a `limit` or `offset` that is not a safe whole number, or a `limit` outside 1 to 200, falls back to its default.
export function parsePage(params: { get(name: string): string | null }): Page {
  const limit = whole(params.get("limit"));
  return {
    q: (params.get("q") ?? "").trim().slice(0, 200),
    limit: limit !== null && limit >= 1 && limit <= MAX_LIMIT ? limit : DEFAULT_LIMIT,
    offset: whole(params.get("offset")) ?? 0,
  };
}

// The same page as a query string, for brain and for the page's own links; defaults are left out.
export function pageQuery({ q, limit, offset }: Page) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (limit !== DEFAULT_LIMIT) p.set("limit", String(limit));
  if (offset > 0) p.set("offset", String(offset));
  return p.size ? `?${p}` : "";
}

// The pages before and after; null when there is none. Given the total, a page past the end steps back to the last page with rows.
export const previousPage = (p: Page, total = Infinity): Page | null =>
  p.offset > 0 ? { ...p, offset: Math.max(0, Math.min(p.offset - p.limit, Math.floor((total - 1) / p.limit) * p.limit)) } : null;
export const nextPage = (p: Page, total: number): Page | null => (p.offset + p.limit < total ? { ...p, offset: p.offset + p.limit } : null);

// "Showing 51 to 100 of 240", from the rows that came back.
export function showing(offset: number, rows: number, total: number) {
  if (rows === 0) return total === 0 ? "Showing 0 of 0" : `Showing 0 of ${total.toLocaleString()}`;
  return `Showing ${(offset + 1).toLocaleString()} to ${(offset + rows).toLocaleString()} of ${total.toLocaleString()}`;
}

// Newest first; `total` counts every match, not only this page.
export const listUsers = (p: Page) => api<AdminUsers>(`/v1/admin/users${pageQuery(p)}`);
export const listTeams = (p: Page) => api<AdminTeams>(`/v1/admin/teams${pageQuery(p)}`);

export type SignupMode = "open" | "closed" | "domains";
// `source`: "env" while the rules still come from the server's environment, "saved" once saved here.
export type SignupSettings = { mode: SignupMode; domains: string[]; source: "env" | "saved" };
export const getSignupSettings = () => api<SignupSettings>("/v1/admin/settings/signup");
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export const saveSignupSettings = (mode: SignupMode, domains: string[]) =>
  api<SignupSettings>("/v1/admin/settings/signup", "PUT", { mode, domains });

// The domains box as a list: one entry per line or comma, trimmed, lowercased, without repeats. brain checks each entry.
export const parseDomains = (text: string) => [...new Set(text.split(/[\s,]+/).map((d) => d.toLowerCase()).filter(Boolean))];
