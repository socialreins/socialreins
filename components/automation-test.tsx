"use client";

import { useState } from "react";
import type { Failure } from "@/lib/auth";
import {
  actionName,
  blockText,
  mismatchText,
  plannedStatus,
  reason,
  testAutomation,
  waitText,
  type AutomationInput,
  type PlannedStep,
  type TestOutcome,
} from "@/lib/automations";
import type { Connection } from "@/lib/connections";
import { Status, useAction } from "@/components/team-ui";

const messages: Partial<Record<Failure, string>> = {
  rate_limited: "You used today's tests (100, and each AI step counts as one more). Try again tomorrow.",
  invalid_sample: "Write a sample of up to 2000 characters, and pick one of your Bluesky, Facebook, Instagram or X accounts.",
};

// How old the comment or the person's last message is, for Facebook and Instagram's windows.
const AGES = [
  { minutes: 0, label: "Just now" },
  { minutes: 23 * 60, label: "23 hours ago" },
  { minutes: 30 * 60, label: "30 hours ago (past the 24 hour window)" },
  { minutes: 6 * 24 * 60, label: "6 days ago" },
  { minutes: 8 * 24 * 60, label: "8 days ago (past the 7 days a comment allows)" },
];
const noteText: Record<string, string> = {
  human_agent_by_hand: "Meta's 24 hours are over, but a person could still answer this by hand for up to 7 days (the HUMAN_AGENT tag). An automation never uses it.",
  human_agent_off: "Meta's 24 hours are over, and this app does not hold Meta's Human Agent feature yet, so not even a person could answer it by hand.",
};

const stepName = (s: PlannedStep) => (s.type === "wait" ? "Wait" : s.type === "wait_for_reply" ? "Wait for their reply" : actionName[s.type]);

function StepResult({ step: s }: { step: PlannedStep }) {
  const bad = s.status === "would_skip" || s.status === "would_fail";
  return (
    <li className="grid gap-1.5 rounded-xl bg-canvas p-3">
      <p className="text-sm font-bold">
        {stepName(s)}: <span className={bad ? "text-signal-deep" : ""}>{plannedStatus[s.status]}</span>
        {s.status === "would_wait" && s.wait_minutes ? ` ${waitText(s.wait_minutes)}` : ""}
        {s.tag ? ` "${s.tag}"` : ""}
      </p>
      {s.text && <p className="whitespace-pre-wrap break-words rounded-2xl bg-paper px-3.5 py-2.5 text-[0.95rem] leading-snug">{s.text}</p>}
      {s.buttons && s.buttons.length > 0 && <p className="text-sm text-ink-soft">Buttons: {s.buttons.map((b) => b.label).join(", ")}</p>}
      {s.model && <p className="text-xs text-ink-soft">Written by AI ({s.model}), the way a real reply would be.</p>}
      {s.reason && <p className="text-sm text-ink-soft">{reason(s.reason)}</p>}
    </li>
  );
}

// Tries the automation as it stands in the form, even unsaved, on a sample from a stranger. Nothing is sent or stored.
export function AutomationTest({
  input,
  stuck,
  accounts,
  scopeIds,
  placeholder,
  needsText,
}: {
  // The automation as brain takes it; null while a post link can't be read.
  input: AutomationInput | null;
  // What the form still needs before it can be tried (its name is not needed), else null.
  stuck: string | null;
  // Accounts that can run an automation.
  accounts: Connection[];
  // The ones the automation is limited to, which come first.
  scopeIds: string[];
  // What the trigger's sample says when none is typed.
  placeholder: string;
  // The trigger reads the text (a new follower and a button tap do not).
  needsText: boolean;
}) {
  const first = accounts.find((a) => scopeIds.includes(a.id)) ?? accounts[0];
  const [pick, setPick] = useState("");
  const [text, setText] = useState("");
  const [name, setName] = useState("Sam");
  // Bluesky: Sam does not follow the account or has DMs closed, so a DM is refused.
  const [closed, setClosed] = useState(false);
  // Facebook and Instagram: how old it is, and whether the comment already got its one private reply.
  const [age, setAge] = useState(0);
  const [replied, setReplied] = useState(false);
  const [result, setResult] = useState<{ outcome: TestOutcome; of: string } | null>(null);
  const { busy, problem, run } = useAction();
  const account = accounts.find((a) => a.id === pick) ?? first;
  const sample = text.trim() || placeholder;
  // What changes the answer: not the name or the on switch.
  const meta = account?.provider === "facebook" || account?.provider === "instagram";
  const now = JSON.stringify([input && { ...input, name: "", active: true }, account?.id, sample, name, closed, meta && age, meta && replied]);
  const can = Boolean(input && account && !stuck);

  async function test() {
    if (!input || !account || !can) return;
    setResult(null);
    const body = {
      account_id: account.id,
      text: sample,
      author_name: name.trim() || undefined,
      post_remote_id: input.conditions.post_remote_ids?.[0],
      button_payload: input.conditions.payloads?.[0],
      author_can_dm: account.provider === "bluesky" && closed ? false : undefined,
      age_minutes: meta && age > 0 ? age : undefined,
      private_reply_sent: meta && replied ? true : undefined,
    };
    // A name is only needed to save, not to try.
    await run("test", () => testAutomation({ ...input, name: input.name.trim() || "Test" }, body), (outcome) => {
      setResult({ outcome, of: now });
    });
  }

  const out = result?.outcome;
  const why = out ? [...out.mismatches.map((m) => mismatchText[m] ?? m), ...out.blocks.map((b) => blockText[b] ?? reason(b) ?? b)] : [];
  const runs = Boolean(out?.matched) && !out?.blocks.includes("no_public_page");
  return (
    <fieldset id="automation-test" className="card grid gap-4 p-5">
      <legend className="px-1 font-display text-lg font-extrabold tracking-tight">Test this automation</legend>
      <p className="hint">
        Type a comment or message from someone who is not on your team. It is checked against the automation above, even before you save it, and shows what it would do. Nothing is sent and nothing is stored. An AI
        step is written for real and counts toward your AI replies.
      </p>
      {account ? (
        // Enter in any field tries it: it must not save the form.
        <div
          className="grid gap-3 sm:grid-cols-2"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing || !(e.target instanceof HTMLInputElement)) return;
            e.preventDefault();
            if (busy === null) void test();
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor="automation-test-account" className="label">
              As account
            </label>
            <select id="automation-test-account" className="field" value={account.id} onChange={(e) => setPick(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.handle ?? a.display_name ?? a.provider} ({a.provider})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="automation-test-name" className="label">
              From
            </label>
            <input id="automation-test-name" className="field" maxLength={64} placeholder="Sam" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {account.provider === "bluesky" && (
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" className="shrink-0 accent-[var(--color-signal-deep)]" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
              They can&apos;t take our DM (no follow, or DMs closed)
            </label>
          )}
          {meta && (
            <>
              <div className="grid gap-1.5">
                <label htmlFor="automation-test-age" className="label">
                  How old is it
                </label>
                <select id="automation-test-age" className="field" value={age} onChange={(e) => setAge(Number(e.target.value))}>
                  {AGES.map((a) => (
                    <option key={a.minutes} value={a.minutes}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              {input?.trigger === "comment_received" && (
                <label className="flex items-center gap-2 self-end">
                  <input type="checkbox" className="shrink-0 accent-[var(--color-signal-deep)]" checked={replied} onChange={(e) => setReplied(e.target.checked)} />
                  It already got its private reply
                </label>
              )}
            </>
          )}
          {needsText && (
            <div className="grid gap-1.5 sm:col-span-2">
              <label htmlFor="automation-test-text" className="label">
                Their comment or message
              </label>
              <input id="automation-test-text" className="field" maxLength={2000} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm">Connect a Bluesky, Facebook, Instagram or X account to test with.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-quiet" disabled={busy !== null || !can} onClick={() => void test()}>
          {busy ? "Testing..." : "Test"}
        </button>
        {account && stuck && <span className="hint">Fix this first: {stuck}</span>}
      </div>
      <Status problem={problem} done={null} overrides={messages} />
      <div aria-live="polite" className="grid gap-3">
        {out && result && (
          <>
            {result.of !== now && <p className="hint">The automation or the sample changed since this test. Test again.</p>}
            <p className="font-bold">
              {runs ? "It would run." : "It would not run."}
              {why.length > 0 && <span className="block font-normal">{why.join(". ")}.</span>}
            </p>
            {out.sentiment && <p className="text-sm text-ink-soft">The AI read the text as {out.sentiment}.</p>}
            {(out.notes ?? []).map((n) => (
              <p key={n} className="text-sm text-ink-soft">
                {noteText[n] ?? n}
              </p>
            ))}
            {out.steps.length > 0 && (
              <ol className="grid gap-2" aria-label="What it would do">
                {out.steps.map((s, i) => (
                  <StepResult key={i} step={s} />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </fieldset>
  );
}
