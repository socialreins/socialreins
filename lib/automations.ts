import { api } from "@/lib/auth";
import type { Connection } from "@/lib/connections";
import { graphemes } from "@/lib/posts";

export type Trigger = "comment_received" | "dm_received" | "mention_received" | "new_follower" | "story_reply";
export type ScopeBody = { social_set_id?: string | null; account_ids: string[] };
// brain stores only what the trigger takes, so everything but the scope may be missing.
export type Conditions = ScopeBody & {
  // Bluesky at:// URIs of the posts commented on.
  post_remote_ids?: string[];
  keywords?: string[];
  first_per_author?: boolean;
  first_message?: boolean;
};
export type Action = { type: "send_dm" | "reply_publicly"; text: string };
export type RunStats = { sent: number; skipped: number; failed: number; running: number; total: number; count: number; last_at: string | null };
export type Automation = {
  id: string;
  name: string;
  active: boolean;
  activated_at: string;
  trigger: Trigger;
  conditions: Conditions;
  actions: Action[];
  fallback_public_reply: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // In the list and on one automation, not in the answer to a save or a switch.
  runs?: RunStats;
  // A flow made over the API: steps in place of actions. Not built here yet.
  steps?: unknown[];
};
export type AutomationInput = Pick<Automation, "name" | "trigger" | "conditions" | "actions" | "active" | "fallback_public_reply">;
export type RunStatus = "running" | "sent" | "failed" | "skipped";
export type ActionResult = {
  type: "send_dm" | "reply_publicly" | "fallback_public_reply";
  status: Exclude<RunStatus, "running">;
  reason: string | null;
  remote_id: string | null;
};
export type Run = {
  id: string;
  automation_id: string;
  inbox_item_id: string;
  status: RunStatus;
  reason: string | null;
  results: ActionResult[];
  created_at: string;
  updated_at: string;
};
export type RunPage = { runs: Run[]; next_cursor: string | null };

const enc = encodeURIComponent;

export const listAutomations = () => api<Automation[]>("/v1/automations");
export const getAutomation = (id: string) => api<Automation>(`/v1/automations/${enc(id)}`);
export const createAutomation = (input: AutomationInput) => api<Automation>("/v1/automations", "POST", input);
export const updateAutomation = (id: string, input: AutomationInput) => api<Automation>(`/v1/automations/${enc(id)}`, "PUT", input);
export const deleteAutomation = (id: string) => api(`/v1/automations/${enc(id)}`, "DELETE");
export const switchAutomation = (id: string, on: boolean) =>
  api<Automation>(`/v1/automations/${enc(id)}/${on ? "enable" : "disable"}`, "POST");
export const listRuns = (id: string, cursor?: string | null) =>
  api<RunPage>(`/v1/automations/${enc(id)}/runs${cursor ? `?cursor=${enc(cursor)}` : ""}`);

// brain checks texts with every {name} at its longest, 64 characters, and every {page} (the address of
// the post's public page) as 100.
const LONGEST_NAME = "n".repeat(64);
const LONGEST_PAGE = "p".repeat(100);
export const templateLength = (text: string) => graphemes(text.replaceAll("{name}", LONGEST_NAME).replaceAll("{page}", LONGEST_PAGE));
// What a commenter called Sam would get, for the preview.
export const sample = (text: string, name = "Sam") => text.replaceAll("{name}", name).replaceAll("{page}", "(link to the public page)");

const plain = /^[A-Za-z0-9.\-_~:]+$/;

// A Bluesky post link or at:// URI as the at://{did}/app.bsky.feed.post/{rkey} URI brain matches
// comments against. A handle in a link must be one of the team's accounts (comments land on
// their posts), so no lookup leaves the browser. null when it isn't one.
export function postUri(input: string, accounts: Pick<Connection, "provider" | "handle" | "external_id">[]): string | null {
  const s = input.trim();
  const at = /^at:\/\/([^/\s]+)\/app\.bsky\.feed\.post\/([^/\s]+)$/.exec(s);
  if (at) return at[1]!.startsWith("did:") && plain.test(at[1]!) && plain.test(at[2]!) ? s : null;
  const link = /^https:\/\/bsky\.app\/profile\/([^/\s?#]+)\/post\/([^/\s?#]+)\/?(?:[?#]\S*)?$/.exec(s);
  if (!link) return null;
  const [, actor, rkey] = link as unknown as [string, string, string];
  if (!plain.test(rkey) || !plain.test(actor)) return null;
  const did = actor.startsWith("did:")
    ? actor
    : accounts.find((a) => a.provider === "bluesky" && a.handle?.toLowerCase() === actor.toLowerCase())?.external_id;
  return did ? `at://${did}/app.bsky.feed.post/${rkey}` : null;
}

// The bsky.app link for an at:// post URI, as brain's bluesky::post_url builds it.
export const postLink = (uri: string) => {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : uri;
};

// What each trigger takes, as brain's `validate` in app/src/automations.rs checks it. `publicReply`
// also covers the fallback reply and {page}: all three need a thread to reply under.
export type Capability = {
  label: string;
  keywords: boolean;
  posts: boolean;
  firstPerAuthor: boolean;
  firstMessage: boolean;
  publicReply: boolean;
  note: string | null;
};
export const triggers: Record<Trigger, Capability> = {
  comment_received: { label: "When someone comments", keywords: true, posts: true, firstPerAuthor: true, firstMessage: false, publicReply: true, note: null },
  dm_received: { label: "When someone sends a DM", keywords: true, posts: false, firstPerAuthor: false, firstMessage: true, publicReply: false, note: null },
  mention_received: { label: "When someone mentions you", keywords: true, posts: false, firstPerAuthor: false, firstMessage: false, publicReply: true, note: null },
  new_follower: {
    label: "When someone follows you",
    keywords: false,
    posts: false,
    firstPerAuthor: false,
    firstMessage: false,
    publicReply: false,
    note: "Bluesky only. Each follower gets the DM once, and only if they take DMs from accounts they don't follow.",
  },
  story_reply: {
    label: "When someone replies to your story",
    keywords: true,
    posts: false,
    firstPerAuthor: false,
    firstMessage: false,
    publicReply: false,
    note: "Instagram only, and still in testing.",
  },
};
export const TRIGGERS = Object.keys(triggers) as Trigger[];

// Whether the builder can show and save this automation without losing anything: a trigger it knows,
// plain actions and no steps. brain may send a newer trigger or shape, whatever the type above says.
export function canEdit(a: Automation) {
  const x = a as { trigger: string; actions?: unknown; steps?: unknown[]; conditions?: unknown };
  return Object.hasOwn(triggers, x.trigger) && !x.steps?.length && Array.isArray(x.actions) && x.actions.length > 0 && typeof x.conditions === "object" && x.conditions !== null;
}

// The ids to save for the post lines in the form. A line that still shows a post the automation was
// loaded with keeps that id exactly (a Facebook or Instagram post id, any at:// URI); only a line the
// user added or changed is read as a Bluesky link. null where a line is neither.
export function postIds(lines: string[], loaded: string[], accounts: Parameters<typeof postUri>[1]) {
  const kept = new Map(loaded.flatMap((id) => [[postLink(id), id], [id, id]]));
  return lines.map((l) => kept.get(l) ?? postUri(l, accounts));
}

// The builder's fields. The scope and the post URIs are resolved by the form.
export type Draft = {
  name: string;
  trigger: Trigger;
  keywords: string[];
  specific: boolean;
  // Post links, one per line.
  posts: string;
  firstPerAuthor: boolean;
  firstMessage: boolean;
  dm: string;
  publicReply: string;
  fallbackOn: boolean;
  fallback: string;
  active: boolean;
};
const empty: Draft = {
  name: "",
  trigger: "comment_received",
  keywords: [],
  specific: false,
  posts: "",
  firstPerAuthor: false,
  firstMessage: false,
  dm: "",
  publicReply: "",
  fallbackOn: false,
  fallback: "",
  active: true,
};

export const templates: { id: string; title: string; about: string; draft: Partial<Draft> }[] = [
  {
    id: "comment-to-dm",
    title: "Comment to DM",
    about: "Send a DM to everyone who comments a keyword on your posts.",
    draft: { name: "Comment to DM", trigger: "comment_received", keywords: ["link"], dm: "Hi {name}, thanks for your comment! Here is the link: " },
  },
  {
    id: "dm-keyword",
    title: "DM keyword reply",
    about: "Answer a DM that holds a keyword, like \"price\" or \"hours\".",
    draft: { name: "DM keyword reply", trigger: "dm_received", keywords: ["price"], dm: "Hi {name}, thanks for asking! Here are our prices: " },
  },
  {
    id: "welcome",
    title: "Welcome message",
    about: "Greet someone the first time they send you a DM.",
    draft: { name: "Welcome message", trigger: "dm_received", firstMessage: true, dm: "Hi {name}, thanks for your message! We will get back to you soon." },
  },
  {
    id: "new-follower",
    title: "New follower DM",
    about: "Thank each new follower with a DM. Bluesky only.",
    draft: { name: "New follower DM", trigger: "new_follower", dm: "Hi {name}, thanks for following!" },
  },
  {
    id: "mention-reply",
    title: "Mention reply",
    about: "Reply under a post that mentions you.",
    draft: { name: "Mention reply", trigger: "mention_received", publicReply: "Thanks for the mention, {name}!" },
  },
  {
    id: "story-reply",
    title: "Story reply",
    about: "Send a DM to people who reply to your story. Instagram only.",
    draft: { name: "Story reply", trigger: "story_reply", dm: "Thanks for replying to our story, {name}!" },
  },
];

// The builder's start: a saved automation, a template, or nothing.
export function draftOf(a?: Automation, templateId?: string | null): Draft {
  if (!a) return { ...empty, ...templates.find((t) => t.id === templateId)?.draft };
  const c = a.conditions;
  const text = (type: Action["type"]) => a.actions.find((x) => x.type === type)?.text ?? "";
  return {
    name: a.name,
    trigger: a.trigger,
    keywords: c.keywords ?? [],
    specific: Boolean(c.post_remote_ids?.length),
    posts: (c.post_remote_ids ?? []).map(postLink).join("\n"),
    firstPerAuthor: c.first_per_author ?? false,
    firstMessage: c.first_message ?? false,
    dm: text("send_dm"),
    publicReply: text("reply_publicly"),
    fallbackOn: Boolean(a.fallback_public_reply),
    fallback: a.fallback_public_reply ?? "",
    active: a.active,
  };
}

// The draft under another trigger: what the new trigger takes stays, the rest goes and is named.
export function changeTrigger(d: Draft, to: Trigger): { draft: Draft; dropped: string[] } {
  const t = triggers[to];
  const draft = { ...d, trigger: to };
  const dropped: string[] = [];
  const drop = (gone: boolean, name: string, reset: Partial<Draft>) => {
    if (!gone) return;
    Object.assign(draft, reset);
    dropped.push(name);
  };
  drop(!t.keywords && d.keywords.length > 0, "keywords", { keywords: [] });
  drop(!t.posts && d.specific, "specific posts", { specific: false, posts: "" });
  drop(!t.firstPerAuthor && d.firstPerAuthor, "first comment per person", { firstPerAuthor: false });
  drop(!t.firstMessage && d.firstMessage, "first message only", { firstMessage: false });
  drop(!t.publicReply && Boolean(d.publicReply.trim()), "public reply", { publicReply: "" });
  drop(!t.publicReply && (d.fallbackOn || Boolean(d.fallback.trim())), "fallback reply", { fallbackOn: false, fallback: "" });
  drop(!t.publicReply && d.dm.includes("{page}"), "{page} in the DM", { dm: d.dm.replaceAll("{page}", "").replace(/ {2,}/g, " ").trim() });
  return { draft, dropped };
}

// What brain gets: only the conditions and actions the trigger takes, whatever the draft still holds.
export function automationInput(d: Draft, scope: ScopeBody, uris: string[]): AutomationInput {
  const t = triggers[d.trigger];
  const dm = d.dm.trim() ? d.dm : "";
  const reply = t.publicReply ? d.publicReply.trim() : "";
  // brain takes a fallback only next to a DM.
  const fallback = t.publicReply && dm && d.fallbackOn ? d.fallback.trim() : "";
  return {
    name: d.name,
    trigger: d.trigger,
    conditions: {
      ...scope,
      ...(t.keywords && { keywords: d.keywords }),
      ...(t.posts && { post_remote_ids: d.specific ? uris : [] }),
      ...(t.firstPerAuthor && { first_per_author: d.firstPerAuthor }),
      ...(t.firstMessage && { first_message: d.firstMessage }),
    },
    actions: [...(dm ? [{ type: "send_dm" as const, text: dm }] : []), ...(reply ? [{ type: "reply_publicly" as const, text: reply }] : [])],
    active: d.active,
    fallback_public_reply: fallback || null,
  };
}

export const reasonText: Record<string, string> = {
  outside_window: "Too late: Meta only takes this message within 24 hours of theirs, or 7 days for a comment",
  already_replied: "This comment already got its one private reply",
  dm_unavailable: "They can't be messaged",
  meta_reconnect_required: "Meta refused the sign-in. Reconnect the account",
  meta_failed: "Meta refused it",
  dm_not_allowed: "They only accept DMs from people they follow",
  no_public_page: "The post has no open public page for {page}",
  no_dm_access: "Reconnect with an app password that allows DMs",
  daily_cap: "The team reached 500 automation runs today",
  rate_limited: "Bluesky is rate limiting this account",
  reconnect_required: "Bluesky refused the app password. Reconnect the account",
  interrupted: "Cut off by a restart, not retried",
  bluesky_refused: "Bluesky refused it",
  bluesky_unreachable: "Bluesky couldn't be reached",
  not_repliable: "This comment can't be replied to",
  too_long: "The text was too long",
  internal: "Something went wrong on our side",
};
export const reason = (code: string | null) => (code ? (reasonText[code] ?? code.replaceAll("_", " ")) : null);

export const actionName: Record<ActionResult["type"], string> = {
  send_dm: "DM",
  reply_publicly: "Public reply",
  fallback_public_reply: "Fallback reply",
};

// "On 2 posts", "First comment per person", "First message only".
export function conditionNotes(c: Conditions) {
  const n = c.post_remote_ids?.length ?? 0;
  return [n ? `On ${n === 1 ? "1 post" : `${n} posts`}` : null, c.first_per_author ? "First comment per person" : null, c.first_message ? "First message only" : null].filter(
    (x): x is string => x !== null,
  );
}

export function actionsSummary(a: Pick<Automation, "actions" | "fallback_public_reply">) {
  const has = (type: Action["type"]) => a.actions.some((x) => x.type === type);
  if (!has("send_dm")) return "Replies publicly";
  if (has("reply_publicly")) return "Sends a DM and replies publicly";
  return a.fallback_public_reply ? "Sends a DM, or replies publicly if it can't" : "Sends a DM";
}
