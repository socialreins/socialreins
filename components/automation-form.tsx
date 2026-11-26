"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Failure } from "@/lib/auth";
import {
  automationInput,
  changeTrigger,
  createAutomation,
  draftOf,
  duplicateDraft,
  EFFECTS,
  effectFits,
  isActivity,
  flowProblems,
  MAX_TAG_ACTIONS,
  LANGUAGES,
  costText,
  estimateAutomation,
  linkedinAutomation,
  limitOf,
  timeProblems,
  whenOf,
  WEEKDAYS,
  MAX_COOLDOWN,
  MAX_DAILY_CAP,
  postIds,
  sample,
  sameSteps,
  SENTIMENTS,
  slug,
  replyLimit,
  stepName,
  templateLength,
  threadsOnly,
  threadsProblems,
  toFlow,
  toSimple,
  TRIGGERS,
  triggers,
  updateAutomation,
  type Automation,
  type AutomationInput,
  type XCost,
  type Draft,
  type ScopeBody,
  type Trigger,
} from "@/lib/automations";
import type { Connection } from "@/lib/connections";
import { cleanTag } from "@/lib/contacts";
import { MAX_DM } from "@/lib/inbox";
import type { SocialSet } from "@/lib/sets";
import { effectHint, FlowEditor, FlowPreview, TagLine, TextField } from "@/components/automation-flow";
import { AutomationTest } from "@/components/automation-test";
import { KeywordsField, ScopeField, scopeBody, scopeOf } from "@/components/scope-fields";
import { isFailure, Status, useAction } from "@/components/team-ui";
import { ThreadsPostPicker } from "@/components/threads-post-picker";
import { Icon, type IconName } from "@/components/ui";

// Networks whose inbox can fire an automation; brain refuses an account on any other (unsupported_account).
const AUTOMATED = ["bluesky", "facebook", "instagram", "linkedin", "threads", "x", "youtube"];
// What a LinkedIn account that cannot run automations shows, until brain says otherwise.
const LINKEDIN_WAIT = "Needs LinkedIn approval";
const linkedinNote: Record<string, string> = {
  linkedin_needs_approval: LINKEDIN_WAIT,
  linkedin_personal_profile: "Pages only: LinkedIn does not let apps read a profile's comments",
  linkedin_needs_scope: "Reconnect this Page to allow comments",
};

export const automationMessages: Partial<Record<Failure, ReactNode>> = {
  unsupported_account: "Automations run only on Bluesky, Facebook, Instagram, LinkedIn Pages, Threads, X and YouTube accounts. Remove the others.",
  linkedin_unsupported_trigger: "LinkedIn has comments only to trigger on. Pick a comment, or leave the LinkedIn Page out.",
  linkedin_no_dm: "LinkedIn gives apps no messages, so it takes a public reply only. Remove the DM, or leave the LinkedIn Page out.",
  linkedin_no_hide: "LinkedIn lets an app delete a comment but not hide it. Remove the hide, or leave the LinkedIn Page out.",
  linkedin_needs_approval: "LinkedIn has not approved this app to read comments yet. Leave the LinkedIn account out until it does.",
  linkedin_personal_profile: "LinkedIn lets an app read comments on a Page's posts, not on a personal profile's. Leave the profile out.",
  linkedin_needs_scope: "This LinkedIn Page was connected without the comment permissions. Reconnect it under Accounts, or leave it out.",
  youtube_unsupported_trigger: "YouTube only has comments to trigger on. Pick a comment, or leave the YouTube channel out.",
  youtube_no_dm: "YouTube has no DMs and no private replies. Answer with a public reply, or leave the YouTube channel out.",
  threads_unsupported_trigger: "Threads has replies and mentions only. Pick a comment or a mention, or leave the Threads account out.",
  threads_no_dm: "Threads has no DMs and no private reply, so it takes a public reply only. Remove the DM, or leave the Threads account out.",
  threads_no_like: "Threads has no like for apps. Hiding a reply directly under your post and a public reply work; remove the like, or leave the Threads account out.",
  x_unsupported_trigger: "X has no follows, story replies or buttons to trigger on. Pick a comment, a mention or a DM, or leave the X account out.",
  bluesky_unsupported_trigger: "Bluesky has no story replies or buttons to tap. Pick a comment, a mention, a DM, a follow, a like or a repost, or leave the Bluesky account out.",
  bluesky_only_trigger: "Likes and reposts come only from Bluesky. Limit this to a Bluesky account, or pick another trigger.",
  bluesky_only_action: "Reposting and following back go to Bluesky only. Limit this to a Bluesky account, or remove them.",
  meta_one_private_reply: "Facebook and Instagram allow one private reply per comment. Keep one DM in this flow.",
  meta_reply_window: "Facebook and Instagram take a DM only within 24 hours of the person's message. Shorten the waits.",
  invalid_conditions: "One of the accounts, the set or a post link is no longer valid, a keyword is too long, or a condition does not fit this trigger. Check them and try again.",
  invalid_actions: "Add a DM text or a public reply that this trigger can send.",
  invalid_text: "A text is too long or holds {page} where it can't go. DMs take 1000 characters and public replies 300 (500 on Threads, with an emoji counted as its bytes), with {name} counted as 64 and {page} as 100. {page} works only for comments and mentions, and needs a space before it and a space or the end after it.",
  invalid_fallback: "The fallback reply does not work: it needs a DM text, at most 300 characters, with {name} counted as 64 and {page} as 100, and {page} needs a space before it and a space or the end after it.",
  invalid_steps: "A step does not work. A flow takes 1 to 10 steps, can't start or end with a wait (1 minute to 7 days), sends only what its trigger can send, and each DM takes up to 3 buttons with a label of 1 to 20 characters.",
  actions_and_steps: "An automation is one reply or a flow of steps, not both. Reload the page and try again.",
  invalid_cooldown: "The cool-down must be a whole number of minutes from 1 to 10080 (7 days), or empty.",
  invalid_daily_cap: "The daily limit must be a whole number from 1 to 500, or empty.",
  invalid_trigger: "That trigger isn't supported.",
  too_many_automations: "This team already has 50 automations, the most allowed. Delete one first.",
  forbidden: "Only team owners and admins can change automations.",
  not_found: "This automation no longer exists.",
};

export const triggerIcon: Record<Trigger, IconName> = {
  comment_received: "comment",
  dm_received: "send",
  mention_received: "mention",
  new_follower: "follower",
  story_reply: "story",
  story_mention: "story",
  button_clicked: "check",
  like_received: "heart",
  repost_received: "repeat",
};

// What Sam does in the preview, and what Sam writes when no keyword is set.
const incoming: Record<Trigger, { did: string; text: string | null }> = {
  comment_received: { did: "commented on your post", text: "Love this! Where can I get it?" },
  dm_received: { did: "sent you a DM", text: "Hi! Are you open on Sunday?" },
  mention_received: { did: "mentioned you", text: "Just tried this, so good!" },
  new_follower: { did: "followed you", text: null },
  story_reply: { did: "replied to your story", text: "Wow, where is this?" },
  story_mention: { did: "mentioned you in their story", text: null },
  button_clicked: { did: "tapped a button", text: null },
  like_received: { did: "liked your post", text: null },
  repost_received: { did: "reposted your post", text: null },
};

const leaveQuestion = "Leave without saving? Your changes to this automation will be lost.";
const cardTitle = "px-1 font-display text-lg font-extrabold tracking-tight";

// The builder over brain's trigger, conditions and actions: When, Only if, Do this, and a preview.
export function AutomationForm({
  automation: a,
  copyOf,
  template,
  payload,
  startScope,
  accounts,
  ready,
  sets,
  onSaved,
  onCancel,
}: {
  automation?: Automation;
  // Another automation to start a new one from (Duplicate): saving creates, never updates.
  copyOf?: Automation;
  // A template id from `templates`, for a new automation.
  template?: string | null;
  // From a button's follow-up link, for a new automation: the payload to listen for and the flow's scope.
  payload?: string | null;
  startScope?: ScopeBody;
  accounts: Connection[];
  // The accounts have loaded, so post links by handle can be resolved.
  ready: boolean;
  sets: SocialSet[];
  onSaved: (a: Automation) => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(() => (copyOf ? duplicateDraft(copyOf) : draftOf(a, template, payload)));
  const [scope, setScope] = useState(scopeOf((a ?? copyOf)?.conditions ?? startScope ?? { account_ids: [] }));
  // A LinkedIn account runs automations only when brain says it is ready; until it answers, every one counts as waiting for approval.
  const hasLinkedin = accounts.some((x) => x.provider === "linkedin");
  const [linkedinState, setLinkedinState] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!hasLinkedin) return;
    let live = true;
    linkedinAutomation().then((r) => {
      if (live && !isFailure(r)) setLinkedinState(Object.fromEntries(r.accounts.map((x) => [x.id, x.status])));
    });
    return () => {
      live = false;
    };
  }, [hasLinkedin]);
  const locked = Object.fromEntries(
    accounts
      .filter((x) => x.provider === "linkedin" && (linkedinState[x.id] ?? "linkedin_needs_approval") !== "ready")
      .map((x) => [x.id, linkedinNote[linkedinState[x.id] ?? "linkedin_needs_approval"] ?? LINKEDIN_WAIT]),
  );
  // What the form opened with, to tell whether leaving would lose anything.
  const now = JSON.stringify([d, scope]);
  const [opened] = useState(now);
  const dirty = now !== opened;
  // A save that would stop waiting runs, waiting for a yes.
  const [stopping, setStopping] = useState(false);
  // A switch between One reply and A flow that would drop something, waiting for a yes.
  const [pending, setPending] = useState<{ patch: Partial<Draft>; dropped: string[] } | null>(null);
  // A save was tried, so the flow's and the payloads' problems show.
  const [tried, setTried] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);
  const [badLinks, setBadLinks] = useState<string[]>([]);
  const { busy, problem, done, run } = useAction();
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  // The languages list stays open once used, and a zone the person chose is never replaced by the browser's.
  const [langsOpen, setLangsOpen] = useState(false);
  const [touchedZone, setTouchedZone] = useState(d.zone !== "UTC");

  const t = triggers[d.trigger];
  const tokens = t.publicReply ? ["{name}", "{page}"] : ["{name}"];
  const lines = d.posts.split("\n").map((l) => l.trim()).filter(Boolean);
  // A like or repost has nobody to message and no contact to tag.
  const nobody = isActivity(d.trigger);
  const hasDm = Boolean(d.dm.trim());
  // brain refuses tags with nothing sent beside them (422 invalid_actions).
  const acts = d.also.some((e) => e !== "stop_automations");
  const tagsAlone = !d.flow && (d.tags.length > 0 || d.also.length > 0) && !hasDm && !(t.publicReply && d.publicReply.trim()) && !acts;
  const sam = incoming[d.trigger];
  const picked = scope.mode === "accounts" ? accounts.filter((x) => scope.accountIds.includes(x.id)) : [];
  const providers = picked.map((x) => x.provider);
  // Accounts saved before automations were limited to these networks stay listed so they can be unticked.
  const stuck = picked.filter((x) => !AUTOMATED.includes(x.provider)).map((x) => x.handle ?? x.display_name ?? x.provider);
  const problems = d.flow ? flowProblems(d.steps, d.trigger, providers) : [];
  const limit = replyLimit(providers);
  const waiting = a?.runs?.waiting ?? 0;
  // Everything that stops a save, with the field to fix it in, for the bar's count.
  const issues: { text: string; field: string }[] = [
    ...(d.name.trim() ? [] : [{ text: "Give it a name.", field: "automation-name" }]),
    ...(stuck.length ? [{ text: `Untick ${stuck.join(", ")}: automations run only on Bluesky, Facebook, Instagram, Threads, X and YouTube.`, field: "automation-scope" }] : []),
    ...(t.payloads && !d.payloads.length ? [{ text: "Add at least one button payload.", field: "automation-payloads" }] : []),
    ...timeProblems(d).map((text) => ({ text, field: "automation-from-hour" })),
    ...(Number.isNaN(limitOf(d.cooldown, MAX_COOLDOWN)) ? [{ text: "The wait must be 1 to 10080 minutes, or empty.", field: "automation-cooldown" }] : []),
    ...(Number.isNaN(limitOf(d.dailyCap, MAX_DAILY_CAP)) ? [{ text: "Most runs a day must be 1 to 500, or empty.", field: "automation-daily-cap" }] : []),
    ...(d.flow
      ? problems.map((p) => ({ text: p.step === null ? p.text : `Step ${p.step + 1}: ${p.text}`, field: p.step === null ? "automation-flow-add" : `step-${d.steps[p.step]!.id}-field` }))
      : [
          ...(hasDm || (t.publicReply && d.publicReply.trim()) || acts ? [] : [{ text: nobody ? "Tick something to do under Also." : t.publicReply ? "Write a DM text or a public reply." : "Write the DM text.", field: nobody ? "automation-also" : "automation-dm" }]),
          ...(templateLength(d.dm) > MAX_DM ? [{ text: "The DM text is too long.", field: "automation-dm" }] : []),
          ...(t.publicReply && limit.size(d.publicReply) > limit.max ? [{ text: "The public reply is too long.", field: "automation-public-reply" }] : []),
          ...(threadsOnly(providers) ? threadsProblems(d.trigger, hasDm).map((text) => ({ text, field: hasDm ? "automation-dm" : "automation-scope" })) : []),
        ]),
  ];

  // Guards a reload, a closed tab, a click on any link of the app and the browser's Back button. Back can't be
  // refused, so a second history entry of this same page takes it: Back lands on the first one, the form stays, and a
  // no puts the second entry back while a yes goes back once more.
  // shortcut: that entry stays after a save or Cancel, so one Back press there does nothing. Upgrade if Next gets a navigation guard.
  useEffect(() => {
    if (!dirty) return;
    let leaving = false;
    let retry = 0;
    const here = window.location.href;
    const unload = (e: BeforeUnloadEvent) => {
      if (!leaving) e.preventDefault();
    };
    // Next's own history state passes through its pushState untouched, so the router sees the same page.
    const hold = () => window.history.state?.unsaved || window.history.pushState({ ...window.history.state, unsaved: true }, "", window.location.href);
    const back = () => {
      // A jump of several entries has already left this page: asking there would hold the wrong one.
      if (window.history.state?.unsaved || window.location.href !== here) return;
      if (!window.confirm(leaveQuestion)) return hold();
      // The yes is given: neither this listener nor `unload` asks a second time.
      leaving = true;
      window.removeEventListener("popstate", back);
      window.history.back();
      // With no page before this one (a new tab) Back goes nowhere: the form is still here, so guard it again.
      retry = window.setTimeout(() => {
        if (window.location.href !== here) return;
        leaving = false;
        hold();
        window.addEventListener("popstate", back);
      }, 500);
    };
    hold();
    const click = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!link || link.getAttribute("target") === "_blank" || link.getAttribute("href")!.startsWith("#") || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (window.confirm(leaveQuestion)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("popstate", back);
    document.addEventListener("click", click, true);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("popstate", back);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);

  function onMode(flow: boolean) {
    if (flow === d.flow) return;
    const patch: Partial<Draft> = { flow, steps: [], tags: [], also: [] };
    let dropped: string[];
    if (flow) {
      const next = toFlow(d);
      Object.assign(patch, { steps: next.steps, fallbackOn: false, fallback: "" });
      dropped = next.dropped;
    } else {
      const next = toSimple(d.steps);
      Object.assign(patch, { dm: next.dm, publicReply: next.publicReply, tags: next.tags, also: next.also });
      dropped = next.dropped;
    }
    if (dropped.length) setPending({ patch, dropped });
    else set(patch);
  }
  const followUp = (payload: string) => {
    const s = scopeBody(scope);
    const q = new URLSearchParams({ template: "button-follow-up", payload });
    if (s.social_set_id) q.set("set", s.social_set_id);
    else if (s.account_ids.length) q.set("accounts", s.account_ids.join(","));
    return `/automations/new?${q}`;
  };

  function onTrigger(to: Trigger) {
    const next = changeTrigger(d, to);
    setD(next.draft);
    setDropped(next.dropped);
    setPending(null);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save(false);
  }

  // The post links as ids, `null` where a link is none.
  const specific = t.posts && d.specific;
  // The accounts the scope reaches, for what the post lines may be: a set or all accounts reach every account in them.
  const reached = scope.mode === "accounts" ? picked : scope.mode === "set" ? accounts.filter((x) => x.set_ids.includes(scope.setId)) : accounts;
  const numbered = reached.some((x) => ["threads", "facebook", "instagram"].includes(x.provider));
  const uris = specific ? postIds(lines, (a ?? copyOf)?.conditions.post_remote_ids ?? [], accounts, numbered) : [];
  const testable = !specific || (lines.length > 0 && uris.every(Boolean));
  // What a run costs on X, asked of brain while the form changes, and only when an X account can be in
  // scope (the team has one, and a scope by name names one).
  const mayBeX = accounts.some((x) => x.provider === "x") && (scope.mode !== "accounts" || picked.some((x) => x.provider === "x"));
  const priced = testable && mayBeX ? JSON.stringify(automationInput(d, scopeBody(scope), uris as string[])) : null;
  // The answer is kept with what it was asked for, so a figure for an older draft is never shown.
  const [answer, setAnswer] = useState<{ asked: string; cost: XCost | null } | null>(null);
  const cost = priced !== null && answer?.asked === priced ? answer.cost : null;
  useEffect(() => {
    if (priced === null) return;
    let live = true;
    const wait = setTimeout(() => {
      estimateAutomation(JSON.parse(priced) as AutomationInput).then((r) => {
        if (live) setAnswer({ asked: priced, cost: !isFailure(r) && r.x ? r.cost : null });
      });
    }, 600);
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [priced]);

  // `sure`: the yes to stopping the runs that wait in the flow.
  async function save(sure: boolean) {
    const bad = specific ? lines.filter((_, i) => !uris[i]) : [];
    setBadLinks(bad);
    if (bad.length || (specific && !lines.length)) {
      document.getElementById("automation-posts")?.focus();
      return;
    }
    if (t.payloads && !d.payloads.length) {
      setTried(true);
      document.getElementById("automation-payloads")?.focus();
      return;
    }
    if (tagsAlone) {
      setTried(true);
      document.getElementById(nobody ? "automation-also" : "automation-dm")?.focus();
      return;
    }
    // A limit that is not a whole number in range would be sent as none, and clear a working one.
    const badLimit = [
      ["automation-cooldown", d.cooldown, MAX_COOLDOWN],
      ["automation-daily-cap", d.dailyCap, MAX_DAILY_CAP],
    ] as const;
    const wrong = badLimit.find(([, text, max]) => Number.isNaN(limitOf(text, max)));
    if (wrong) {
      setTried(true);
      document.getElementById(wrong[0])?.focus();
      return;
    }
    if (timeProblems(d).length) {
      setTried(true);
      document.getElementById("automation-from-hour")?.focus();
      return;
    }
    if (problems.length) {
      flushSync(() => setTried(true));
      document.querySelector("#automation-flow [role=alert]")?.scrollIntoView({ block: "center" });
      return;
    }
    const input = automationInput(d, scopeBody(scope), uris as string[]);
    if (a && waiting > 0 && !sure && !sameSteps(a.steps, input.steps)) {
      flushSync(() => setStopping(true));
      document.getElementById("automation-stop-yes")?.focus();
      return;
    }
    setStopping(false);
    await run("save", () => (a ? updateAutomation(a.id, input) : createAutomation(input)), (saved) => {
      onSaved(saved);
      return a ? "Automation saved." : undefined;
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <form onSubmit={onSubmit} className="grid gap-6" aria-labelledby="automation-form-title">
        <h2 id="automation-form-title" className="sr-only">
          {a ? `Edit ${a.name}` : "New automation"}
        </h2>
        <div className="grid gap-1.5">
          <label htmlFor="automation-name" className="label">
            Name
          </label>
          <input
            id="automation-name"
            required
            maxLength={60}
            className="field"
            value={d.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Price question to DM"
            aria-invalid={problem === "invalid_name" || undefined}
          />
        </div>

        <fieldset className="card grid gap-4 p-5">
          <legend className={cardTitle}>When</legend>
          <div role="radiogroup" aria-label="Trigger" className="grid gap-2 sm:grid-cols-2">
            {TRIGGERS.map((id) => (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 font-bold has-focus-visible:outline-2 ${
                  d.trigger === id ? "border-ink bg-ink/5" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"
                }`}
              >
                <input type="radio" name="automation-trigger" className="sr-only" checked={d.trigger === id} onChange={() => onTrigger(id)} />
                <Icon name={triggerIcon[id]} className={`size-5 ${d.trigger === id ? "text-signal-deep" : ""}`} />
                {triggers[id].label}
              </label>
            ))}
          </div>
          {t.note && <p className="hint">{t.note}</p>}
          <p role="status" className={dropped.length ? "rounded-xl bg-canvas px-3 py-2 text-sm" : "sr-only"}>
            {dropped.length > 0 && `This trigger doesn't take them, so they were removed: ${dropped.join(", ")}.`}
          </p>
        </fieldset>

        <fieldset className="card grid gap-5 p-5">
          <legend className={cardTitle}>Only if</legend>
          <ScopeField id="automation-scope" value={scope} onChange={setScope} accounts={accounts.filter((x) => AUTOMATED.includes(x.provider) || scope.accountIds.includes(x.id))} sets={sets} locked={locked} />
          {t.keywords && (
            <KeywordsField
              id="automation-keywords"
              label="Contains"
              hint="Any of these words, in any case. Leave empty to act on every one. Press Enter or a comma after each word."
              value={d.keywords}
              onChange={(keywords) => set({ keywords })}
            />
          )}
          {t.payloads && (
            <div className="grid gap-1.5">
              <KeywordsField
                id="automation-payloads"
                label="Button payloads"
                hint="The payload of each button whose tap runs this: find it under Advanced on the button in the flow. Press Enter or a comma after each. Up to 20."
                value={d.payloads}
                onChange={(payloads) => set({ payloads })}
                clean={slug}
              />
              {tried && !d.payloads.length && (
                <p role="alert" className="waitlist-error">
                  Add at least one button payload.
                </p>
              )}
            </div>
          )}
          {t.posts && (
            <fieldset className="grid gap-2">
              <legend className="label mb-1">On</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <label className="flex items-center gap-2">
                  <input type="radio" name="automation-posts-mode" checked={!d.specific} onChange={() => set({ specific: false })} />
                  Any post
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="automation-posts-mode" checked={d.specific} onChange={() => set({ specific: true })} />
                  Specific posts
                </label>
              </div>
              {d.specific && (
                <div className="grid gap-1.5">
                  <label htmlFor="automation-posts" className="label">
                    Post links
                  </label>
                  <textarea
                    id="automation-posts"
                    rows={3}
                    required
                    className="field resize-y font-normal"
                    value={d.posts}
                    onChange={(e) => set({ posts: e.target.value })}
                    placeholder="https://bsky.app/profile/you.bsky.social/post/3l..."
                    aria-describedby="automation-posts-hint automation-posts-error"
                    aria-invalid={badLinks.length > 0 || undefined}
                  />
                  <p id="automation-posts-hint" className="hint">
                    One Bluesky post link per line, from a connected account, or a post&apos;s number (for Threads, pick the post below). Posts already listed here stay as they are.
                  </p>
                  {reached.some((x) => x.provider === "threads") && (
                    <ThreadsPostPicker
                      accountIds={reached.filter((x) => x.provider === "threads").map((x) => x.id)}
                      onPick={(id) => set({ posts: d.posts.split("\n").some((l) => l.trim() === id) ? d.posts : `${d.posts.trimEnd()}${d.posts.trim() ? "\n" : ""}${id}` })}
                    />
                  )}
                  {badLinks.length > 0 && (
                    <p id="automation-posts-error" role="alert" className="waitlist-error">
                      {badLinks.length === 1 ? "This link isn't" : "These links aren't"} a post of a connected Bluesky account or a post number: {badLinks.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          )}
          {t.firstPerAuthor && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={d.firstPerAuthor} onChange={(e) => set({ firstPerAuthor: e.target.checked })} />
              {d.trigger === "mention_received" ? "First mention per person only" : "First comment per person only"}
            </label>
          )}
          {t.firstMessage && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={d.firstMessage} onChange={(e) => set({ firstMessage: e.target.checked })} />
              Only their first message ever
            </label>
          )}
          {t.text && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={d.question} onChange={(e) => set({ question: e.target.checked })} />
              Only messages that ask a question
            </label>
          )}
          {t.keywords && d.question && (
            <p className="hint pl-6">A message with a question mark counts at once. Any other is read by AI, which counts against your AI replies (or your AI key).</p>
          )}
          {t.text && (
            <details className="grid gap-2" open={langsOpen || d.languages.length > 0}>
              <summary className="cursor-pointer font-medium">Only certain languages{d.languages.length > 0 && ` (${d.languages.length})`}</summary>
              <div role="group" aria-label="Languages" className="flex flex-wrap gap-x-4 gap-y-1">
                {LANGUAGES.map(([code, name]) => (
                  <label key={code} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={d.languages.includes(code)}
                      disabled={d.languages.length >= 10 && !d.languages.includes(code)}
                      onChange={(e) => {
                        setLangsOpen(true);
                        set({ languages: e.target.checked ? [...d.languages, code] : d.languages.filter((x) => x !== code) });
                      }}
                    />
                    {name}
                  </label>
                ))}
              </div>
              <p className="hint">Up to 10, then the rest are greyed out. The language is guessed from the text: a very short message may not be recognized, and then the automation does not run.</p>
            </details>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.timed} onChange={(e) => set({ timed: e.target.checked, ...(e.target.checked && !touchedZone && { zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }) })} />
            Only at certain times
          </label>
          {d.timed && (
            <div className="grid gap-3 pl-6">
              <div role="group" aria-label="Days" className="flex flex-wrap gap-x-4 gap-y-1">
                {WEEKDAYS.map((name, i) => (
                  <label key={name} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={d.weekdays.includes(i)} onChange={(e) => set({ weekdays: e.target.checked ? [...d.weekdays, i] : d.weekdays.filter((x) => x !== i) })} />
                    {name}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="automation-from-hour">From</label>
                <select id="automation-from-hour" className="field w-auto" value={d.fromHour} onChange={(e) => set({ fromHour: e.target.value })}>
                  <option value="">Any time</option>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={String(h)}>{`${h}:00`}</option>
                  ))}
                </select>
                <label htmlFor="automation-to-hour">to</label>
                <select id="automation-to-hour" className="field w-auto" value={d.toHour} onChange={(e) => set({ toHour: e.target.value })}>
                  <option value="">Any time</option>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h + 1} value={String(h + 1)}>{`${h + 1}:00`}</option>
                  ))}
                </select>
                <label htmlFor="automation-zone">in</label>
                <input
                  id="automation-zone"
                  className="field w-auto"
                  value={d.zone}
                  onChange={(e) => {
                    setTouchedZone(true);
                    set({ zone: e.target.value });
                  }}
                  placeholder="Asia/Dhaka"
                  aria-describedby="automation-zone-hint"
                />
              </div>
              <p id="automation-zone-hint" className="hint">Pick days, hours, or both. The time zone is an IANA name such as Asia/Dhaka or America/New_York. A later start than end runs overnight.</p>
            </div>
          )}
          {t.text && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="automation-link-rule" className="label">
                  Links in their text
                </label>
                <select id="automation-link-rule" className="field" value={d.hasLink} onChange={(e) => set({ hasLink: e.target.value as Draft["hasLink"] })} aria-describedby="automation-link-hint">
                  <option value="any">Any text</option>
                  <option value="yes">Only text with a link (spam)</option>
                  <option value="no">Only text without a link</option>
                </select>
                <p id="automation-link-hint" className="hint">
                  A link, a web address or an email.{d.trigger === "comment_received" && " Pair \"with a link\" with Hide the comment to keep spam off your posts."}
                </p>
              </div>
              <fieldset className="grid gap-1.5" aria-describedby="automation-mood-hint">
                <legend className="label">Their mood</legend>
                {SENTIMENTS.map((m) => (
                  <label key={m} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={d.sentiment.includes(m)}
                      onChange={(e) => set({ sentiment: e.target.checked ? [...d.sentiment, m] : d.sentiment.filter((x) => x !== m) })}
                    />
                    {m === "positive" ? "Positive (thanks, praise)" : "Negative (a complaint, anger)"}
                  </label>
                ))}
                <p id="automation-mood-hint" className="hint">
                  Read by AI after the other conditions match, and counted like an AI reply. Neither ticked: any mood.
                </p>
              </fieldset>
            </div>
          )}
        </fieldset>

        <fieldset className="card grid gap-5 p-5">
          <legend className={cardTitle}>Do this</legend>
          <div role="radiogroup" aria-label="Reply with" className="flex flex-wrap gap-x-5 gap-y-1">
            <label className="flex items-center gap-2">
              <input type="radio" name="automation-mode" checked={!d.flow} onChange={() => onMode(false)} />
              One reply
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="automation-mode" checked={d.flow} onChange={() => onMode(true)} />
              A flow of steps
            </label>
          </div>
          {pending && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-3">
              <p className="basis-full text-sm">
                {d.flow ? "One reply" : "A flow"} can&apos;t hold everything here. Switching drops: {pending.dropped.join(", ")}.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  set(pending.patch);
                  setPending(null);
                }}
              >
                Switch and drop them
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPending(null)}>
                Keep {d.flow ? "the flow" : "one reply"}
              </button>
            </div>
          )}
          {d.flow ? (
            <FlowEditor
              steps={d.steps}
              onChange={(steps) => {
                set({ steps });
                setPending(null);
              }}
              trigger={d.trigger}
              providers={providers}
              problems={tried ? problems : []}
              followUp={followUp}
            />
          ) : (
            <>
              {!nobody && (
              <TextField
                id="automation-dm"
                label={t.publicReply ? <>DM text <span className="font-normal text-ink-soft">(optional when it replies publicly)</span></> : "DM text"}
                value={d.dm}
                onChange={(dm) => set({ dm })}
                max={MAX_DM}
                tokens={tokens}
                // A comment or mention may get a public reply alone.
                // With tags the form says what is missing itself, in its own words.
                required={(!t.publicReply || !d.publicReply.trim()) && !d.tags.length && !d.also.length}
                placeholder="Hi {name}, here is the link you asked for: ..."
                hint={
                  t.publicReply
                    ? "{name} is their display name, or \"there\" when it has links or symbols (counts as 64). {page} is the link to the post's public page (counts as 100): the automation then runs only under posts made here whose public page is open."
                    : "{name} is their display name, or \"there\" when it has links or symbols. It counts as 64 characters."
                }
              />
              )}
              {t.publicReply && (
                <>
                  <TextField
                    id="automation-public-reply"
                    label={<>Public reply <span className="font-normal text-ink-soft">(optional, goes every time)</span></>}
                    value={d.publicReply}
                    onChange={(publicReply) => set({ publicReply })}
                    max={limit.max}
                    length={limit.size(d.publicReply)}
                    tokens={tokens}
                    placeholder="Sent you a DM, {name}!"
                  />
                  <div className="grid gap-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={d.fallbackOn && hasDm} disabled={!hasDm} onChange={(e) => set({ fallbackOn: e.target.checked })} aria-describedby="automation-fallback-about" />
                      If the DM can&apos;t be delivered, reply publicly instead
                    </label>
                    <p id="automation-fallback-about" className="hint pl-6">
                      {hasDm ? "Many people take DMs only from accounts they follow. The fallback reply goes only when the DM is refused." : "Write a DM text first."}
                    </p>
                    {d.fallbackOn && hasDm && (
                      <TextField
                        id="automation-fallback-reply"
                        label="Fallback reply"
                        value={d.fallback}
                        onChange={(fallback) => set({ fallback })}
                        max={limit.max}
                        length={limit.size(d.fallback)}
                        tokens={tokens}
                        required
                        placeholder="I couldn't DM you, {name}. Follow us and comment again!"
                      />
                    )}
                  </div>
                </>
              )}
              {!nobody && (
              <KeywordsField
                id="automation-tags"
                label="Tag the contact"
                hint="Optional, up to 3 tags put on the person's contact when this runs. Press Enter or a comma after each. Tags are saved in lower case."
                value={d.tags}
                onChange={(tags) => set({ tags })}
                clean={cleanTag}
                max={MAX_TAG_ACTIONS}
              />
              )}
              <fieldset className="grid gap-2">
                <legend id="automation-also" tabIndex={-1} className="label">
                  {nobody ? "Do this (pick at least one)" : "Also (optional)"}
                </legend>
                {EFFECTS.filter((e) => effectFits(e, d.trigger)).map((e) => (
                  <label key={e} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={d.also.includes(e)}
                      onChange={(ev) => set({ also: ev.target.checked ? [...d.also, e] : d.also.filter((x) => x !== e) })}
                    />
                    <span>
                      {stepName[e]}
                      <span className="hint block">{effectHint[e]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {tried && tagsAlone && (
                <p role="alert" className="waitlist-error">
                  {nobody
                    ? "A stop does nothing alone. Tick follow back or a mail to your team."
                    : d.also.length === 0
                    ? `A tag needs something sent with it. Write ${t.publicReply ? "a DM text or a public reply" : "a DM text"}, or remove the tags.`
                    : `A tag or a stop needs something done with it. Write ${t.publicReply ? "a DM text or a public reply" : "a DM text"}, tick a mail or a moderation action, or remove them.`}
                </p>
              )}
            </>
          )}
        </fieldset>

        <fieldset className="card grid gap-3 p-5">
          <legend className={cardTitle}>Limits</legend>
          <div role="status">{cost && <p className="rounded-xl bg-canvas p-3 text-sm">{costText(cost)}</p>}</div>
          {cost && (
            <p className="hint">
              X bills every post, user and message it returns or takes. Each X account has a monthly budget, and the automation stops when it is used up. X counts a link as 23 characters and some characters as 2: a reply holds 280 (up to 300 on a paid X
              plan, the most any automation text takes), a DM 1000.
            </p>
          )}
          <p className="hint">Both are optional. A run held back by a limit is kept in the run history with its reason.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="automation-cooldown" className="font-medium">
                Wait before answering the same person again (minutes)
              </label>
              <input id="automation-cooldown" className="field" inputMode="numeric" placeholder="No wait" value={d.cooldown} onChange={(e) => set({ cooldown: e.target.value })} aria-invalid={tried && Number.isNaN(limitOf(d.cooldown, MAX_COOLDOWN))} aria-describedby="automation-cooldown-hint" />
              <p id="automation-cooldown-hint" className={tried && Number.isNaN(limitOf(d.cooldown, MAX_COOLDOWN)) ? "waitlist-error" : "hint"} role={tried && Number.isNaN(limitOf(d.cooldown, MAX_COOLDOWN)) ? "alert" : undefined}>
                1 to 10080 (7 days), a whole number. 60 means one answer an hour for each person.
              </p>
            </div>
            <div className="grid gap-1">
              <label htmlFor="automation-daily-cap" className="font-medium">
                Most runs a day
              </label>
              <input id="automation-daily-cap" className="field" inputMode="numeric" placeholder="Team limit only" value={d.dailyCap} onChange={(e) => set({ dailyCap: e.target.value })} aria-invalid={tried && Number.isNaN(limitOf(d.dailyCap, MAX_DAILY_CAP))} aria-describedby="automation-daily-cap-hint" />
              <p id="automation-daily-cap-hint" className={tried && Number.isNaN(limitOf(d.dailyCap, MAX_DAILY_CAP)) ? "waitlist-error" : "hint"} role={tried && Number.isNaN(limitOf(d.dailyCap, MAX_DAILY_CAP)) ? "alert" : undefined}>
                1 to 500, a whole number. The whole team already stops at 500 a day.
              </p>
            </div>
          </div>
        </fieldset>

        <AutomationTest
          input={testable ? automationInput(d, scopeBody(scope), uris as string[]) : null}
          stuck={
            testable
              ? (issues.find((i) => i.field !== "automation-name")?.text ?? (tagsAlone ? (d.also.length === 0 ? "A tag needs something sent with it." : "A tag or a stop needs something done with it: a DM, a reply, a mail or a moderation action.") : null))
              : "A post link is not a post of a connected Bluesky account."
          }
          accounts={accounts.filter((x) => AUTOMATED.includes(x.provider))}
          scopeIds={scope.mode === "accounts" ? scope.accountIds : []}
          placeholder={d.keywords[0] ? `Can I get the ${d.keywords[0]}?` : (sam.text ?? "Hello")}
          needsText={sam.text !== null}
        />

        <div id="automation-bar" className="sticky bottom-3 z-10 grid gap-2 rounded-lg bg-paper/95 p-3 shadow-[0_0_0_1px_var(--line),0_-6px_20px_rgb(0_0_0/0.07)] backdrop-blur sm:px-4">
          <Status problem={problem} done={done} overrides={automationMessages} />
          {stopping && (
            <div role="alertdialog" aria-labelledby="automation-stop-q" className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-3">
              <p id="automation-stop-q" className="basis-full text-sm font-bold">
                {waiting === 1 ? "1 person is" : `${waiting} people are`} waiting in this flow. Saving new steps stops those runs.
              </p>
              <button id="automation-stop-yes" type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => save(true)}>
                Save and stop them
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setStopping(false)}>
                Keep editing
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <strong className="min-w-0 flex-1 basis-28 truncate" title={d.name}>
              {d.name.trim() || "Untitled automation"}
            </strong>
            {issues.length > 0 && (
              <button
                type="button"
                className="btn btn-quiet btn-sm text-signal-deep"
                title={issues[0]!.text}
                onClick={() => {
                  flushSync(() => setTried(true));
                  const el = document.getElementById(issues[0]!.field);
                  el?.scrollIntoView({ block: "center" });
                  el?.focus({ preventScroll: true });
                }}
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                {issues.length} {issues.length === 1 ? "problem" : "problems"}
              </button>
            )}
            <span className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={d.active}
                aria-label="On"
                title={d.active ? "On: it acts as soon as it is saved" : "Off: saved, but it does nothing yet"}
                onClick={() => set({ active: !d.active })}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${d.active ? "bg-ink" : "bg-ink/20"}`}
              >
                <span aria-hidden="true" className={`absolute top-1 left-1 size-4 rounded-full bg-paper transition-transform motion-reduce:transition-none ${d.active ? "translate-x-4 bg-signal" : ""}`} />
              </button>
              <span aria-hidden="true" className="w-6 text-sm font-bold">
                {d.active ? "On" : "Off"}
              </span>
            </span>
            <span className="flex gap-2">
              {onCancel && (
                <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={() => (!dirty || window.confirm(leaveQuestion)) && onCancel()}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy !== null || !ready}>
                {busy ? "Saving..." : a ? "Save automation" : "Create automation"}
              </button>
            </span>
          </div>
        </div>
      </form>

      <section aria-labelledby="automation-preview-heading" className="grid gap-3 lg:sticky lg:top-10">
        <h2 id="automation-preview-heading" className="font-display text-lg font-extrabold tracking-tight">
          Preview
        </h2>
        <div className="card grid gap-3 p-4">
          <p className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-ink/10 font-bold">
              S
            </span>
            <span>
              <strong>Sam</strong> {sam.did}
            </span>
          </p>
          {sam.text && <p className="justify-self-start whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-canvas px-3.5 py-2.5 text-[0.95rem] leading-snug">{d.keywords[0] ? `Can I get the ${d.keywords[0]}?` : sam.text}</p>}
          {d.flow ? (
            <div className="grid gap-3 border-t border-ink/10 pt-3">
              <FlowPreview steps={d.steps} />
            </div>
          ) : (
            <>
              {hasDm && (
                <div className="grid justify-items-end gap-1 border-t border-ink/10 pt-3">
                  <span className="text-xs font-bold text-ink-soft">DM to Sam</span>
                  <p className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[#1185FE] px-3.5 py-2.5 text-[0.95rem] leading-snug text-white">{sample(d.dm)}</p>
                </div>
              )}
              {t.publicReply && d.publicReply.trim() && (
                <div className="grid justify-items-end gap-1 border-t border-ink/10 pt-3">
                  <span className="text-xs font-bold text-ink-soft">Public reply</span>
                  <p className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[0.95rem] leading-snug text-paper">{sample(d.publicReply)}</p>
                </div>
              )}
              {t.publicReply && hasDm && d.fallbackOn && d.fallback.trim() && (
                <p className="border-t border-ink/10 pt-3 text-sm text-ink-soft">
                  If the DM can&apos;t go, replies publicly: <span className="text-ink">{sample(d.fallback)}</span>
                </p>
              )}
              {d.tags.length > 0 && <TagLine tags={d.tags} />}
              {!hasDm && !(t.publicReply && d.publicReply.trim()) && <p className="text-sm text-ink-soft">Your reply shows here as you write, for someone called Sam.</p>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
