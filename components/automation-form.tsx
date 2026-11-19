"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Failure } from "@/lib/auth";
import {
  automationInput,
  changeTrigger,
  createAutomation,
  draftOf,
  flowProblems,
  MAX_TAG_ACTIONS,
  postIds,
  sample,
  slug,
  toFlow,
  toSimple,
  TRIGGERS,
  triggers,
  updateAutomation,
  type Automation,
  type Draft,
  type ScopeBody,
  type Trigger,
} from "@/lib/automations";
import type { Connection } from "@/lib/connections";
import { cleanTag } from "@/lib/contacts";
import { MAX_DM, MAX_PUBLIC } from "@/lib/inbox";
import type { SocialSet } from "@/lib/sets";
import { FlowEditor, FlowPreview, TagLine, TextField } from "@/components/automation-flow";
import { KeywordsField, ScopeField, scopeBody, scopeOf } from "@/components/scope-fields";
import { Status, useAction } from "@/components/team-ui";
import { Icon, type IconName } from "@/components/ui";

export const automationMessages: Partial<Record<Failure, ReactNode>> = {
  invalid_conditions: "One of the accounts, the set or a post link is no longer valid, a keyword is too long, or a condition does not fit this trigger. Check them and try again.",
  invalid_actions: "Add a DM text or a public reply that this trigger can send.",
  invalid_text: "A text is too long or holds {page} where it can't go. DMs take 1000 characters and public replies 300, with {name} counted as 64 and {page} as 100. {page} works only for comments and mentions, and needs a space before it and a space or the end after it.",
  invalid_fallback: "The fallback reply does not work: it needs a DM text, at most 300 characters, with {name} counted as 64 and {page} as 100, and {page} needs a space before it and a space or the end after it.",
  invalid_steps: "A step does not work. A flow takes 1 to 10 steps, can't start or end with a wait (1 minute to 7 days), sends only what its trigger can send, and each DM takes up to 3 buttons with a label of 1 to 20 characters.",
  actions_and_steps: "An automation is one reply or a flow of steps, not both. Reload the page and try again.",
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
  button_clicked: "check",
};

// What Sam does in the preview, and what Sam writes when no keyword is set.
const incoming: Record<Trigger, { did: string; text: string | null }> = {
  comment_received: { did: "commented on your post", text: "Love this! Where can I get it?" },
  dm_received: { did: "sent you a DM", text: "Hi! Are you open on Sunday?" },
  mention_received: { did: "mentioned you", text: "Just tried this, so good!" },
  new_follower: { did: "followed you", text: null },
  story_reply: { did: "replied to your story", text: "Wow, where is this?" },
  button_clicked: { did: "tapped a button", text: null },
};

const cardTitle = "px-1 font-display text-lg font-extrabold tracking-tight";

// The builder over brain's trigger, conditions and actions: When, Only if, Do this, and a preview.
export function AutomationForm({
  automation: a,
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
  const [d, setD] = useState<Draft>(() => draftOf(a, template, payload));
  const [scope, setScope] = useState(scopeOf(a?.conditions ?? startScope ?? { account_ids: [] }));
  // A switch between One reply and A flow that would drop something, waiting for a yes.
  const [pending, setPending] = useState<{ patch: Partial<Draft>; dropped: string[] } | null>(null);
  // A save was tried, so the flow's and the payloads' problems show.
  const [tried, setTried] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);
  const [badLinks, setBadLinks] = useState<string[]>([]);
  const { busy, problem, done, run } = useAction();
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));

  const t = triggers[d.trigger];
  const tokens = t.publicReply ? ["{name}", "{page}"] : ["{name}"];
  const lines = d.posts.split("\n").map((l) => l.trim()).filter(Boolean);
  const hasDm = Boolean(d.dm.trim());
  // brain refuses tags with nothing sent beside them (422 invalid_actions).
  const tagsAlone = !d.flow && d.tags.length > 0 && !hasDm && !(t.publicReply && d.publicReply.trim());
  const sam = incoming[d.trigger];
  const problems = d.flow ? flowProblems(d.steps, d.trigger) : [];

  function onMode(flow: boolean) {
    if (flow === d.flow) return;
    const patch: Partial<Draft> = { flow, steps: [], tags: [] };
    let dropped: string[];
    if (flow) {
      const next = toFlow(d);
      Object.assign(patch, { steps: next.steps, fallbackOn: false, fallback: "" });
      dropped = next.dropped;
    } else {
      const next = toSimple(d.steps);
      Object.assign(patch, { dm: next.dm, publicReply: next.publicReply, tags: next.tags });
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const specific = t.posts && d.specific;
    const uris = specific ? postIds(lines, a?.conditions.post_remote_ids ?? [], accounts) : [];
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
      document.getElementById("automation-dm")?.focus();
      return;
    }
    if (problems.length) {
      flushSync(() => setTried(true));
      document.querySelector("#automation-flow [role=alert]")?.scrollIntoView({ block: "center" });
      return;
    }
    const input = automationInput(d, scopeBody(scope), uris as string[]);
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
          <ScopeField id="automation-scope" value={scope} onChange={setScope} accounts={accounts} sets={sets} />
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
                    One Bluesky post link per line, from a connected account. Posts already listed here stay as they are.
                  </p>
                  {badLinks.length > 0 && (
                    <p id="automation-posts-error" role="alert" className="waitlist-error">
                      {badLinks.length === 1 ? "This link isn't" : "These links aren't"} a post of a connected Bluesky account: {badLinks.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          )}
          {t.firstPerAuthor && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={d.firstPerAuthor} onChange={(e) => set({ firstPerAuthor: e.target.checked })} />
              First comment per person only
            </label>
          )}
          {t.firstMessage && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={d.firstMessage} onChange={(e) => set({ firstMessage: e.target.checked })} />
              Only their first message ever
            </label>
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
              problems={tried ? problems : []}
              followUp={followUp}
            />
          ) : (
            <>
              <TextField
                id="automation-dm"
                label={t.publicReply ? <>DM text <span className="font-normal text-ink-soft">(optional when it replies publicly)</span></> : "DM text"}
                value={d.dm}
                onChange={(dm) => set({ dm })}
                max={MAX_DM}
                tokens={tokens}
                // A comment or mention may get a public reply alone.
                // With tags the form says what is missing itself, in its own words.
                required={(!t.publicReply || !d.publicReply.trim()) && !d.tags.length}
                placeholder="Hi {name}, here is the link you asked for: ..."
                hint={
                  t.publicReply
                    ? "{name} is their display name, or \"there\" when it has links or symbols (counts as 64). {page} is the link to the post's public page (counts as 100): the automation then runs only under posts made here whose public page is open."
                    : "{name} is their display name, or \"there\" when it has links or symbols. It counts as 64 characters."
                }
              />
              {t.publicReply && (
                <>
                  <TextField
                    id="automation-public-reply"
                    label={<>Public reply <span className="font-normal text-ink-soft">(optional, goes every time)</span></>}
                    value={d.publicReply}
                    onChange={(publicReply) => set({ publicReply })}
                    max={MAX_PUBLIC}
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
                        max={MAX_PUBLIC}
                        tokens={tokens}
                        required
                        placeholder="I couldn't DM you, {name}. Follow us and comment again!"
                      />
                    )}
                  </div>
                </>
              )}
              <KeywordsField
                id="automation-tags"
                label="Tag the contact"
                hint="Optional, up to 3 tags put on the person's contact when this runs. Press Enter or a comma after each. Tags are saved in lower case."
                value={d.tags}
                onChange={(tags) => set({ tags })}
                clean={cleanTag}
                max={MAX_TAG_ACTIONS}
              />
              {tried && tagsAlone && (
                <p role="alert" className="waitlist-error">
                  A tag needs something sent with it. Write {t.publicReply ? "a DM text or a public reply" : "a DM text"}, or remove the tags.
                </p>
              )}
            </>
          )}
        </fieldset>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
          On: act from now on
        </label>
        <Status problem={problem} done={done} overrides={automationMessages} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy !== null || !ready}>
            {busy ? "Saving..." : a ? "Save automation" : "Create automation"}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={onCancel}>
              Cancel
            </button>
          )}
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
