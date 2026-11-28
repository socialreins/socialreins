import { api } from "@/lib/auth";
import { cleanTag } from "@/lib/contacts";
import type { Connection } from "@/lib/connections";
import { graphemes, threadsLength } from "@/lib/posts";

export type Trigger = "comment_received" | "dm_received" | "mention_received" | "new_follower" | "story_reply" | "story_mention" | "button_clicked" | "like_received" | "repost_received";
export type ScopeBody = { social_set_id?: string | null; account_ids: string[] };
// brain stores only what the trigger takes, so everything but the scope may be missing.
export type Conditions = ScopeBody & {
  // Bluesky at:// URIs of the posts commented on.
  post_remote_ids?: string[];
  keywords?: string[];
  first_per_author?: boolean;
  first_message?: boolean;
  // button_clicked only: the payloads of the buttons whose click runs it.
  payloads?: string[];
  // Weekdays and hours it may act in, and the text conditions (all but follows and button taps).
  when?: When | null;
  question?: boolean;
  languages?: string[];
  // Only text with a link (true) or without one (false): the spam rule. Not for a follow or a tap.
  has_link?: boolean;
  // Only text an AI model reads as one of these moods. Counts as an AI reply, read last.
  sentiment?: Sentiment[];
};
// When it may act: weekdays (0 is Monday) and hours of the day in an IANA zone; from_hour after to_hour is overnight.
export type When = { zone: string; weekdays?: number[]; from_hour?: number | null; to_hour?: number | null };
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// The languages brain can tell apart, by the ISO 639-1 codes it takes. Vietnamese is written in its own language: "Vietnamese" holds the word "name", which breaks a test that looks a field up by its label.
export const LANGUAGES: [string, string][] = [
  ["ar", "Arabic"], ["bn", "Bangla"], ["zh", "Chinese"], ["nl", "Dutch"], ["en", "English"], ["fa", "Persian"], ["fr", "French"], ["de", "German"],
  ["he", "Hebrew"], ["hi", "Hindi"], ["id", "Indonesian"], ["it", "Italian"], ["ja", "Japanese"], ["ko", "Korean"], ["pl", "Polish"], ["pt", "Portuguese"],
  ["ru", "Russian"], ["es", "Spanish"], ["th", "Thai"], ["tr", "Turkish"], ["uk", "Ukrainian"], ["ur", "Urdu"], ["vi", "Tiếng Việt"],
];
export type Sentiment = "positive" | "negative";
export const SENTIMENTS: Sentiment[] = ["positive", "negative"];
// tag_contact sends nothing: it puts a tag on the contact behind the item.
export type TagAction = { type: "tag_contact"; tag: string };
// An AI send: brain writes the text with a model from the prompt and the comment or DM.
export type AiType = "ai_send_dm" | "ai_reply_publicly";
export type AiSend = { type: "ai_send_dm"; prompt: string } | { type: "ai_reply_publicly"; prompt: string };
export const MAX_PROMPT = 2000;
// What an automation does besides sending: mail the owners, hide or like the comment (Facebook and
// Instagram), keep newer automations off the item. `assign` is API only: the builder leaves it alone.
export type EffectType = "notify_team" | "hide_comment" | "like_comment" | "repost_comment" | "follow_back" | "stop_automations";
export type Effect = { type: EffectType };
export const EFFECTS: EffectType[] = ["notify_team", "hide_comment", "like_comment", "repost_comment", "follow_back", "stop_automations"];
// A like or repost of one of our posts (Bluesky): nobody to message and no contact to tag, so only actions that do
// something on the account or in the team.
export const isActivity = (t: Trigger) => t === "like_received" || t === "repost_received";
export type AssignAction = { type: "assign"; user_id: string };
export type Action = { type: "send_dm" | "reply_publicly"; text: string } | AiSend | TagAction | Effect | AssignAction;
export const MAX_TAG_ACTIONS = 3;
export type Button = { label: string; payload: string };
// One step of a flow. brain leaves `buttons` out when a DM has none.
export type Step = { type: "send_dm"; text: string; buttons?: Button[] } | { type: "reply_publicly"; text: string } | AiSend | { type: "wait"; minutes: number } | { type: "wait_for_reply"; minutes: number } | TagAction | Effect | AssignAction;
// Why runs were skipped or failed, with how many each, most first.
export type RunReason = { reason: string; count: number };
export type RunStats = { sent: number; skipped: number; failed: number; running: number; waiting?: number; total: number; count: number; last_at: string | null; reasons?: RunReason[] };
export type Automation = {
  id: string;
  // The number in its address; the UUID `id` still works in brain's API and in old links.
  number: number;
  name: string;
  active: boolean;
  activated_at: string;
  trigger: Trigger;
  conditions: Conditions;
  actions: Action[];
  fallback_public_reply: string | null;
  // Safety: minutes before it answers the same person again, and most runs a day. null: off.
  cooldown_minutes?: number | null;
  daily_cap?: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // In the list and on one automation, not in the answer to a save or a switch.
  runs?: RunStats;
  // A flow: steps in place of actions (`actions` is then []). null or missing on a simple one.
  steps?: Step[] | null;
};
// brain takes actions or steps, never both, and a fallback only with actions.
export type AutomationInput = Pick<Automation, "name" | "trigger" | "conditions" | "active"> & { actions?: Action[]; steps?: Step[]; fallback_public_reply?: string | null; cooldown_minutes?: number | null; daily_cap?: number | null };
export type RunStatus = "running" | "waiting" | "sent" | "failed" | "skipped";
export type ActionResult = {
  type: "send_dm" | "reply_publicly" | AiType | "fallback_public_reply" | "tag_contact" | EffectType | "assign";
  // A tag is `done` or `skipped`; it is never sent.
  status: Exclude<RunStatus, "running"> | "done";
  reason: string | null;
  remote_id: string | null;
  // An AI send: who wrote it.
  provider?: string;
  model?: string;
};
export type Run = {
  id: string;
  automation_id: string;
  inbox_item_id: string;
  inbox_item_number: number | null;
  status: RunStatus;
  reason: string | null;
  results: ActionResult[];
  // A flow's step last tried, from 0, and when a waiting run goes on.
  step_index?: number | null;
  resume_at?: string | null;
  // Tried again after a rate limit refused a send (nothing went out), and whether a person may now.
  retries?: number;
  can_retry?: boolean;
  created_at: string;
  updated_at: string;
};
export type RunPage = { runs: Run[]; next_cursor: string | null };

const enc = encodeURIComponent;

// "Test this automation": what brain says one would do with a sample from a stranger, sending and storing nothing.
export type TestSample = {
  account_id: string;
  text: string;
  author_name?: string;
  post_remote_id?: string;
  button_payload?: string;
  author_can_dm?: boolean;
  // Facebook and Instagram: how old the comment or the person's last message is, in minutes, and whether
  // the comment already got its one private reply.
  age_minutes?: number;
  private_reply_sent?: boolean;
};
export type PlannedStatus = "would_send" | "would_skip" | "would_fail" | "would_tag" | "would_do" | "would_wait" | "not_reached";
export type PlannedStep = {
  type: ActionResult["type"] | "wait" | "wait_for_reply";
  status: PlannedStatus;
  reason: string | null;
  text: string | null;
  buttons?: Button[];
  wait_minutes: number | null;
  tag: string | null;
  provider?: string;
  model?: string;
};
export type TestOutcome = {
  trigger: Trigger;
  matched: boolean;
  mismatches: string[];
  blocks: string[];
  // human_agent_by_hand or human_agent_off: Meta's 24 hours are closed, and what a person could still do by hand.
  notes?: string[];
  // What a mood condition read the sample as.
  sentiment?: string | null;
  steps: PlannedStep[];
  // On X: what the run would cost (the read plus each write).
  cost?: XCost;
};
// What a run costs on X: the read of the item and a write for each message or reaction. credits: team X credits.
export type XCost = { writes: number; read_usd: number; write_usd: number; total_usd: number; credits: number };
export type Estimate = { x: boolean; cost: XCost | null };
// What one run of the automation as it stands costs on X, without saving it.
export const estimateAutomation = (automation: AutomationInput) => api<Estimate>("/v1/automations/estimate", "POST", automation);
const dollars = (n: number) => "$" + n.toFixed(3).replace(/0$/, "");
// "About $0.045 a run on X: $0.015 to read it and $0.03 for 2 writes."
export const costText = (c: XCost) =>
  `About ${dollars(c.total_usd)} a run on X: ${dollars(c.read_usd)} to read it${c.writes > 0 ? ` and ${dollars(c.write_usd)} for ${c.writes} ${c.writes === 1 ? "write" : "writes"}` : ""}. With billing on that is about ${Number(c.credits.toFixed(1))} X credits.`;
// AI steps are written for real, one call each, so brain answers after them: up to 10 steps of 20 seconds.
export const testAutomation = (automation: AutomationInput, sample: TestSample) => api<TestOutcome>("/v1/automations/test", "POST", { automation, sample }, 120_000);

export const listAutomations = () => api<Automation[]>("/v1/automations");
export const getAutomation = (id: string) => api<Automation>(`/v1/automations/${enc(id)}`);
export const createAutomation = (input: AutomationInput) => api<Automation>("/v1/automations", "POST", input);
export const updateAutomation = (id: string, input: AutomationInput) => api<Automation>(`/v1/automations/${enc(id)}`, "PUT", input);
export const deleteAutomation = (id: string) => api(`/v1/automations/${enc(id)}`, "DELETE");
export const switchAutomation = (id: string, on: boolean) =>
  api<Automation>(`/v1/automations/${enc(id)}/${on ? "enable" : "disable"}`, "POST");
// Why an automation did not run on an item: the conditions that failed, or another reason (see `notRunText`).
// brain keeps these 14 days. Items held back for a safety reason (paused, cool-down, caps) are runs instead.
export type Miss = { inbox_item_id: string; inbox_item_number: number; reasons: string[]; created_at: string; kind: string; platform: string; author: string | null; text: string };
export const listMisses = (id: string) => api<{ misses: Miss[] }>(`/v1/automations/${enc(id)}/misses`);
// What each automation did with one inbox item.
export type Verdict = { automation_id: string; automation_number: number; name: string; outcome: "ran" | "failed" | "skipped" | "not_matched"; reasons: string[] };
export const itemAutomations = (itemId: string) => api<{ automations: Verdict[] }>(`/v1/inbox-items/${enc(itemId)}/automations`);
export const listRuns = (id: string, cursor?: string | null) =>
  api<RunPage>(`/v1/automations/${enc(id)}/runs${cursor ? `?cursor=${enc(cursor)}` : ""}`);
// Tries a run again after a rate limit refused its send: brain does it only when nothing went out, so it never sends twice.
export const retryRun = (id: string, runId: string) => api<Run>(`/v1/automations/${enc(id)}/runs/${enc(runId)}/retry`, "POST");

// brain checks texts with every {name} at its longest, 64 characters, and every {page} (the address of
// the post's public page) as 100.
const LONGEST_NAME = "n".repeat(64);
const LONGEST_PAGE = "p".repeat(100);
export const templateLength = (text: string) => graphemes(text.replaceAll("{name}", LONGEST_NAME).replaceAll("{page}", LONGEST_PAGE));
// Whether every account the automation is limited to by name is on Threads.
// What brain says about each LinkedIn account (`GET /v1/automations/linkedin`): `ready` or a block code (see blockText).
export type LinkedInAutomation = { approved: boolean; accounts: { id: string; status: string; message: string }[] };
export const linkedinAutomation = () => api<LinkedInAutomation>("/v1/automations/linkedin");
export const threadsOnly = (providers: string[]) => providers.length > 0 && providers.every((p) => p === "threads");
// A public reply's limit and what counts against it: Threads takes 500 and counts an emoji as its UTF-8 bytes (brain's threads_length),
// every other network 300 characters. {name} and {page} count at their longest.
export const replyLimit = (providers: string[]) =>
  threadsOnly(providers)
    ? { max: 500, size: (text: string) => threadsLength(text.replaceAll("{name}", "\u{10348}".repeat(64)).replaceAll("{page}", "p".repeat(100))) }
    : { max: 300, size: templateLength };
// What a Threads account cannot do, for the one-reply form: it has replies and mentions, and answers publicly.
export function threadsProblems(trigger: Trigger, hasDm: boolean): string[] {
  return [
    ...(trigger === "comment_received" || trigger === "mention_received" ? [] : ["Threads has replies and mentions only: use a comment or a mention, or leave the Threads account out."]),
    ...(hasDm ? ["Threads has no DMs and no private reply. Remove the DM text and write a public reply."] : []),
  ];
}
// What a commenter called Sam would get, for the preview.
export const sample = (text: string, name = "Sam") => text.replaceAll("{name}", name).replaceAll("{page}", "(link to the public page)");

const plain = /^[A-Za-z0-9.\-_~:]+$/;

// A Bluesky post link or at:// URI as the at://{did}/app.bsky.feed.post/{rkey} URI brain matches
// comments against. A handle in a link must be one of the team's accounts (comments land on
// their posts), so no lookup leaves the browser. null when it isn't one.
export function postUri(input: string, accounts: Pick<Connection, "provider" | "handle" | "external_id">[], numbers = false): string | null {
  const s = input.trim();
  // A post's own number as brain keeps it (a Threads post's `remote_id`): a Threads link holds a code, not this number, so the form lists the posts to pick.
  if (numbers && /^\d{8,25}$/.test(s)) return s;
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
  payloads: boolean;
  // The trigger carries text to read (keywords, a link, a mood): a follow, a tap and a story mention do not.
  text: boolean;
  note: string | null;
  // The networks it runs on, as ids of `platforms`, for the marks in the template gallery.
  networks: string[];
};
const activity = (what: string): Capability => ({
  label: `When someone ${what}s a post`,
  keywords: false,
  posts: true,
  firstPerAuthor: false,
  firstMessage: false,
  publicReply: false,
  payloads: false,
  text: false,
  note: `Bluesky only. Runs when someone ${what}s one of your posts, any post or the ones you list, within a minute or two. It has nobody to message or tag, so it follows them back, mails your team or stops the newer automations.`,
  networks: ["bluesky"],
});
export const triggers: Record<Trigger, Capability> = {
  like_received: activity("like"),
  repost_received: activity("repost"),
  comment_received: { label: "When someone comments", keywords: true, posts: true, firstPerAuthor: true, firstMessage: false, publicReply: true, payloads: false, text: true, note: null, networks: ["bluesky", "facebook", "instagram", "threads", "x", "youtube"] },
  dm_received: { label: "When someone sends a DM", keywords: true, posts: false, firstPerAuthor: false, firstMessage: true, publicReply: false, payloads: false, text: true, note: null, networks: ["bluesky", "facebook", "instagram", "x"] },
  mention_received: { label: "When someone mentions you", keywords: true, posts: false, firstPerAuthor: true, firstMessage: false, publicReply: true, payloads: false, text: true, note: null, networks: ["bluesky", "threads", "x"] },
  new_follower: {
    label: "When someone follows you",
    keywords: false,
    posts: false,
    firstPerAuthor: false,
    firstMessage: false,
    publicReply: false,
    payloads: false,
    text: false,
    note: "Bluesky only. Each follower gets the DM once. They follow you, so it reaches them unless they have DMs closed.",
    networks: ["bluesky"],
  },
  story_reply: {
    label: "When someone replies to your story",
    keywords: true,
    posts: false,
    firstPerAuthor: false,
    firstMessage: false,
    publicReply: false,
    payloads: false,
    text: true,
    note: "Instagram only, and still in testing.",
    networks: ["instagram"],
  },
  story_mention: {
    label: "When someone mentions you in a story",
    keywords: false,
    posts: false,
    firstPerAuthor: false,
    firstMessage: false,
    publicReply: false,
    payloads: false,
    text: false,
    note: "Instagram only. It needs Meta's approval of instagram_manage_messages and has not been tried on a live account yet. You can answer with a DM within 24 hours.",
    networks: ["instagram"],
  },
  button_clicked: {
    label: "When someone taps a button",
    keywords: false,
    posts: false,
    firstPerAuthor: false,
    firstMessage: false,
    publicReply: false,
    payloads: true,
    text: false,
    note: "Facebook and Instagram only. It runs when someone taps a button that a flow's DM showed them.",
    networks: ["facebook", "instagram"],
  },
};
export const TRIGGERS: Trigger[] = ["comment_received", "dm_received", "mention_received", "new_follower", "like_received", "repost_received", "story_reply", "story_mention", "button_clicked"];
// Where each action works: hiding is for comments, like and repost for comments and mentions (a post to act on),
// the rest anywhere. Which networks do them is brain's call per item (`not_supported`).
export const effectFits = (type: EffectType, trigger: Trigger) =>
  type === "hide_comment"
    ? trigger === "comment_received"
    : type === "like_comment"
      ? triggers[trigger].publicReply
      : type === "repost_comment"
        ? triggers[trigger].publicReply && triggers[trigger].networks.includes("bluesky")
        : type === "follow_back"
          ? triggers[trigger].networks.includes("bluesky")
          : true;

const isText = (x: unknown) => typeof x === "string";
export const isEffectType = (type: unknown): type is EffectType => EFFECTS.includes(type as EffectType);
export const isEffect = <T extends { type: string }>(x: T): x is Extract<T, { type: EffectType }> => isEffectType(x.type);
// A step exactly as this page builds them, so saving it again loses nothing.
function knownStep(s: unknown) {
  const x = (s ?? {}) as { type?: unknown; text?: unknown; buttons?: unknown; minutes?: unknown; tag?: unknown };
  const keys = Object.keys(x).filter((k) => k !== "type");
  const only = (...names: string[]) => keys.every((k) => names.includes(k));
  if (x.type === "wait" || x.type === "wait_for_reply") return only("minutes") && Number.isInteger(x.minutes);
  if (isEffectType(x.type)) return only();
  if (x.type === "reply_publicly") return only("text") && isText(x.text);
  if (x.type === "tag_contact") return only("tag") && isText(x.tag);
  if (x.type === "ai_send_dm" || x.type === "ai_reply_publicly") return only("prompt") && isText((x as { prompt?: unknown }).prompt);
  const buttons = x.buttons ?? [];
  return (
    x.type === "send_dm" &&
    only("text", "buttons") &&
    isText(x.text) &&
    Array.isArray(buttons) &&
    buttons.every((b) => b && Object.keys(b).length === 2 && isText(b.label) && isText(b.payload))
  );
}

const knownAction = (a: unknown) => {
  const x = (a ?? {}) as { type?: unknown; text?: unknown; tag?: unknown };
  if (isEffectType(x.type)) return Object.keys(x).length === 1;
  return x.type === "tag_contact" ? isText(x.tag) : (x.type === "send_dm" || x.type === "reply_publicly") && isText(x.text);
};

// Whether the builder can show and save this automation without losing anything: a trigger it knows,
// with plain actions or a flow of steps it knows. brain may send a newer trigger or shape, whatever
// the type above says.
const KNOWN_CONDITIONS = ["social_set_id", "account_ids", "post_remote_ids", "keywords", "first_per_author", "first_message", "payloads", "has_link", "sentiment"];
export function canEdit(a: Automation) {
  const x = a as { trigger: string; actions?: unknown; steps?: unknown; conditions?: { payloads?: unknown } | null };
  if (!Object.hasOwn(triggers, x.trigger) || typeof x.conditions !== "object" || x.conditions === null || !Array.isArray(x.actions)) return false;
  if (triggers[x.trigger as Trigger].payloads && !Array.isArray(x.conditions.payloads)) return false;
  // A condition the builder has no field for (a time window, a question rule, a language) would be dropped by a save.
  if (Object.keys(x.conditions).some((k) => !KNOWN_CONDITIONS.includes(k))) return false;
  if (x.steps === null || x.steps === undefined) return x.actions.length > 0 && x.actions.every(knownAction);
  return Array.isArray(x.steps) && x.steps.length > 0 && x.actions.length === 0 && x.steps.every(knownStep);
}

// A flow: steps, waits and buttons, as brain's `validate_steps` checks them.
export const MAX_STEPS = 10;
export const MAX_BUTTONS = 3;
export const MAX_LABEL = 20;
export const MAX_PAYLOADS = 20;
export const MAX_WAIT_MINUTES = 10080;
export type WaitUnit = "minutes" | "hours" | "days";
const unitMinutes: Record<WaitUnit, number> = { minutes: 1, hours: 60, days: 1440 };
export const WAIT_UNITS = Object.keys(unitMinutes) as WaitUnit[];

// The wait in minutes; null unless it is a whole number of 1 minute to 7 days.
export function waitMinutes(amount: string, unit: WaitUnit) {
  if (!/^\d+$/.test(amount.trim())) return null;
  const m = Number(amount) * unitMinutes[unit];
  return m >= 1 && m <= MAX_WAIT_MINUTES ? m : null;
}
// Minutes in the largest unit that holds them exactly: 1440 is 1 day, 90 stays 90 minutes.
export function waitParts(minutes: number): { amount: string; unit: WaitUnit } {
  const unit = ([...WAIT_UNITS].reverse().find((u) => minutes > 0 && minutes % unitMinutes[u] === 0) ?? "minutes") as WaitUnit;
  return { amount: String(minutes / unitMinutes[unit]), unit };
}
export function waitText(minutes: number) {
  const { amount, unit } = waitParts(minutes);
  return `${amount} ${amount === "1" ? unit.slice(0, -1) : unit}`;
}

export const payloadOk = (p: string) => /^[a-z0-9_-]{1,64}$/.test(p);
// A label as a payload: "Yes, please!" is "yes-please". Empty when nothing in it can be kept.
export const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
// `base`, or `base-2`, `base-3`... when another button of the flow has it.
export function uniquePayload(base: string, taken: string[]) {
  for (let n = 1; ; n++) {
    const p = n === 1 ? base : `${base.slice(0, 64 - `-${n}`.length)}-${n}`;
    if (!taken.includes(p)) return p;
  }
}

// `own`: the payload was loaded or typed under Advanced, so a new label leaves it alone
// (a follow-up automation may already listen for it).
export type ButtonDraft = Button & { own: boolean };
export type StepDraft = { id: number } & (
  | { type: "send_dm"; text: string; buttons: ButtonDraft[] }
  | { type: "reply_publicly"; text: string }
  // An AI send's prompt is kept as `text`, so it edits like the other sends.
  | { type: "ai_send_dm"; text: string }
  | { type: "ai_reply_publicly"; text: string }
  | { type: "wait"; amount: string; unit: WaitUnit }
  // Waits for the person's next DM, up to this long.
  | { type: "wait_for_reply"; amount: string; unit: WaitUnit }
  | { type: "tag_contact"; tag: string }
  | { type: EffectType }
);
export const isWait = <T extends { type: string }>(x: T): x is Extract<T, { type: "wait" | "wait_for_reply" }> => x.type === "wait" || x.type === "wait_for_reply";
// A step that sends something; a wait and a tag do not.
export const isAi = (type: string): type is AiType => type === "ai_send_dm" || type === "ai_reply_publicly";
export const isSend = <T extends { type: Step["type"] }>(s: T): s is Extract<T, { type: "send_dm" | "reply_publicly" | AiType }> => s.type === "send_dm" || s.type === "reply_publicly" || isAi(s.type);
let lastStepId = 0;
export function newStep(type: StepDraft["type"], text = ""): StepDraft {
  const id = ++lastStepId;
  if (type === "wait") return { id, type, amount: "1", unit: "days" };
  if (type === "wait_for_reply") return { id, type, amount: "1", unit: "days" };
  if (type === "tag_contact") return { id, type, tag: text };
  if (isEffectType(type)) return { id, type };
  return type === "send_dm" ? { id, type, text, buttons: [] } : { id, type, text };
}
const stepDraft = (s: Step): StepDraft => {
  // An assignment is API only: `canEdit` keeps an automation with one out of the builder.
  if (s.type === "assign") throw new Error("assign is not editable here");
  const id = ++lastStepId;
  if (isWait(s)) return { id, type: s.type, ...waitParts(s.minutes) };
  if (s.type === "tag_contact") return { id, type: s.type, tag: s.tag };
  if (isEffect(s)) return { id, type: s.type };
  if (s.type === "ai_send_dm" || s.type === "ai_reply_publicly") return { id, type: s.type, text: s.prompt };
  return s.type === "send_dm" ? { id, type: s.type, text: s.text, buttons: (s.buttons ?? []).map((b) => ({ ...b, own: true })) } : { id, type: s.type, text: s.text };
};
// The steps as brain takes them. A wait that is not a valid time goes as 0, which `flowProblems` catches first.
export const stepsBody = (steps: StepDraft[]): Step[] =>
  steps.map((s) => {
    if (isWait(s)) return { type: s.type, minutes: waitMinutes(s.amount, s.unit) ?? 0 };
    if (isEffect(s)) return { type: s.type };
    if (s.type === "reply_publicly") return { type: s.type, text: s.text };
    if (s.type === "ai_send_dm" || s.type === "ai_reply_publicly") return { type: s.type, prompt: s.text };
    if (s.type === "tag_contact") return { type: s.type, tag: cleanTag(s.tag) };
    const buttons = s.buttons.map((b) => ({ label: b.label.trim(), payload: b.payload }));
    return { type: s.type, text: s.text, ...(buttons.length > 0 && { buttons }) };
  });

// The text as it is checked and as Bluesky shows it: the labels as numbered lines under it.
export const numbered = (text: string, buttons: Pick<Button, "label">[]) => text + buttons.map((b, i) => `\n${i + 1}. ${b.label.trim()}`).join("");

export type FlowProblem = { step: number | null; text: string };
// What brain would refuse (422 invalid_steps or invalid_text), in words, with the step's index
// or null for the flow as a whole. Empty when the flow can be saved.
// `providers`: the networks of the accounts the automation is limited to by name (empty: a set or
// all accounts). Only when every one is Facebook or Instagram are Meta's rules checked, as brain does.
export function flowProblems(steps: StepDraft[], trigger: Trigger, providers: string[] = []): FlowProblem[] {
  const out: FlowProblem[] = [];
  const pub = triggers[trigger].publicReply;
  const acts = (s: StepDraft) => isSend(s) || (isEffect(s) && s.type !== "stop_automations");
  if (!steps.some(acts))
    out.push({ step: null, text: isActivity(trigger) ? "A flow needs at least one step that does something. Add a follow back or a mail to your team." : "A flow needs at least one step that sends something. Add a DM, or a mail to your team or a moderation step." });
  else {
    if (isWait(steps[0]!)) out.push({ step: null, text: `A flow can't start with a wait. Move ${isActivity(trigger) ? "an action" : "a DM"} above it.` });
    if (isWait(steps.at(-1)!)) out.push({ step: null, text: "A flow can't end with a wait. Add a step after it, or remove it." });
  }
  for (const type of EFFECTS)
    if (steps.filter((s) => s.type === type).length > 1) out.push({ step: null, text: `${stepName[type]} can be in a flow once.` });
  if (steps.some((s) => isEffect(s) && !effectFits(s.type, trigger)))
    out.push({ step: null, text: "Hiding works on comments, and liking and reposting on comments and mentions. Remove those steps." });
  if (isActivity(trigger) && steps.some((s) => isSend(s) || s.type === "tag_contact" || s.type === "wait_for_reply"))
    out.push({ step: null, text: "A like or repost has nobody to message or tag. Remove the message, tag and reply steps." });
  if (steps.length > MAX_STEPS) out.push({ step: null, text: `A flow takes up to ${MAX_STEPS} steps.` });
  const payloads = steps.flatMap((s) => (s.type === "send_dm" ? s.buttons.map((b) => b.payload) : []));
  steps.forEach((s, step) => {
    const say = (text: string) => out.push({ step, text });
    if (isWait(s)) {
      if (waitMinutes(s.amount, s.unit) === null) say("Wait between 1 minute and 7 days, as a whole number.");
      return;
    }
    if (isEffect(s)) return;
    if (s.type === "tag_contact") {
      if (!cleanTag(s.tag)) say("Write the tag: 1 to 30 characters, no commas.");
      return;
    }
    if ((s.type === "reply_publicly" || s.type === "ai_reply_publicly") && !pub) say("This trigger has nothing to reply under. Remove this step.");
    if (s.type === "ai_send_dm" || s.type === "ai_reply_publicly") {
      if (!s.text.trim()) say("Write the prompt.");
      else if ([...s.text].length > MAX_PROMPT) say(`Too long: at most ${MAX_PROMPT} characters.`);
      if (s.text.includes("{page}")) say("The AI can't use {page}. Remove it.");
      if (s.text.includes("{name}")) say("The AI is given their name already. Remove {name}.");
      return;
    }
    const buttons = s.type === "send_dm" ? s.buttons : [];
    const max = s.type === "send_dm" ? 1000 : 300;
    if (!s.text.trim()) say("Write the text.");
    else if (templateLength(numbered(s.text, buttons)) > max && !(threadsOnly(providers) && s.type === "reply_publicly"))
      say(`Too long: at most ${max} characters${buttons.length ? ", the button labels included" : ""}.`);
    if (!pub && s.text.includes("{page}")) say("{page} works only for comments and mentions.");
    if (buttons.length > MAX_BUTTONS) say(`A DM takes up to ${MAX_BUTTONS} buttons.`);
    for (const b of buttons) {
      const n = [...b.label.trim()].length;
      if (n < 1 || n > MAX_LABEL) say(n ? `The label "${b.label.trim()}" is too long: at most ${MAX_LABEL} characters.` : "Give every button a label.");
      if (!payloadOk(b.payload)) say(`The payload "${b.payload}" doesn't work: 1 to 64 lower-case letters, digits, - and _.`);
      else if (payloads.indexOf(b.payload) !== payloads.lastIndexOf(b.payload)) say(`Two buttons share the payload "${b.payload}". Give each its own under Advanced.`);
    }
  });
  // Threads: replies and mentions only, a public reply of 500 UTF-8-counted characters, never a DM.
  if (threadsOnly(providers)) {
    if (trigger !== "comment_received" && trigger !== "mention_received") out.push({ step: null, text: blockText.threads_unsupported_trigger! + "." });
    steps.forEach((s, step) => {
      if (s.type === "send_dm" || s.type === "ai_send_dm") out.push({ step, text: "Threads has no DMs and no private reply. Use a public reply." });
      else if (s.type === "reply_publicly" && replyLimit(providers).size(s.text) > 500)
        out.push({ step, text: "Too long for Threads, which takes 500 characters and counts an emoji as its bytes (4 for most), with {name} up to 256." });
    });
  }
  if (providers.length && providers.every((p) => p === "facebook" || p === "instagram")) {
    // After a wait for their reply the person has written, so more DMs are fine: a new 24 hours starts.
    const firstAnswer = steps.findIndex((s) => s.type === "wait_for_reply");
    const dms = steps.flatMap((s, i) => (s.type === "send_dm" && (firstAnswer < 0 || i < firstAnswer) ? [i] : []));
    if (trigger === "comment_received" && dms.length > 1)
      out.push({ step: dms[1]!, text: "Facebook and Instagram allow one private reply per comment. Keep one DM, or wait for their reply before the next." });
    // A DM trigger's DM within 24 hours of the person's message; a comment's private reply within 7 days.
    const window = !triggers[trigger].publicReply && trigger !== "new_follower" ? 24 * 60 : trigger === "comment_received" ? 7 * 24 * 60 : null;
    if (window !== null) {
      let waited = 0;
      let answered = false;
      steps.forEach((s, step) => {
        if (s.type === "wait_for_reply") [waited, answered] = [0, true];
        else if (s.type === "wait") waited += waitMinutes(s.amount, s.unit) ?? 0;
        else if (s.type === "send_dm" && waited >= (answered ? 24 * 60 : window))
          out.push({ step, text: `Facebook and Instagram take this DM only within ${answered || window === 24 * 60 ? "24 hours of the person's message" : "7 days of the comment"}. Shorten the waits before it.` });
      });
    }
    if (providers.includes("instagram"))
      steps.forEach((s, step) => {
        if (s.type === "send_dm" && new TextEncoder().encode(numbered(s.text, s.buttons).replaceAll("{name}", "\u{10348}".repeat(64)).replaceAll("{page}", "p".repeat(100))).length > 1000)
          out.push({ step, text: "Too long for Instagram, which takes 1000 bytes: letters outside English count 2 to 4 each, and {name} up to 256." });
      });
  }
  // The same button problem once, whichever of its buttons raised it.
  return out.filter((p, i) => out.findIndex((q) => q.step === p.step && q.text === p.text) === i);
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// One reply as a flow: the DM and the public reply become steps. The fallback has no place in a flow.
export function toFlow(d: Draft): { steps: StepDraft[]; dropped: string[] } {
  const pub = triggers[d.trigger].publicReply;
  const steps = [...(d.dm.trim() ? [newStep("send_dm", d.dm)] : []), ...(pub && d.publicReply.trim() ? [newStep("reply_publicly", d.publicReply.trim())] : [])];
  return {
    // A DM to fill in only when nothing else in the reply does something.
    steps: [
      // A DM to fill in only when nothing else in the reply does something (and a like has nobody to message).
      ...(steps.length || d.tags.length || d.also.some((e) => e !== "stop_automations") || isActivity(d.trigger) ? steps : [newStep("send_dm")]),
      ...d.tags.map((t) => newStep("tag_contact", t)),
      ...EFFECTS.filter((e) => d.also.includes(e)).map((e) => newStep(e)),
    ],
    dropped: pub && d.fallbackOn && d.dm.trim() && d.fallback.trim() ? ["the fallback reply"] : [],
  };
}
// A flow as one reply: its first DM and first public reply stay, and what One reply can't hold is named.
export function toSimple(steps: StepDraft[]): { dm: string; publicReply: string; tags: string[]; also: EffectType[]; dropped: string[] } {
  const of = <T extends StepDraft["type"]>(type: T) => steps.filter((s): s is Extract<StepDraft, { type: T }> => s.type === type);
  const [dms, replies, waits] = [of("send_dm"), of("reply_publicly"), [...of("wait"), ...of("wait_for_reply")]];
  const also = EFFECTS.filter((e) => steps.some((s) => s.type === e));
  const ai = steps.filter((s) => isAi(s.type)).length;
  const buttons = dms.reduce((n, s) => n + s.buttons.length, 0);
  const tags = [...new Set(of("tag_contact").map((s) => cleanTag(s.tag)).filter(Boolean))];
  const lost: [number, string, string][] = [
    [waits.length, "1 wait", "waits"],
    [ai, "1 AI step", "AI steps"],
    [buttons, "1 button", "buttons"],
    [dms.length - 1, "1 more DM", "more DMs"],
    [replies.length - 1, "1 more public reply", "more public replies"],
    [tags.length - MAX_TAG_ACTIONS, "1 more tag", "more tags"],
  ];
  return {
    tags: tags.slice(0, MAX_TAG_ACTIONS),
    also,
    dm: dms[0]?.text ?? "",
    publicReply: replies[0]?.text ?? "",
    dropped: lost.filter(([n]) => n > 0).map(([n, one, many]) => (n === 1 ? one : `${n} ${many}`)),
  };
}

// The ids to save for the post lines in the form. A line that still shows a post the automation was
// loaded with keeps that id exactly (a Facebook or Instagram post id, any at:// URI); only a line the
// user added or changed is read as a Bluesky link. null where a line is neither.
// `numbers`: the accounts in scope include a Threads, Facebook or Instagram one, whose posts have such a number.
export function postIds(lines: string[], loaded: string[], accounts: Parameters<typeof postUri>[1], numbers = false) {
  const kept = new Map(loaded.flatMap((id) => [[postLink(id), id], [id, id]]));
  return lines.map((l) => kept.get(l) ?? postUri(l, accounts, numbers));
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
  // One reply: the tags it puts on the contact, 3 at most.
  tags: string[];
  // One reply: what it does besides sending (mail the team, hide, like, stop newer automations).
  also: EffectType[];
  // Spam rule: any text, only text with a link, only text without one; and the moods it takes.
  hasLink: "any" | "yes" | "no";
  sentiment: Sentiment[];
  active: boolean;
  // One reply (dm, publicReply, fallback) or a flow (steps).
  flow: boolean;
  steps: StepDraft[];
  // button_clicked: the payloads it listens for.
  payloads: string[];
  // Safety limits as typed: whole minutes and runs a day, empty for none.
  cooldown: string;
  dailyCap: string;
  // Text conditions: only a question, only these languages (ISO codes).
  question: boolean;
  languages: string[];
  // Only at certain times: a zone, weekdays (0 is Monday) and hours as typed ("" is no limit).
  timed: boolean;
  zone: string;
  weekdays: number[];
  fromHour: string;
  toHour: string;
};
export const MAX_COOLDOWN = 10_080;
export const MAX_DAILY_CAP = 500;
// A limit as typed: a whole number in range, or null when empty. NaN when it is something else.
export function limitOf(text: string, max: number) {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : Number.NaN;
}
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
  tags: [],
  also: [],
  hasLink: "any",
  sentiment: [],
  active: true,
  flow: false,
  steps: [],
  payloads: [],
  // Brain gives a new automation 10 minutes when none is sent; showing it keeps the default honest.
  cooldown: "10",
  dailyCap: "",
  question: false,
  languages: [],
  timed: false,
  zone: "UTC",
  weekdays: [],
  fromHour: "",
  toHour: "",
};

// The gallery's groups, in order, and the id that opens the builder empty.
export const TEMPLATE_GROUPS = ["Reply to comments", "Reply to DMs", "Grow", "Follow up"] as const;
export const BLANK = "blank";
export const templates: { id: string; title: string; about: string; group: (typeof TEMPLATE_GROUPS)[number]; popular?: boolean; draft: Partial<Draft> }[] = [
  {
    id: "comment-to-dm",
    group: "Reply to comments",
    popular: true,
    title: "Comment to DM",
    about: "Send a DM to everyone who comments a keyword on your posts.",
    draft: { name: "Comment to DM", trigger: "comment_received", keywords: ["link"], dm: "Hi {name}, thanks for your comment! Here is the link: " },
  },
  {
    id: "dm-keyword",
    group: "Reply to DMs",
    title: "DM keyword reply",
    about: "Answer a DM that holds a keyword, like \"price\" or \"hours\".",
    draft: { name: "DM keyword reply", trigger: "dm_received", keywords: ["price"], dm: "Hi {name}, thanks for asking! Here are our prices: " },
  },
  {
    id: "welcome",
    group: "Reply to DMs",
    popular: true,
    title: "Welcome message",
    about: "Greet someone the first time they send you a DM.",
    draft: { name: "Welcome message", trigger: "dm_received", firstMessage: true, dm: "Hi {name}, thanks for your message! We will get back to you soon." },
  },
  {
    id: "new-follower",
    group: "Grow",
    title: "New follower DM",
    about: "Thank each new follower with a DM. Bluesky only.",
    draft: { name: "New follower DM", trigger: "new_follower", dm: "Hi {name}, thanks for following!" },
  },
  {
    id: "mention-reply",
    group: "Grow",
    title: "Mention reply",
    about: "Reply under a post that mentions you.",
    draft: { name: "Mention reply", trigger: "mention_received", publicReply: "Thanks for the mention, {name}!" },
  },
  {
    id: "story-reply",
    group: "Grow",
    title: "Story reply",
    about: "Send a DM to people who reply to your story. Instagram only.",
    draft: { name: "Story reply", trigger: "story_reply", dm: "Thanks for replying to our story, {name}!" },
  },
  {
    id: "button-follow-up",
    group: "Follow up",
    title: "Button follow-up",
    about: "Answer a tap on a button that a flow's DM showed. Facebook and Instagram only.",
    draft: { name: "Button follow-up", trigger: "button_clicked", dm: "Thanks, {name}! Here is more: " },
  },
];

// The builder's start: a saved automation, a template (with the button payload a follow-up link carried), or nothing.
// `keyword` starts the keyword list with one word, for a trigger that reads keywords (from Comments' "Automate comments like this").
export function draftOf(a?: Automation, templateId?: string | null, payload?: string | null, keyword?: string | null): Draft {
  if (!a) {
    const d = { ...empty, ...templates.find((t) => t.id === templateId)?.draft };
    const keyed = triggers[d.trigger].keywords && keyword?.trim() ? { ...d, keywords: [keyword.trim().slice(0, 100)] } : d;
    return triggers[keyed.trigger].payloads && payload && payloadOk(payload) ? { ...keyed, payloads: [payload] } : keyed;
  }
  const c = a.conditions;
  const text = (type: "send_dm" | "reply_publicly") => a.actions.flatMap((x) => (x.type === type ? [x.text] : []))[0] ?? "";
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
    tags: a.actions.flatMap((x) => (x.type === "tag_contact" ? [x.tag] : [])),
    also: a.actions.flatMap((x) => (isEffect(x) ? [x.type] : [])),
    hasLink: c.has_link === undefined ? "any" : c.has_link ? "yes" : "no",
    sentiment: c.sentiment ?? [],
    active: a.active,
    flow: Boolean(a.steps),
    steps: (a.steps ?? []).map(stepDraft),
    payloads: c.payloads ?? [],
    cooldown: a.cooldown_minutes ? String(a.cooldown_minutes) : "",
    dailyCap: a.daily_cap ? String(a.daily_cap) : "",
    question: c.question ?? false,
    languages: c.languages ?? [],
    timed: Boolean(c.when),
    zone: c.when?.zone ?? "UTC",
    weekdays: c.when?.weekdays ?? [],
    fromHour: c.when?.from_hour != null ? String(c.when.from_hour) : "",
    toHour: c.when?.to_hour != null ? String(c.when.to_hour) : "",
  };
}

// A copy to start a new automation from: switched off, named "<name> (copy)" within the 60 characters a name takes,
// and every button with a payload of its own, so a follow-up that listens for the original's buttons does not answer
// the copy's. Conditions (a button automation's payloads too), steps and tags come over as they are.
export function duplicateDraft(a: Automation): Draft {
  const d = draftOf(a);
  const taken = d.steps.flatMap((s) => (s.type === "send_dm" ? s.buttons.map((b) => b.payload) : []));
  const own = (b: ButtonDraft) => {
    const payload = uniquePayload(b.payload, taken);
    taken.push(payload);
    return { ...b, payload };
  };
  return {
    ...d,
    name: `${a.name.slice(0, 60 - " (copy)".length).trimEnd()} (copy)`,
    active: false,
    steps: d.steps.map((s) => (s.type === "send_dm" ? { ...s, buttons: s.buttons.map(own) } : s)),
  };
}

// Whether two flows are the same steps, whatever order brain wrote a step's keys in. No steps equals no steps.
export function sameSteps(a: Step[] | null | undefined, b: Step[] | null | undefined) {
  const flat = (steps: Step[] | null | undefined) =>
    JSON.stringify((steps ?? []).map((s) => (isWait(s) ? [s.type, s.minutes] : s.type === "assign" ? [s.type, s.user_id] : isEffect(s) ? [s.type] : s.type === "tag_contact" ? [s.type, s.tag] : "prompt" in s ? [s.type, s.prompt] : [s.type, s.text, ...("buttons" in s ? (s.buttons ?? []) : []).flatMap((x) => [x.label, x.payload])])));
  return flat(a) === flat(b);
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
  drop(!t.keywords && d.question, "only questions", { question: false });
  drop(!t.keywords && d.languages.length > 0, "languages", { languages: [] });
  drop(!t.firstMessage && d.firstMessage, "first message only", { firstMessage: false });
  drop(!t.publicReply && Boolean(d.publicReply.trim()), "public reply", { publicReply: "" });
  drop(!t.publicReply && (d.fallbackOn || Boolean(d.fallback.trim())), "fallback reply", { fallbackOn: false, fallback: "" });
  const unpage = (text: string) => text.replaceAll("{page}", "").replace(/ {2,}/g, " ").trim();
  drop(!t.publicReply && d.dm.includes("{page}"), "{page} in the DM", { dm: unpage(d.dm) });
  drop(!t.payloads && d.payloads.length > 0, "button payloads", { payloads: [] });
  drop(!t.text && d.hasLink !== "any", "the link rule", { hasLink: "any" });
  drop(!t.text && d.sentiment.length > 0, "the mood rule", { sentiment: [] });
  const misfit = (t: string) => isEffectType(t) && !effectFits(t, to);
  drop(d.also.some(misfit), "hide, like and repost", { also: d.also.filter((e) => !misfit(e)) });
  drop(d.steps.some((s) => misfit(s.type)), "hide, like and repost steps", { steps: d.steps.filter((s) => !misfit(s.type)) });
  // Nobody to message or tag behind a like or repost.
  drop(isActivity(to) && Boolean(d.dm.trim()), "DM", { dm: "", fallbackOn: false, fallback: "" });
  drop(isActivity(to) && d.tags.length > 0, "tags", { tags: [] });
  const messageStep = (s: StepDraft) => isSend(s) || s.type === "tag_contact" || s.type === "wait_for_reply";
  drop(isActivity(to) && d.steps.some(messageStep), "message and tag steps", { steps: d.steps.filter((s) => !messageStep(s)) });
  const replyStep = (s: StepDraft) => s.type === "reply_publicly" || s.type === "ai_reply_publicly";
  drop(!t.publicReply && d.steps.some(replyStep), "public reply steps", { steps: d.steps.filter((s) => !replyStep(s)) });
  drop(!t.publicReply && draft.steps.some((s) => s.type === "send_dm" && s.text.includes("{page}")), "{page} in the steps", {
    steps: draft.steps.map((s) => (s.type === "send_dm" ? { ...s, text: unpage(s.text) } : s)),
  });
  return { draft, dropped };
}

// The times the draft limits it to, as brain takes them; undefined when it is not limited or names nothing.
export function whenOf(d: Draft): When | undefined {
  if (!d.timed) return undefined;
  const hours = d.fromHour !== "" && d.toHour !== "";
  if (!hours && d.weekdays.length === 0) return undefined;
  return { zone: d.zone.trim() || "UTC", weekdays: [...d.weekdays].sort(), ...(hours && { from_hour: Number(d.fromHour), to_hour: Number(d.toHour) }) };
}

// Why the "only at certain times" box can't be saved as it stands, in words: empty when it can, or when it is off.
export function timeProblems(d: Draft): string[] {
  if (!d.timed) return [];
  const out: string[] = [];
  const [from, to] = [d.fromHour, d.toHour];
  if ((from === "") !== (to === "")) out.push("Set both the start and the end hour, or neither.");
  else if (from !== "" && Number(from) === Number(to)) out.push("The start and the end of the hours must differ.");
  if (from === "" && d.weekdays.length === 0) out.push("Pick the days or the hours it may run, or untick Only at certain times.");
  const zone = d.zone.trim() || "UTC";
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
  } catch {
    out.push(`"${zone}" is not a time zone. Use a name such as Asia/Dhaka or America/New_York.`);
  }
  return out;
}

// What brain gets: only the conditions and actions the trigger takes, whatever the draft still holds.
export function automationInput(d: Draft, scope: ScopeBody, uris: string[]): AutomationInput {
  const t = triggers[d.trigger];
  const dm = d.dm.trim() && !isActivity(d.trigger) ? d.dm : "";
  const reply = t.publicReply ? d.publicReply.trim() : "";
  // brain takes a fallback only next to a DM.
  const fallback = t.publicReply && dm && d.fallbackOn ? d.fallback.trim() : "";
  const head = {
    name: d.name,
    trigger: d.trigger,
    conditions: {
      ...scope,
      ...(t.keywords && { keywords: d.keywords }),
      ...(t.posts && { post_remote_ids: d.specific ? uris : [] }),
      ...(t.firstPerAuthor && { first_per_author: d.firstPerAuthor }),
      ...(t.firstMessage && { first_message: d.firstMessage }),
      ...(t.payloads && { payloads: d.payloads }),
      ...(t.text && d.question && { question: true }),
      ...(t.text && d.languages.length > 0 && { languages: d.languages }),
      ...(whenOf(d) && { when: whenOf(d) }),
      ...(t.text && d.hasLink !== "any" && { has_link: d.hasLink === "yes" }),
      ...(t.text && d.sentiment.length > 0 && { sentiment: d.sentiment }),
    },
    // Always sent: brain gives a missing cool-down 10 minutes on a new automation, and 0 is "no wait".
    cooldown_minutes: limitOf(d.cooldown, MAX_COOLDOWN) ?? 0,
    // Left out when empty: a save replaces the automation, so a missing daily cap is none.
    ...(limitOf(d.dailyCap, MAX_DAILY_CAP) !== null && { daily_cap: limitOf(d.dailyCap, MAX_DAILY_CAP) }),
  };
  // A flow goes without actions and without a fallback: brain refuses either next to steps.
  if (d.flow) return { ...head, steps: stepsBody(d.steps), active: d.active };
  return {
    ...head,
    actions: [
      ...(dm ? [{ type: "send_dm" as const, text: dm }] : []),
      ...(reply ? [{ type: "reply_publicly" as const, text: reply }] : []),
      ...(isActivity(d.trigger) ? [] : d.tags.slice(0, MAX_TAG_ACTIONS).map((tag) => ({ type: "tag_contact" as const, tag }))),
      ...EFFECTS.filter((e) => d.also.includes(e) && effectFits(e, d.trigger)).map((type) => ({ type })),
    ],
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
  youtube_no_dm: "YouTube has no DMs and no private replies: only a public reply can answer a comment",
  linkedin_no_dm: "LinkedIn gives apps no messages: only a public reply can answer a comment",
  linkedin_needs_approval: "LinkedIn has not approved this app to read comments yet",
  linkedin_personal_profile: "LinkedIn lets an app read comments on a Page's posts, not on a personal profile's",
  linkedin_needs_scope: "This LinkedIn Page was connected without the comment permissions. Reconnect it",
  linkedin_call_budget: "This LinkedIn Page used the calls LinkedIn allows it today",
  linkedin_reconnect_required: "LinkedIn refused the Page's token or a permission. Reconnect it",
  linkedin_failed: "LinkedIn refused it. Look at the account under Accounts, then try again",
  daily_cap: "The team reached 500 automation runs today",
  paused: "The team paused all its automations",
  x_no_credits: "X credits are used up: the team has none left, or X says the app is out of credits",
  x_usage_capped: "X says the app reached its usage cap",
  x_budget: "This account's monthly X budget is used up",
  x_reconnect_required: "Reconnect the X account: it was connected without the permission this needs",
  paused_waiting: "Stopped: the team paused its automations while this flow waited",
  no_question: "The text was judged not to ask a question",
  question_cap: "The team judged 300 messages with AI today, the most a day",
  own_account: "It came from one of your own connected accounts",
  connected_account: "It came from an account connected to SocialReins by another team",
  cooldown: "It already answered this person within the cool-down",
  automation_cap: "This automation reached its daily limit",
  rate_limited: "The network is rate limiting this account",
  reconnect_required: "Bluesky refused the app password. Reconnect the account",
  interrupted: "Cut off by a restart, not retried",
  bluesky_refused: "Bluesky refused it",
  bluesky_unreachable: "Bluesky couldn't be reached",
  not_repliable: "This comment can't be replied to",
  too_long: "The text was too long",
  internal: "Something went wrong on our side",
  already_tagged: "They already had this tag",
  tag_limit: "The contact already has 20 tags, the most allowed",
  no_contact: "There is no contact behind this item to tag",
  automation_changed: "Stopped: the automation was changed or switched off before the flow finished",
  no_ai_key: "No AI key: add your own on the Billing page",
  no_ai_credits: "This month's AI replies and your AI credits are used up",
  ai_daily_cap: "Our AI key has reached its limit for this team today",
  ai_failed: "The AI provider gave no answer",
  ai_empty: "The AI wrote nothing, so nothing was sent",
  ai_too_long: "The AI's text was too long to send",
  ai_link: "Not sent: the AI added a link, address or @handle that is not in your prompt",
  ai_leak: "Not sent: the AI repeated your prompt",
  no_reply: "They did not answer in time, so the rest of the flow never went out",
  reply_gone: "Their answer was deleted, so the flow stopped rather than send a second private reply",
  threads_no_dm: "Threads has no DMs and no private reply: nothing was sent unless the automation also has a public reply",
  threads_no_like: "Threads has no like for apps",
  threads_nested: "Threads can only hide a reply directly under a post of this account, not one deeper in the thread",
  not_our_thread: "Only a reply under a post of this account can be hidden, so nothing was done",
  threads_replies_closed: "The author of the post limited who can reply, so no reply was sent",
  threads_reconnect_required: "Threads refused the account's token. Reconnect the account",
  threads_permission_missing: "This Threads account was connected without the permission to reply. Reconnect it",
  threads_failed: "Threads refused it. Look at the account under Accounts, then try again",
  not_supported: "This network does not allow this on this item (Reposting and following back are Bluesky only; Instagram has no like for a comment)",
  already_done: "The account followed this person a moment ago, so it was not done twice",
  action_in_progress: "The same action on this item was being done at that moment",
  not_applicable: "This item has nothing to do that to",
  post_unavailable: "The post is gone, or Bluesky does not show it to this account",
  notify_cap: "The team already got 20 automation notifications today",
  mail_failed: "The email to your team could not be sent",
  already_assigned: "It already had someone assigned",
  not_a_member: "The person to assign is no longer on the team",
  sentiment_cap: "The team's 500 mood readings for today are used",
};
// Why it happened and what helps, for the reasons that have more to say than their name.
export const reasonWhy: Record<string, string> = {
  dm_not_allowed: "This person does not accept DMs from accounts they don't follow. On X and Bluesky there is no private reply to a comment: they must follow you or have DMs open, so keep a fallback public reply.",
  outside_window: "Meta closes a conversation 24 hours after the person's last message. A shorter wait in the flow keeps it open.",
  already_replied: "Meta allows one private reply per comment, and this comment already had it.",
  no_dm_access: "The account's Bluesky app password was made without access to DMs. Make one that allows DMs and reconnect.",
  no_public_page: "{page} is the link to the post's public page, so the text can go only under posts made here whose public page is open.",
  automation_changed: "Saving new steps or switching the automation off stops the runs that are waiting.",
  no_ai_credits: "The Scheduler and Automation plan includes 200 AI replies a month; after that each uses 1 AI credit. Add your own AI key on the Billing page for replies with no limit.",
  ai_daily_cap: "Without a plan to bill, SocialReins limits each team to a number of AI replies a day on its key. Add your own AI key on the Billing page for replies with no limit, or try again tomorrow.",
  ai_link: "The AI may only use links and @handles that are in your prompt, so this reply was held back.",
  ai_leak: "The reply quoted a long part of your prompt word for word, so it was held back.",
  daily_cap: "A team's automations run at most 500 times a day.",
  x_no_credits: "X bills every write, so an automation stops before sending when the team has no X credits (Cloud) or X says the app is out of credits. Buy credits, or fund the X app if you self-host, then press Resume in the account's X inbox settings.",
  x_usage_capped: "X refused more calls for now. Press Resume in the account's X inbox settings once its cap resets.",
  x_budget: "Each X account has a monthly budget (Accounts, the X account's settings) that pays for reading and for what automations write. Automations start again on the 1st (UTC), or when you raise it.",
  x_reconnect_required: "Open the account's X inbox settings and use Reconnect: X asks again for the direct message, like and hide permissions.",
  paused: "Someone switched on Pause all automations on the Team page. Nothing is sent, and flows waiting at a wait end, until it is switched off.",
  threads_no_dm: "Threads has no direct messages and no private reply to a comment, so an automation on a Threads account answers with a public reply only. Keep a public reply in the automation.",
  threads_replies_closed: "Threads lets the author of a post choose who may reply to it. This one takes replies from its own author only.",
  threads_permission_missing: "The account was connected before SocialReins asked Threads to let it read and send replies. Reconnect it under Accounts and accept the new permissions.",
  own_account: "Automations never answer your own connected accounts, so two accounts cannot reply to each other in a loop.",
  connected_account: "Automations never answer an account that is connected to SocialReins, so two automated accounts cannot reply to each other in a loop.",
  cooldown: "This automation has a cool-down for each person. Change it under Limits in the automation.",
  automation_cap: "This automation has a daily limit. Change it under Limits in the automation.",
  rate_limited: "The network refused the send for rate limiting, so nothing went out. Retry it from the run once the limit has passed; a flow tries again by itself 3 times.",
  no_reply: "The flow waited for their next DM and it did not come in the time you set.",
};
// Why a sample would not run an automation, in words: the conditions that fail, then the rules that stop it.
export const mismatchText: Record<string, string> = {
  wrong_set: "The account is not in the set this automation is limited to",
  wrong_account: "The account is not one this automation is limited to",
  wrong_post: "The sample is not under one of the posts listed",
  no_keyword: "The text has none of the keywords",
  not_first_from_author: "It is only for a person's first comment",
  not_first_message: "It is only for a person's first message",
  wrong_weekday: "It is not one of the days this automation runs on",
  outside_hours: "It is outside the hours this automation runs in",
  wrong_language: "The text is not in one of the languages chosen, or is too short to tell",
  no_question: "The text does not ask a question",
  button_not_named: "That button payload is not one this automation listens for",
  wrong_link: "The text does not match the link rule (with or without a link)",
  sentiment_mismatch: "The AI did not read the text as one of the moods chosen",
};
// Why an automation did not run on a real item, from brain's misses and skipped runs. A code that is none of these
// is a run reason (`reason`), or its words.
export const notRunText: Record<string, string> = {
  wrong_set: "The account is not in the set this automation is limited to",
  wrong_account: "It came to an account this automation is not limited to",
  wrong_post: "It is not on one of the posts this automation is limited to",
  no_keyword: "The text has none of the keywords",
  not_first_from_author: "It is only for a person's first comment",
  not_first_message: "It is only for a person's first message",
  button_not_named: "That button is not one this automation listens for",
  wrong_link: "The text does not match the link rule (with or without a link)",
  sentiment_mismatch: "The AI did not read the text as one of the moods chosen",
  wrong_trigger: "It is for a different kind of item",
  not_yet_on: "The automation was switched on after this came",
  followed_before: "This person had followed before, and a follower is welcomed once",
  no_public_page: "The text holds {page} and the post has no open public page",
  stopped_by_other: "An earlier automation on this item stops the newer ones",
};
export const whyNot = (code: string) => notRunText[code] ?? reason(code) ?? code;
export const blockText: Record<string, string> = {
  bluesky_only_trigger: "Likes and reposts come only from Bluesky: use a Bluesky account, or leave the others out",
  bluesky_only_action: "Reposting and following back go to Bluesky only: use a Bluesky account, or leave the others out",
  unsupported_account: "Automations run only on Bluesky, Facebook, Instagram, LinkedIn Pages, Threads, X and YouTube accounts",
  linkedin_unsupported_trigger: "LinkedIn has comments only to trigger on",
  linkedin_no_dm: "LinkedIn gives apps no messages: only a public reply can answer a comment",
  linkedin_no_hide: "LinkedIn lets an app delete a comment but not hide it, and an automation never deletes",
  linkedin_needs_approval: "LinkedIn has not approved this app to read comments yet, so nothing on LinkedIn runs",
  linkedin_personal_profile: "LinkedIn lets an app read comments on a Page's posts, not on a personal profile's",
  linkedin_needs_scope: "This LinkedIn Page was connected without the comment permissions. Reconnect it",
  threads_unsupported_trigger: "Threads has replies and mentions only: use a comment or a mention",
  threads_no_dm: "Threads has no DMs and no private reply: use a public reply",
  threads_no_like: "Threads has no like for apps: hiding a reply and a public reply work",
  youtube_unsupported_trigger: "YouTube only has comments to trigger on",
  youtube_no_dm: "YouTube has no DMs and no private replies: only a public reply can answer a comment",
  x_unsupported_trigger: "X has no follows, story replies or buttons to trigger on: use a comment, a mention or a DM",
  bluesky_unsupported_trigger: "Bluesky has no story replies or buttons to tap: use a comment, a mention, a DM, a follow, a like or a repost",
  meta_one_private_reply: "Facebook and Instagram allow one private reply per comment",
  meta_reply_window: "Facebook and Instagram take a DM only within 24 hours of the person's message (7 days for a comment)",
  facebook_unsupported_trigger: "Facebook has no story mentions: use a comment or a DM",
  meta_unsupported_trigger: "Facebook and Instagram bring no follows or mentions of your account: use a comment or a DM",
  no_public_page: "A text holds {page}, and this post has no open public page, so it would not run",
  paused: "The team paused all its automations, so nothing would be sent",
  no_ai_key: "The question condition needs an AI key: add your own on the Billing page",
  no_ai_credits: "The question condition could not be judged: this month's AI replies and your AI credits are used up",
  ai_daily_cap: "The question condition could not be judged: our AI key has reached its limit for this team today",
  ai_failed: "The question condition could not be judged: the AI provider gave no answer",
};
export const plannedStatus: Record<PlannedStatus, string> = {
  would_send: "Would send",
  would_skip: "Would not send",
  would_fail: "Would fail",
  would_tag: "Would tag",
  would_do: "Would do it",
  would_wait: "Would wait",
  not_reached: "Never reached",
};
// A reason in two or three words, for the counts on a card.
export const reasonShort: Record<string, string> = {
  x_no_credits: "no X credits",
  x_usage_capped: "X usage cap",
  x_budget: "X budget used",
  paused: "paused",
  paused_waiting: "stopped by the pause",
  no_question: "not a question",
  question_cap: "question limit",
  own_account: "own account",
  connected_account: "connected account",
  cooldown: "cool-down",
  automation_cap: "daily limit",
  daily_cap: "team daily limit",
  dm_not_allowed: "DM not allowed",
  no_dm_access: "no DM access",
  automation_changed: "changed",
};
export const reasonLabel = (code: string) => reasonShort[code] ?? code.replaceAll("_", " ");
export const reason = (code: string | null) => (code ? (reasonText[code] ?? code.replaceAll("_", " ")) : null);

export const actionName: Record<ActionResult["type"], string> = {
  send_dm: "DM",
  reply_publicly: "Public reply",
  ai_send_dm: "AI DM",
  ai_reply_publicly: "AI public reply",
  fallback_public_reply: "Fallback reply",
  tag_contact: "Tag",
  notify_team: "Mail to your team",
  assign: "Assign",
  hide_comment: "Hide the comment",
  like_comment: "Like the comment",
  repost_comment: "Repost the comment",
  follow_back: "Follow them back",
  stop_automations: "Stop newer automations",
};

// "On 2 posts", "First comment per person", "First message only".
export function conditionNotes(c: Conditions) {
  const n = c.post_remote_ids?.length ?? 0;
  const w = c.when;
  const days = w?.weekdays?.length ? (w.weekdays.length === 7 ? "every day" : w.weekdays.map((x) => WEEKDAYS[x]).join(", ")) : null;
  const hours = w?.from_hour != null && w.to_hour != null ? `${w.from_hour}:00 to ${w.to_hour}:00` : null;
  return [
    n ? `On ${n === 1 ? "1 post" : `${n} posts`}` : null,
    c.first_per_author ? "First one per person" : null,
    c.first_message ? "First message only" : null,
    c.has_link === undefined ? null : c.has_link ? "Only text with a link" : "Only text without a link",
    c.sentiment?.length ? `Mood: ${c.sentiment.join(" or ")}` : null,
    c.question ? "Only questions" : null,
    c.languages?.length ? `In ${c.languages.map((l) => LANGUAGES.find((x) => x[0] === l)?.[1] ?? l).join(", ")}` : null,
    w ? `Only ${[days, hours, w.zone].filter(Boolean).join(" ")}` : null,
  ].filter(
    (x): x is string => x !== null,
  );
}

export const stepName: Record<Step["type"], string> = {
  send_dm: "Send a DM",
  reply_publicly: "Reply publicly",
  ai_send_dm: "AI DM",
  ai_reply_publicly: "AI public reply",
  wait: "Wait",
  wait_for_reply: "Wait for their reply",
  tag_contact: "Tag the contact",
  notify_team: "Mail your team",
  assign: "Assign it",
  hide_comment: "Hide the comment",
  like_comment: "Like the comment",
  repost_comment: "Repost the comment",
  follow_back: "Follow them back",
  stop_automations: "Stop newer automations",
};
// "DM, wait 1 day, DM, tag: vip".
export const flowOutline = (steps: Step[]) =>
  steps
    .map((s) =>
      s.type === "wait"
        ? `wait ${waitText(s.minutes)}`
        : s.type === "wait_for_reply"
          ? `wait for a reply up to ${waitText(s.minutes)}`
          : s.type === "tag_contact"
            ? `tag: ${s.tag}`
            : s.type === "send_dm"
              ? "DM"
              : isAi(s.type)
                ? stepName[s.type]
                : s.type === "reply_publicly"
                  ? "public reply"
                  : stepName[s.type].toLowerCase(),
    )
    .join(", ");

export function actionsSummary(a: Pick<Automation, "actions" | "fallback_public_reply" | "steps">) {
  if (a.steps) return `${count(a.steps.length, "step")}: ${flowOutline(a.steps)}`;
  const has = (type: Action["type"]) => a.actions.some((x) => x.type === type);
  const tags =
    a.actions.flatMap((x) => (x.type === "tag_contact" ? [`, tag: ${x.tag}`] : [])).join("") +
    a.actions.flatMap((x) => (isEffect(x) || x.type === "assign" ? [`, ${actionName[x.type].toLowerCase()}`] : [])).join("");
  if (has("ai_send_dm") || has("ai_reply_publicly")) return `${a.actions.filter(isSend).map((x) => actionName[x.type]).join(" and ")}${tags}`;
  if (!a.actions.some(isSend)) return `Acts on the item${tags}`;
  if (!has("send_dm")) return `Replies publicly${tags}`;
  if (has("reply_publicly")) return `Sends a DM and replies publicly${tags}`;
  return `${a.fallback_public_reply ? "Sends a DM, or replies publicly if it can't" : "Sends a DM"}${tags}`;
}

// The run history's filter chips, applied to the runs already loaded.
export const RUN_FILTERS = ["all", "sent", "skipped", "failed", "waiting"] as const;
export type RunFilter = (typeof RUN_FILTERS)[number];
export const filterRuns = (runs: Run[], filter: RunFilter) => (filter === "all" ? runs : runs.filter((r) => r.status === filter));

// Sent, skipped and failed as percents of the three together, for the thin bar. null when nothing ran yet.
export function proportions(r: Pick<RunStats, "sent" | "skipped" | "failed">) {
  const total = r.sent + r.skipped + r.failed;
  if (!(total > 0)) return null;
  const of = (n: number) => (Math.max(0, n) / total) * 100;
  return { sent: of(r.sent), skipped: of(r.skipped), failed: of(r.failed) };
}
