"use client";

import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  MAX_BUTTONS,
  MAX_LABEL,
  MAX_STEPS,
  MAX_PROMPT,
  WAIT_UNITS,
  isAi,
  EFFECTS,
  effectFits,
  isActivity,
  isEffect,
  isSend,
  isWait,
  newStep,
  numbered,
  payloadOk,
  sample,
  slug,
  stepName,
  replyLimit,
  templateLength,
  triggers,
  uniquePayload,
  waitMinutes,
  waitText,
  type ButtonDraft,
  type EffectType,
  type FlowProblem,
  type Step,
  type StepDraft,
  type Trigger,
  type WaitUnit,
} from "@/lib/automations";
import { cleanTag, MAX_TAG } from "@/lib/contacts";
import { MAX_DM } from "@/lib/inbox";
import { TeamLink as Link } from "@/components/team-link";
import { ActionMenu, menuItem } from "@/components/menu";
import { Icon, type IconName } from "@/components/ui";

// A text with its placeholder insert buttons and character count.
export function TextField({
  id,
  label,
  value,
  onChange,
  max,
  tokens,
  required,
  placeholder,
  hint,
  length = templateLength(value),
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  max: number;
  tokens: string[];
  required?: boolean;
  placeholder: string;
  hint?: string;
  // The length to count when it is more than the text's own: a DM's button labels go out with it.
  length?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const n = length;
  // At the cursor, with the space before it that {page} needs to become a link.
  const insert = (token: string) => {
    const el = ref.current;
    const before = value.slice(0, el?.selectionStart ?? value.length);
    onChange(`${before}${before && !/\s$/.test(before) ? " " : ""}${token}${value.slice(el?.selectionEnd ?? value.length)}`);
    el?.focus();
  };
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label id={`${id}-label`} htmlFor={id} className="label">
          {label}
        </label>
        {tokens.length > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-ink-soft">
            Insert
            {tokens.map((t) => (
              <button key={t} type="button" className="badge tone font-mono text-ink hover:bg-ink/10" aria-controls={id} aria-describedby={`${id}-label`} onClick={() => insert(t)}>
                {t}
              </button>
            ))}
          </span>
        )}
      </div>
      <textarea
        ref={ref}
        id={id}
        rows={3}
        required={required}
        className="field resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={`${id}-hint ${id}-count`}
        aria-invalid={n > max || undefined}
      />
      <p className="flex flex-wrap justify-between gap-2">
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
        <span id={`${id}-count`} className={`hint ml-auto ${n > max ? "font-bold text-signal-deep" : ""}`}>
          {n} of {max} characters
        </span>
      </p>
    </div>
  );
}

const iconButton = "btn btn-quiet btn-sm px-2";

// The timeline, shared by the editor and the read-only view: a line down the left with a node per step.
const rail = "relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 before:absolute before:top-0 before:bottom-0 before:left-4 before:w-px before:-translate-x-1/2 before:bg-ink/15";
const node = "relative grid size-8 place-items-center rounded-full bg-paper text-ink-soft shadow-[0_0_0_1px_var(--edge)]";
// A wait sits on the line itself.
const pill = "relative col-span-2 flex items-center gap-2 justify-self-start rounded-2xl bg-paper px-3 text-sm shadow-[0_0_0_1px_var(--edge)]";
export const stepIcon: Record<Step["type"], IconName> = {
  send_dm: "send",
  reply_publicly: "comment",
  ai_send_dm: "send",
  ai_reply_publicly: "comment",
  ai_draft_reply: "comment",
  wait: "clock",
  wait_for_reply: "clock",
  tag_contact: "tag",
  notify_team: "mention",
  assign: "user",
  hide_comment: "comment",
  like_comment: "check",
  repost_comment: "repeat",
  follow_back: "follower",
  stop_automations: "close",
};
// What a step that sends nothing does, in a line.
export const effectHint: Record<EffectType | "assign", string> = {
  notify_team: "Emails the owners and admins of the team the text and a link to the inbox, nothing else about the person. At most 20 notifications a day.",
  assign: "Assigns it to a teammate. Set through the API; the builder keeps it as it is.",
  hide_comment: "Hides the comment on Facebook, Instagram, Threads or X: only its author and your account see it. On Threads only a reply directly under your own post can be hidden. Good for spam: pair it with the link rule.",
  like_comment: "Likes the comment or mention: as your Page on Facebook, from the account on Bluesky. Nothing happens on other networks (Instagram has no like for a comment, Threads none for an app).",
  repost_comment: "Reposts the comment or mention from the account. Only Bluesky accounts can.",
  follow_back: "Follows the person from the account, unless it follows them already. Only Bluesky accounts can.",
  stop_automations: "Newer automations do not run on this item once this one has.",
};
// One line on who pays for an AI send, under its prompt.
export const AI_HINT = "The AI writes it from this prompt, their message and their name, with no links or @handles but yours. Your own AI key (Billing) has no limit; without one, your plan's 200 AI replies a month come first, then AI credits.";

// A step that was added or moved slides into place from where it was. Nothing moves for a reader who asks for no motion.
function settle(id: number, fromTop?: number) {
  const el = document.getElementById(`step-${id}`);
  if (!el || typeof el.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const from = fromTop === undefined ? { transform: "translateY(-8px)", opacity: 0 } : { transform: `translateY(${fromTop - el.getBoundingClientRect().top}px)`, opacity: 1 };
  el.animate([from, { transform: "none", opacity: 1 }], { duration: 200, easing: "ease-out" });
}

// A saved automation as the same timeline, read-only: the trigger, then each step, a wait as a pill on the line.
// `fallback` is One reply's public reply for a DM that can't go, shown under the DM.
export function FlowTimeline({ icon, trigger, steps, fallback }: { icon: IconName; trigger: string; steps: Step[]; fallback?: string | null }) {
  return (
    <div>
      <p className={`${rail} items-center pb-4`}>
        <span className={`${node} text-signal-deep`}>
          <Icon name={icon} className="size-4" />
        </span>
        <strong>{trigger}</strong>
      </p>
      <ol aria-label="Steps">
        {steps.map((s, i) => (
          <li key={i} className={`${rail} ${i === steps.length - 1 ? "before:hidden" : "pb-4"}`}>
            {s.type === "wait" || s.type === "wait_for_reply" ? (
              <span className={`${pill} py-1 font-bold`}>
                <Icon name="clock" className="size-4 text-ink-soft" />
                {s.type === "wait" ? "Wait" : "Wait for their reply, up to"} {waitText(s.minutes)}
              </span>
            ) : (
              <>
                <span className={node}>
                  <Icon name={stepIcon[s.type]} className="size-4" />
                </span>
                <div className="grid min-w-0 gap-1 pt-1">
                  <strong className="text-sm">{stepName[s.type]}</strong>
                  <span className="whitespace-pre-wrap break-words">
                    {s.type === "tag_contact" ? s.tag : "prompt" in s ? `Prompt: ${s.prompt}` : "text" in s ? s.text : effectHint[s.type]}
                  </span>
                  {s.type === "send_dm" && s.buttons && s.buttons.length > 0 && (
                    <ul aria-label="Buttons" className="flex flex-wrap gap-1.5">
                      {s.buttons.map((b) => (
                        <li key={b.payload} className="badge tone text-ink">
                          {b.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.type === "send_dm" && fallback && (
                    <span className="text-sm text-ink-soft">
                      If the DM can&apos;t go, replies publicly: <span className="whitespace-pre-wrap break-words text-ink">{fallback}</span>
                    </span>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// A flow's steps in order: add, remove, move up and down, and each step's own fields.
export function FlowEditor({
  steps,
  onChange,
  trigger,
  providers = [],
  problems,
  followUp,
}: {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  trigger: Trigger;
  // The networks of the accounts the automation is limited to by name: Threads-only ones take 500 characters, counted by bytes.
  providers?: string[];
  // What to show of `flowProblems`: empty until a save was tried.
  problems: FlowProblem[];
  // The new-automation address for a button's follow-up.
  followUp: (payload: string) => string;
}) {
  const [said, setSaid] = useState("");
  const t = triggers[trigger];
  const tokens = t.publicReply ? ["{name}", "{page}"] : ["{name}"];
  const full = steps.length >= MAX_STEPS;
  const patch = (i: number, p: object) => onChange(steps.map((s, at) => (at === i ? ({ ...s, ...p } as StepDraft) : s)));
  const taken = (except?: ButtonDraft) => steps.flatMap((s) => (s.type === "send_dm" ? s.buttons : [])).filter((b) => b !== except).map((b) => b.payload);

  function move(i: number, by: -1 | 1) {
    const next = [...steps];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s!);
    const top = document.getElementById(`step-${s!.id}`)?.getBoundingClientRect().top;
    flushSync(() => onChange(next));
    settle(s!.id, top);
    setSaid(`${stepName[s!.type]} moved to step ${i + by + 1} of ${next.length}.`);
    // At the top or the bottom the button just pressed is disabled, so the other one takes the focus.
    const edge = i + by === (by < 0 ? 0 : next.length - 1);
    document.getElementById(`step-${s!.id}-${by < 0 !== edge ? "up" : "down"}`)?.focus();
  }
  // At the end, or before the step now at `at`.
  function add(type: StepDraft["type"], at = steps.length) {
    const s = newStep(type);
    flushSync(() => onChange([...steps.slice(0, at), s, ...steps.slice(at)]));
    settle(s.id);
    setSaid(`${stepName[type]} added as step ${at + 1}.`);
    document.getElementById(`step-${s.id}-field`)?.focus();
  }
  function remove(i: number) {
    flushSync(() => onChange(steps.filter((_, at) => at !== i)));
    setSaid(`Step ${i + 1} removed.`);
    document.getElementById("automation-flow-add")?.focus();
  }

  const effects = EFFECTS.filter((e) => effectFits(e, trigger));
  // A like or repost has nobody to message or tag, nobody to wait for: only what is done on the account or in the team.
  const types = isActivity(trigger)
    ? (["wait", ...effects] as const)
    : (["send_dm", ...(t.publicReply ? (["reply_publicly"] as const) : []), "ai_send_dm", ...(t.publicReply ? (["ai_reply_publicly"] as const) : []), "wait", "wait_for_reply", "tag_contact", "notify_team", ...effects.filter((e) => e !== "notify_team")] as const);
  const whole = problems.filter((p) => p.step === null);
  const inSteps = problems.filter((p) => p.step !== null && steps[p.step]);
  return (
    <div id="automation-flow" className="grid gap-4">
      <div>
        <ol aria-label="Steps">
          {steps.map((s, i) => {
            const mine = problems.filter((p) => p.step === i);
            const field = `step-${s.id}-field`;
            const controls = (
              <span className="flex gap-0.5">
                <button id={`step-${s.id}-up`} type="button" className={iconButton} disabled={i === 0} aria-label={`Move step ${i + 1} up`} title="Move up" onClick={() => move(i, -1)}>
                  <Icon name="down" className="size-4 rotate-180" />
                </button>
                <button id={`step-${s.id}-down`} type="button" className={iconButton} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`} title="Move down" onClick={() => move(i, 1)}>
                  <Icon name="down" className="size-4" />
                </button>
                <button type="button" className={`${iconButton} btn-danger`} aria-label={`Remove step ${i + 1}`} title="Remove" onClick={() => remove(i)}>
                  <Icon name="trash" className="size-4" />
                </button>
              </span>
            );
            return (
              <li key={s.id} id={`step-${s.id}`} aria-label={`Step ${i + 1}: ${stepName[s.type]}`} className={rail}>
                {isWait(s) ? (
                  <div className={`${pill} flex-wrap gap-1.5 py-1 pr-1 [&_.btn]:px-1.5`}>
                    <Icon name="clock" className="size-4 text-ink-soft" />
                    <span className="font-bold">{s.type === "wait" ? "Wait" : "Wait for their reply, up to"}</span>
                    <input
                      id={field}
                      inputMode="numeric"
                      className="field w-12 px-1 py-0.5 text-center"
                      aria-label={s.type === "wait" ? "Wait for" : "Wait for their reply up to"}
                      value={s.amount}
                      onChange={(e) => patch(i, { amount: e.target.value })}
                      aria-describedby={`${field}-hint`}
                      aria-invalid={waitMinutes(s.amount, s.unit) === null || undefined}
                    />
                    <select className="field w-auto px-2 py-0.5" aria-label="Unit" value={s.unit} onChange={(e) => patch(i, { unit: e.target.value as WaitUnit })}>
                      {WAIT_UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                    <span id={`${field}-hint`} className="sr-only">
                      {s.type === "wait"
                        ? "1 minute to 7 days. The next step goes out when the time is up."
                        : "1 minute to 7 days. The next step goes out as soon as they write back; if they do not, the flow ends."}
                    </span>
                    {controls}
                  </div>
                ) : (
                  <>
                    <span className={`${node} ${mine.length ? "text-signal-deep shadow-[0_0_0_1.5px_var(--color-signal-deep)]" : ""}`}>
                      <Icon name={stepIcon[s.type]} className="size-4" />
                    </span>
                    <div className={`grid min-w-0 gap-3 rounded-lg border p-3 sm:p-4 ${mine.length ? "border-signal-deep/60" : "border-ink/15"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>
                          {stepName[s.type]} <span className="font-normal text-ink-soft">Step {i + 1}</span>
                        </strong>
                        {controls}
                      </div>

                      {isEffect(s) ? (
                        <p className="hint">{effectHint[s.type]}</p>
                      ) : s.type === "tag_contact" ? (
                        <div className="grid gap-1.5">
                          <label htmlFor={field} className="label">
                            Tag
                          </label>
                          <input id={field} className="field" maxLength={MAX_TAG} placeholder="vip" value={s.tag} onChange={(e) => patch(i, { tag: e.target.value })} aria-describedby={`${field}-hint`} />
                          <p id={`${field}-hint`} className="hint">
                            Put on the contact when the flow gets here. Saved in lower case. It sends nothing.
                          </p>
                        </div>
                      ) : isAi(s.type) ? (
                        <TextField
                          id={field}
                          label="Prompt for the AI"
                          value={s.text}
                          onChange={(text) => patch(i, { text })}
                          max={MAX_PROMPT}
                          tokens={[]}
                          placeholder="Thank them for the comment and point them to our guide at https://..."
                          length={[...s.text].length}
                          hint={AI_HINT}
                        />
                      ) : (
                        <TextField
                          id={field}
                          label={s.type === "send_dm" ? "DM text" : "Public reply"}
                          value={s.text}
                          onChange={(text) => patch(i, { text })}
                          max={s.type === "send_dm" ? MAX_DM : replyLimit(providers).max}
                          tokens={tokens}
                          placeholder={s.type === "send_dm" ? "Hi {name}, here is the link you asked for: ..." : "Sent you a DM, {name}!"}
                          length={s.type === "send_dm" ? templateLength(numbered(s.text, s.buttons)) : replyLimit(providers).size(s.text)}
                          hint={s.type === "send_dm" && s.buttons.length ? "The button labels count too." : undefined}
                        />
                      )}

                      {s.type === "send_dm" && (
                        <fieldset className="grid gap-3">
                          <legend className="label mb-1">
                            Buttons <span className="font-normal text-ink-soft">(optional, up to {MAX_BUTTONS})</span>
                          </legend>
                          {s.buttons.map((b, j) => {
                            const set = (next: ButtonDraft) => patch(i, { buttons: s.buttons.map((x, at) => (at === j ? next : x)) });
                            return (
                              <div key={j} className="grid gap-1.5 rounded-xl bg-canvas p-3">
                                <div className="flex gap-2">
                                  <input
                                    id={`step-${s.id}-button-${j}`}
                                    className="field min-w-0 flex-1"
                                    aria-label={`Button ${j + 1} label`}
                                    placeholder="Yes, send it"
                                    value={b.label}
                                    onChange={(e) => set({ ...b, label: e.target.value, payload: b.own ? b.payload : uniquePayload(slug(e.target.value) || "button", taken(b)) })}
                                  />
                                  <button type="button" className={iconButton} aria-label={`Remove button ${j + 1}`} title="Remove" onClick={() => patch(i, { buttons: s.buttons.filter((_, at) => at !== j) })}>
                                    <Icon name="close" className="size-4" />
                                  </button>
                                </div>
                                <details>
                                  <summary className="cursor-pointer text-sm font-bold text-ink-soft">Advanced</summary>
                                  <div className="mt-2 grid gap-1.5">
                                    <label htmlFor={`step-${s.id}-payload-${j}`} className="label">
                                      Payload
                                    </label>
                                    <input
                                      id={`step-${s.id}-payload-${j}`}
                                      className="field font-mono"
                                      maxLength={64}
                                      value={b.payload}
                                      onChange={(e) => set({ ...b, payload: e.target.value, own: true })}
                                      aria-invalid={!payloadOk(b.payload) || undefined}
                                      aria-describedby={`step-${s.id}-payload-${j}-hint`}
                                    />
                                    <p id={`step-${s.id}-payload-${j}-hint`} className="hint">
                                      What a tap on this button sends, made from the label: lower-case letters, digits, - and _, its own within the flow. A follow-up automation listens for it.
                                    </p>
                                  </div>
                                </details>
                                {payloadOk(b.payload) && b.label.trim() && (
                                  <Link href={followUp(b.payload)} target="_blank" className="justify-self-start text-sm font-bold underline decoration-signal decoration-2 underline-offset-4">
                                    When clicked: create a follow-up automation
                                    <span className="sr-only">
                                      {" "}
                                      for {b.label.trim()} (opens in a new tab)
                                    </span>
                                  </Link>
                                )}
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm justify-self-start"
                            disabled={s.buttons.length >= MAX_BUTTONS}
                            onClick={() => {
                              flushSync(() => patch(i, { buttons: [...s.buttons, { label: "", payload: uniquePayload("button", taken()), own: false }] }));
                              document.getElementById(`step-${s.id}-button-${s.buttons.length}`)?.focus();
                            }}
                          >
                            <Icon name="plus" className="size-4" />
                            Add a button
                          </button>
                        </fieldset>
                      )}
                    </div>
                  </>
                )}

                {mine.length > 0 && (
                  <ul role="alert" className={`waitlist-error relative mt-1.5 grid gap-0.5 bg-paper ${isWait(s) ? "col-span-2 justify-self-start py-0.5" : "col-start-2"}`}>
                    {mine.map((p) => (
                      <li key={p.text}>{p.text}</li>
                    ))}
                  </ul>
                )}

                {/* The gap to the next step, with a way to put a step into it. */}
                <div className="col-span-2 flex h-9 items-center pl-1.5">
                  {i < steps.length - 1 && !full && (
                    <ActionMenu
                      label={`Insert a step after step ${i + 1}`}
                      side="left"
                      className="relative grid size-5 place-items-center rounded-full bg-paper text-ink-soft shadow-[0_0_0_1px_var(--edge)] hover:text-ink hover:shadow-[0_0_0_1px_var(--color-ink)]"
                      trigger={<Icon name="plus" className="size-3" />}
                    >
                      {types.map((type) => (
                        <button key={type} type="button" className={menuItem} onClick={() => add(type, i + 1)}>
                          <Icon name={stepIcon[type]} className="size-4 text-ink-soft" />
                          {stepName[type]}
                        </button>
                      ))}
                    </ActionMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div role="group" aria-labelledby="automation-flow-add-label" className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3">
          <span className={`${node} border border-dashed border-ink/30 shadow-none`}>
            <Icon name="plus" className="size-4" />
          </span>
          <div className="flex min-h-8 flex-wrap items-center gap-2">
            <span id="automation-flow-add-label" className="label">
              Add step
            </span>
            {types.map((type, at) => (
              <button key={type} id={at === 0 ? "automation-flow-add" : undefined} type="button" className="btn btn-secondary btn-sm" disabled={full} onClick={() => add(type)}>
                <Icon name={stepIcon[type]} className="size-4" />
                {stepName[type]}
              </button>
            ))}
            <span className="hint">
              {steps.length} of {MAX_STEPS} steps
            </span>
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
      {whole.length > 0 && (
        <ul role="alert" className="waitlist-error grid gap-0.5">
          {whole.map((p) => (
            <li key={p.text}>{p.text}</li>
          ))}
        </ul>
      )}
      {inSteps.length > 0 && (
        <ul aria-label="Problems in the steps" className="waitlist-error grid gap-0.5">
          {inSteps.map((p) => (
            <li key={`${p.step} ${p.text}`}>
              <button type="button" className="text-left font-bold underline underline-offset-2" onClick={() => document.getElementById(`step-${steps[p.step!]!.id}-field`)?.focus()}>
                Step {p.step! + 1}: {p.text}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul aria-label="Good to know" className="hint grid list-disc gap-1 pl-5">
        <li>A step that can&apos;t be sent ends the flow there. Changing the steps or switching the automation off stops the runs that are waiting.</li>
        {trigger === "comment_received" && (
          <li>On Facebook and Instagram a flow started by a comment sends only one DM, the private reply Meta allows per comment, until the person writes back: put a &quot;Wait for their reply&quot; after it to send more.</li>
        )}
        {trigger !== "new_follower" && <li>On Facebook and Instagram a DM more than 24 hours after the person&apos;s last message is refused, so keep waits short there.</li>}
        {trigger !== "button_clicked" && trigger !== "story_reply" && (
          <li>On Bluesky buttons are shown as numbered lines under the text, and the answer is matched with a &quot;DM keyword&quot; automation.</li>
        )}
      </ul>
    </div>
  );
}

// The preview's system line for a tag: nothing Sam sees.
export const TagLine = ({ tags }: { tags: string[] }) => <p className="text-center text-xs font-bold text-ink-soft">Sam gets the tag {tags.join(", ")}</p>;

// The flow as a chat for someone called Sam: bubbles, buttons as chips and a divider at each wait.
export function FlowPreview({ steps }: { steps: StepDraft[] }) {
  const shown = steps.filter((s) => isWait(s) || isEffect(s) || (s.type === "tag_contact" ? cleanTag(s.tag) : s.text.trim()));
  if (!shown.some(isSend)) return <p className="text-sm text-ink-soft">Your flow shows here as you write, for someone called Sam.</p>;
  return (
    <>
      {shown.map((s) => {
        if (isWait(s)) {
          const minutes = waitMinutes(s.amount, s.unit);
          return (
            <p key={s.id} className="flex items-center gap-2 text-xs font-bold text-ink-soft before:h-px before:flex-1 before:bg-ink/15 after:h-px after:flex-1 after:bg-ink/15">
              <Icon name="clock" className="size-3.5" />
              {s.type === "wait" ? "Wait" : "Sam replies, or after at most"} {minutes === null ? "..." : waitText(minutes)}
            </p>
          );
        }
        if (isEffect(s)) return <p key={s.id} className="text-center text-xs font-bold text-ink-soft">{stepName[s.type]}</p>;
        if (s.type === "tag_contact") return <TagLine key={s.id} tags={[cleanTag(s.tag)]} />;
        const buttons = s.type === "send_dm" ? s.buttons.filter((b) => b.label.trim()) : [];
        if (isAi(s.type))
          return (
            <div key={s.id} className="grid justify-items-end gap-1">
              <span className="text-xs font-bold text-ink-soft">{s.type === "ai_send_dm" ? "AI DM to Sam" : "AI public reply"}</span>
              <p className="rounded-2xl rounded-br-md border border-dashed border-ink/30 px-3.5 py-2.5 text-[0.95rem] leading-snug text-ink-soft">Written by AI from your prompt and Sam&apos;s message</p>
            </div>
          );
        return (
          <div key={s.id} className="grid justify-items-end gap-1">
            <span className="text-xs font-bold text-ink-soft">{s.type === "send_dm" ? "DM to Sam" : "Public reply"}</span>
            <p className={`whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3.5 py-2.5 text-[0.95rem] leading-snug ${s.type === "send_dm" ? "bg-[#1185FE] text-white" : "bg-ink text-paper"}`}>
              {sample(s.text)}
            </p>
            {buttons.length > 0 && (
              <ul aria-label="Buttons" className="flex flex-wrap justify-end gap-1.5">
                {buttons.map((b, j) => (
                  <li key={j} className="rounded-full border border-[#1185FE] px-3 py-1 text-sm font-bold text-[#1185FE]">
                    {b.label.trim()}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {steps.some((s) => s.type === "send_dm" && s.buttons.length > 0) && (
        <p className="border-t border-ink/10 pt-3 text-xs text-ink-soft">On Bluesky the buttons show as numbered lines under the text: &quot;1. Yes&quot;.</p>
      )}
    </>
  );
}
