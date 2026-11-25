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
  rate_limited: "You used all 100 tests for today. Try again tomorrow.",
  invalid_sample: "Write a sample of up to 2000 characters, and pick one of your Bluesky, Facebook or Instagram accounts.",
};

const stepName = (s: PlannedStep) => (s.type === "wait" ? "Wait" : actionName[s.type]);

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
  blocked,
  accounts,
  scopeIds,
  placeholder,
}: {
  // The automation as brain takes it; null while a post link can't be read.
  input: AutomationInput | null;
  // What the form still needs before it can be tried (not its name).
  blocked: number;
  // Accounts that can run an automation.
  accounts: Connection[];
  // The ones the automation is limited to, which come first.
  scopeIds: string[];
  // What the trigger's sample says when none is typed.
  placeholder: string;
}) {
  const first = accounts.find((a) => scopeIds.includes(a.id)) ?? accounts[0];
  const [pick, setPick] = useState("");
  const [text, setText] = useState("");
  const [name, setName] = useState("Sam");
  const [result, setResult] = useState<{ outcome: TestOutcome; of: string } | null>(null);
  const { busy, problem, run } = useAction();
  const account = accounts.find((a) => a.id === pick) ?? first;
  const sample = text.trim() || placeholder;
  const now = JSON.stringify([input, account?.id, sample, name]);

  async function test() {
    if (!input || !account) return;
    const body = {
      account_id: account.id,
      text: sample,
      author_name: name.trim() || undefined,
      post_remote_id: input.conditions.post_remote_ids?.[0],
      button_payload: input.conditions.payloads?.[0],
    };
    // A name is only needed to save, not to try.
    await run("test", () => testAutomation({ ...input, name: input.name.trim() || "Test" }, body), (outcome) => {
      setResult({ outcome, of: now });
    });
  }

  const out = result?.outcome;
  const why = out ? [...out.mismatches.map((m) => mismatchText[m] ?? m), ...out.blocks.map((b) => blockText[b] ?? reason(b) ?? b)] : [];
  return (
    <fieldset id="automation-test" className="card grid gap-4 p-5">
      <legend className="px-1 font-display text-lg font-extrabold tracking-tight">Test this automation</legend>
      <p className="hint">
        Type a comment or message from someone who is not on your team. brain checks it against the automation above, even before you save it, and shows what it would do. Nothing is sent and nothing is stored. An AI
        step is written for real and counts toward your AI replies.
      </p>
      {account ? (
        <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="grid gap-1.5 sm:col-span-2">
            <label htmlFor="automation-test-text" className="label">
              Their comment or message
            </label>
            <input
              id="automation-test-text"
              className="field"
              maxLength={2000}
              value={text}
              placeholder={placeholder}
              onChange={(e) => setText(e.target.value)}
              // Enter tries it: it must not save the form.
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (busy === null) void test();
              }}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm">Connect a Bluesky, Facebook or Instagram account to test with.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-quiet" disabled={busy !== null || !input || !account || blocked > 0} onClick={() => void test()}>
          {busy ? "Testing..." : "Test"}
        </button>
        {(blocked > 0 || !input) && <span className="hint">Fix the problems above first.</span>}
      </div>
      <Status problem={problem} done={null} overrides={messages} />
      {out && (
        <div aria-live="polite" className="grid gap-3">
          {result.of !== now && <p className="hint">The automation or the sample changed since this test. Test again.</p>}
          <p className="font-bold">
            {why.length ? "It would not run." : "It would run."}
            {why.length > 0 && <span className="block font-normal">{why.join(". ")}.</span>}
          </p>
          {out.steps.length > 0 && (
            <ol className="grid gap-2" aria-label="What it would do">
              {out.steps.map((s, i) => (
                <StepResult key={i} step={s} />
              ))}
            </ol>
          )}
        </div>
      )}
    </fieldset>
  );
}
