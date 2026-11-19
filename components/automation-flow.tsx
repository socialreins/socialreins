"use client";

import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  MAX_BUTTONS,
  MAX_LABEL,
  MAX_STEPS,
  WAIT_UNITS,
  newStep,
  numbered,
  payloadOk,
  sample,
  slug,
  stepName,
  templateLength,
  triggers,
  uniquePayload,
  waitMinutes,
  waitText,
  type ButtonDraft,
  type FlowProblem,
  type Step,
  type StepDraft,
  type Trigger,
  type WaitUnit,
} from "@/lib/automations";
import { MAX_DM, MAX_PUBLIC } from "@/lib/inbox";
import { TeamLink as Link } from "@/components/team-link";
import { Icon } from "@/components/ui";

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
        <span className="flex items-center gap-1.5 text-sm text-ink-soft">
          Insert
          {tokens.map((t) => (
            <button key={t} type="button" className="badge tone font-mono text-ink hover:bg-ink/10" aria-controls={id} aria-describedby={`${id}-label`} onClick={() => insert(t)}>
              {t}
            </button>
          ))}
        </span>
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

// A flow's steps in order: add, remove, move up and down, and each step's own fields.
export function FlowEditor({
  steps,
  onChange,
  trigger,
  problems,
  followUp,
}: {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  trigger: Trigger;
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
    flushSync(() => onChange(next));
    setSaid(`${stepName[s!.type]} moved to step ${i + by + 1} of ${next.length}.`);
    // At the top or the bottom the button just pressed is disabled, so the other one takes the focus.
    const edge = i + by === (by < 0 ? 0 : next.length - 1);
    document.getElementById(`step-${s!.id}-${by < 0 !== edge ? "up" : "down"}`)?.focus();
  }
  function add(type: Step["type"]) {
    const s = newStep(type);
    flushSync(() => onChange([...steps, s]));
    setSaid(`${stepName[type]} added as step ${steps.length + 1}.`);
    document.getElementById(`step-${s.id}-field`)?.focus();
  }
  function remove(i: number) {
    flushSync(() => onChange(steps.filter((_, at) => at !== i)));
    setSaid(`Step ${i + 1} removed.`);
    document.getElementById("automation-flow-add")?.focus();
  }

  const whole = problems.filter((p) => p.step === null);
  return (
    <div id="automation-flow" className="grid gap-4">
      <ol aria-label="Steps" className="grid gap-3">
        {steps.map((s, i) => {
          const mine = problems.filter((p) => p.step === i);
          const field = `step-${s.id}-field`;
          return (
            <li key={s.id} aria-label={`Step ${i + 1}: ${stepName[s.type]}`} className="grid gap-3 rounded-xl border border-ink/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="flex items-center gap-2">
                  <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-ink text-xs text-paper">
                    {i + 1}
                  </span>
                  {stepName[s.type]}
                </strong>
                <span className="flex gap-1">
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
              </div>

              {s.type === "wait" ? (
                <div className="grid gap-1.5">
                  <label htmlFor={field} className="label">
                    Wait for
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={field}
                      inputMode="numeric"
                      className="field w-24"
                      value={s.amount}
                      onChange={(e) => patch(i, { amount: e.target.value })}
                      aria-describedby={`${field}-hint`}
                      aria-invalid={waitMinutes(s.amount, s.unit) === null || undefined}
                    />
                    <select className="field w-auto" aria-label="Unit" value={s.unit} onChange={(e) => patch(i, { unit: e.target.value as WaitUnit })}>
                      {WAIT_UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <p id={`${field}-hint`} className="hint">
                    1 minute to 7 days. The next step goes out when the time is up.
                  </p>
                </div>
              ) : (
                <TextField
                  id={field}
                  label={s.type === "send_dm" ? "DM text" : "Public reply"}
                  value={s.text}
                  onChange={(text) => patch(i, { text })}
                  max={s.type === "send_dm" ? MAX_DM : MAX_PUBLIC}
                  tokens={tokens}
                  placeholder={s.type === "send_dm" ? "Hi {name}, here is the link you asked for: ..." : "Sent you a DM, {name}!"}
                  length={templateLength(numbered(s.text, s.type === "send_dm" ? s.buttons : []))}
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
                            maxLength={MAX_LABEL}
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

              {mine.length > 0 && (
                <ul role="alert" className="waitlist-error grid gap-0.5">
                  {mine.map((p) => (
                    <li key={p.text}>{p.text}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      <div role="group" aria-labelledby="automation-flow-add-label" className="flex flex-wrap items-center gap-2">
        <span id="automation-flow-add-label" className="label">
          Add step
        </span>
        {(["send_dm", ...(t.publicReply ? (["reply_publicly"] as const) : []), "wait"] as const).map((type, at) => (
          <button key={type} id={at === 0 ? "automation-flow-add" : undefined} type="button" className="btn btn-secondary btn-sm" disabled={full} onClick={() => add(type)}>
            <Icon name="plus" className="size-4" />
            {stepName[type]}
          </button>
        ))}
        <span className="hint">
          {steps.length} of {MAX_STEPS} steps
        </span>
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

      <ul aria-label="Good to know" className="hint grid list-disc gap-1 pl-5">
        <li>A step that can&apos;t be sent ends the flow there. Changing the steps or switching the automation off stops the runs that are waiting.</li>
        {trigger === "comment_received" && <li>On Facebook and Instagram a flow started by a comment can send only one DM: Meta allows one private reply per comment.</li>}
        {trigger !== "new_follower" && <li>On Facebook and Instagram a DM more than 24 hours after the person&apos;s last message is refused, so keep waits short there.</li>}
        {trigger !== "button_clicked" && trigger !== "story_reply" && (
          <li>On Bluesky buttons are shown as numbered lines under the text, and the answer is matched with a &quot;DM keyword&quot; automation.</li>
        )}
      </ul>
    </div>
  );
}

// The flow as a chat for someone called Sam: bubbles, buttons as chips and a divider at each wait.
export function FlowPreview({ steps }: { steps: StepDraft[] }) {
  const shown = steps.filter((s) => s.type === "wait" || s.text.trim());
  if (!shown.some((s) => s.type !== "wait")) return <p className="text-sm text-ink-soft">Your flow shows here as you write, for someone called Sam.</p>;
  return (
    <>
      {shown.map((s) => {
        if (s.type === "wait") {
          const minutes = waitMinutes(s.amount, s.unit);
          return (
            <p key={s.id} className="flex items-center gap-2 text-xs font-bold text-ink-soft before:h-px before:flex-1 before:bg-ink/15 after:h-px after:flex-1 after:bg-ink/15">
              <Icon name="clock" className="size-3.5" />
              Wait {minutes === null ? "..." : waitText(minutes)}
            </p>
          );
        }
        const buttons = s.type === "send_dm" ? s.buttons.filter((b) => b.label.trim()) : [];
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
