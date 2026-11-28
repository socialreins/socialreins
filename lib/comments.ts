import { INBOX_PLATFORMS, type InboxInput, type Narrowing } from "@/lib/inbox";
import type { Connection } from "@/lib/connections";
import type { SocialSet } from "@/lib/sets";

// The Comments page keeps every filter in its address, so a link or a saved view is the same thing: a map of short strings.
// `set`, `network` and `account` hold comma lists; `answer` is "unanswered" or "answered"; `from` and `to` are days (YYYY-MM-DD,
// the browser's time zone); `hidden` is "1"; `show` is "activity" (follows, likes, reposts); `by` is "post" (one card per post).
export const FILTER_KEYS = ["set", "network", "account", "answer", "assigned", "q", "post", "from", "to", "hidden", "show", "by"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>>;

// The networks whose comments can reach Comments. LinkedIn only with its approval (its accounts say so); the rest read on their own.
export const COMMENT_NETWORKS = [...INBOX_PLATFORMS, "linkedin"];
export const commentCapable = <A extends { provider: string }>(accounts: A[]) => accounts.filter((a) => COMMENT_NETWORKS.includes(a.provider));

const list = (v: string | undefined) => (v ? v.split(",").filter(Boolean) : []);
export const listOf = list;

// The filters an address holds: only the known keys, trimmed, empty ones left out.
export function readFilters(p: URLSearchParams): Filters {
  const out: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = (p.get(k) ?? "").trim();
    if (v) out[k] = k === "q" ? v.slice(0, 100) : v;
  }
  return out;
}

// A view's key order is fixed, so two equal filters compare equal as text.
export const sameFilters = (a: Filters, b: Record<string, string>) => FILTER_KEYS.every((k) => (a[k] ?? "") === (b[k] ?? ""));
export const hasFilters = (f: Filters) => Object.keys(f).length > 0;
// `by=post` only changes how the list is laid out, not what it holds.
export const narrows = (f: Filters) => FILTER_KEYS.some((k) => k !== "by" && f[k]);

// The address: the filters, then what is not a filter (the open item and the Done tab).
export function commentsHref(f: Filters, extra: { item?: string | null; state?: "open" | "done"; view?: "none" } = {}) {
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) q.set(k, f[k]!);
  if (extra.state === "done") q.set("state", "done");
  if (extra.item) q.set("item", extra.item);
  if (extra.view) q.set("view", extra.view);
  return q.size ? `/comments?${q}` : "/comments";
}

// Where a pick of sets, networks and accounts leaves the accounts: all three must hold. `null` means no pick was made.
export function pickedAccounts(f: Filters, accounts: Connection[]): Connection[] | null {
  const sets = list(f.set);
  const networks = list(f.network);
  const named = list(f.account);
  if (!sets.length && !networks.length && !named.length) return null;
  return commentCapable(accounts).filter(
    (a) => (!sets.length || a.set_ids.some((s) => sets.includes(s))) && (!networks.length || networks.includes(a.provider)) && (!named.length || named.includes(a.id)),
  );
}

// An account id no account has: a pick that matches no account lists nothing instead of everything.
const NOBODY = "00000000-0000-0000-0000-000000000000";
const MAX_ACCOUNTS = 100;
const startOfDay = (day: string) => new Date(`${day}T00:00:00`);
const validDay = (day?: string) => Boolean(day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(startOfDay(day).getTime()));
// `to` is the end of its day: brain takes the first moment after it.
const afterDay = (day: string) => new Date(startOfDay(day).getTime() + 86_400_000);

// What listItems and countItems take for these filters: the kind and the narrowing.
export function listArguments(f: Filters, accounts: Connection[]): { kind: "comments" | "activity"; search: string; more: Narrowing } {
  const pick = pickedAccounts(f, accounts);
  const more: Narrowing = {};
  if (pick) more.accountIds = pick.length ? pick.slice(0, MAX_ACCOUNTS).map((a) => a.id) : [NOBODY];
  if (f.answer === "unanswered") more.unanswered = true;
  if (f.answer === "answered") more.unanswered = false;
  if (f.assigned) more.assigned = f.assigned;
  if (f.post) more.post = f.post;
  if (validDay(f.from)) more.from = startOfDay(f.from!).toISOString();
  if (validDay(f.to)) more.to = afterDay(f.to!).toISOString();
  if (f.hidden === "1") more.hidden = true;
  return { kind: f.show === "activity" ? "activity" : "comments", search: f.q ?? "", more };
}

// "Save as inbox": a custom inbox of the same accounts, holding comments and mentions, narrowed by the keyword and answer
// state (the filters a custom inbox has). The rest of the filters are not part of an inbox.
export function inboxFromFilters(name: string, f: Filters, accounts: Connection[]): InboxInput {
  const ids = (pickedAccounts(f, accounts) ?? commentCapable(accounts)).map((a) => a.id).slice(0, MAX_ACCOUNTS);
  return { name, account_ids: ids, filters: { kinds: ["comment", "mention"], keywords: f.q ? [f.q] : [], unanswered: f.answer === "unanswered" } };
}

// What the filters leave of a custom inbox when it cannot hold them all: the parts that were not carried over.
export function notInInbox(f: Filters): string[] {
  const out: string[] = [];
  if (f.post) out.push("one post");
  if (f.from || f.to) out.push("the dates");
  if (f.hidden) out.push("hidden or held");
  if (f.assigned) out.push("who it is assigned to");
  if (f.answer === "answered") out.push("answered only");
  if (f.show === "activity") out.push("activity");
  return out;
}

// "Automate comments like this": the builder, filled with the accounts the filters reach and the keyword. A set alone goes as the
// set; any other pick goes as the accounts it names.
export function automationHref(f: Filters, accounts: Connection[]) {
  const q = new URLSearchParams({ template: "comment-to-dm" });
  const pick = pickedAccounts(f, accounts);
  const sets = list(f.set);
  if (sets.length === 1 && !list(f.network).length && !list(f.account).length) q.set("set", sets[0]!);
  else if (pick?.length) q.set("accounts", pick.slice(0, MAX_ACCOUNTS).map((a) => a.id).join(","));
  if (f.q) q.set("keywords", f.q);
  return `/automations/new?${q}`;
}

// The names the page shows for a filter that points at a set or account, or the plain word when it is gone.
export const setLabel = (id: string, sets: SocialSet[]) => sets.find((s) => s.id === id)?.name ?? "A deleted set";
