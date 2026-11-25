"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isFailure, problemText } from "@/components/team-ui";
import { connectUrl } from "@/lib/connections";
import type { Item } from "@/lib/inbox";
import { everyText, getXInbox, isRefusal, POLL_CHOICES, resumeXInbox, setXInbox, usd, xAction, xMessages, type XAction, type XInbox } from "@/lib/x-inbox";

// Connecting X again, asking for the inbox's permissions too (the plain connect leaves them out, so an X app that does not allow DMs still connects).
const inboxConnect = () => `${connectUrl("x")}${connectUrl("x").includes("?") ? "&" : "?"}inbox=1`;
const said = (r: unknown): ReactNode => (isRefusal(r) ? (r.message ?? xMessages[r.code] ?? "X refused it.") : problemText(r as never));

// An X account's inbox settings, inside its settings dialog. Off by default: X bills every post, user and DM it returns,
// so the team turns reading on, picks how often and what the account may spend a month, and sees what that costs.
export function XInboxSettings({ id, canManage }: { id: string; canManage: boolean }) {
  const [state, setState] = useState<XInbox | null>(null);
  const [problem, setProblem] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [on, setOn] = useState(false);
  const [dms, setDms] = useState(false);
  const [every, setEvery] = useState(60);
  const [budget, setBudget] = useState("2");

  function show(s: XInbox) {
    setState(s);
    setOn(s.enabled);
    setDms(s.read_dms);
    setEvery(s.poll_minutes);
    setBudget(String(s.budget_usd));
  }
  useEffect(() => {
    let live = true;
    getXInbox(id).then((r) => {
      if (!live) return;
      if (isFailure(r) || isRefusal(r)) setProblem(<>The inbox settings couldn&apos;t be read. {said(r)}</>);
      else show(r);
    });
    return () => {
      live = false;
    };
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSaved(false);
    // A "$5" or "5,50" would go to brain as null, which keeps the old budget while this says Saved.
    const { min_budget_usd: low, max_budget_usd: high } = state!.limits;
    const dollars = /^\d+(\.\d{1,2})?$/.test(budget.trim()) ? Number(budget) : NaN;
    if (!(dollars >= low && dollars <= high)) return setProblem(`Write the budget as a number of dollars, from ${usd(low)} to ${usd(high)}, for example 5 or 2.50.`);
    setBusy(true);
    setProblem(null);
    const r = await setXInbox(id, { enabled: on, read_dms: on && dms && state!.can_read_dms, poll_minutes: every, budget_usd: dollars });
    setBusy(false);
    if (isFailure(r) || isRefusal(r)) return setProblem(said(r));
    show(r);
    setSaved(true);
  }
  async function resume() {
    setBusy(true);
    setProblem(null);
    const r = await resumeXInbox(id);
    setBusy(false);
    if (isFailure(r) || isRefusal(r)) return setProblem(said(r));
    show(r);
  }

  if (!state) return <p className="text-sm text-ink-soft">{problem ?? "Loading the inbox settings..."}</p>;
  const e = state.estimate;
  return (
    <form onSubmit={submit} className="grid gap-3" aria-labelledby={`x-inbox-${id}`}>
      <fieldset className="grid gap-2" disabled={!canManage}>
        <legend id={`x-inbox-${id}`} className="mb-1 font-bold">
          X inbox
        </legend>
        <p className="text-sm text-ink-soft">
          Mentions and replies to this account&apos;s posts arrive in your inbox, where you can reply, like, repost and hide a reply. X charges for every post, user and DM it sends back, so this is off until you turn it on, and it
          stops at the budget you set.
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={on} onChange={(ev) => setOn(ev.target.checked)} />
          Read this account&apos;s mentions and replies
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={dms && on && state.can_read_dms} disabled={!on || !state.can_read_dms} onChange={(ev) => setDms(ev.target.checked)} />
          Read and send DMs
        </label>
        {!state.can_read_dms && (
          <p className="text-sm">
            <strong>Reconnect for DMs, likes and hiding.</strong> <span className="text-ink-soft">This account was connected without those permissions, so X never gave them.</span>{" "}
            <a href={inboxConnect()} className="font-bold underline decoration-2 underline-offset-4">
              Reconnect
            </a>
          </p>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <label htmlFor={`x-every-${id}`} className="label">
              Read every
            </label>
            <select id={`x-every-${id}`} className="field" value={every} onChange={(ev) => setEvery(Number(ev.target.value))}>
              {[...new Set([...POLL_CHOICES, every])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {everyText(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor={`x-budget-${id}`} className="label">
              Most to spend a month ($)
            </label>
            <input id={`x-budget-${id}`} className="field w-32" inputMode="decimal" value={budget} onChange={(ev) => setBudget(ev.target.value)} aria-describedby={`x-cost-${id}`} />
          </div>
        </div>
        <p id={`x-cost-${id}`} className="text-sm text-ink-soft">
          Each new mention or reply costs about {usd(e.per_mention_usd)} and each new DM about {usd(e.per_dm_usd)}. Nothing new costs nothing{state.read_dms ? `, except about ${usd(e.idle_month_usd)} a month to check for DMs` : ""}. Spent this month:{" "}
          <strong>{usd(state.spent_usd)}</strong> of {usd(state.budget_usd)}
          {state.spent_usd > 0 ? `, heading for ${usd(e.projected_month_usd)}` : ""}.{" "}
          {state.credits ? `On Cloud your X credits pay too: 1 for each reply or action, and 1 for every ${state.reads_per_credit} items read.` : "X bills these to the X developer app's credits."}
        </p>
      </fieldset>
      {state.paused && (
        <p role="alert" className="rounded-xl bg-canvas p-3 text-sm">
          <strong>Reading is paused.</strong> {state.message}
          {state.paused !== "budget" && canManage && (
            <>
              {" "}
              <button type="button" className="font-bold underline decoration-2 underline-offset-4" disabled={busy} onClick={resume}>
                Resume
              </button>
            </>
          )}
        </p>
      )}
      {!state.paused && state.last_error && <p className="text-sm text-ink-soft">Last problem: {state.last_error}</p>}
      {state.reconnect && (
        <p role="alert" className="waitlist-error">
          X refused this account&apos;s sign-in, so nothing is read until you reconnect it.{" "}
          <a href={inboxConnect()} className="font-bold underline decoration-2 underline-offset-4">
            Reconnect
          </a>
        </p>
      )}
      {problem && (
        <p role="alert" className="waitlist-error">
          {problem}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm font-bold">
          Saved.
        </p>
      )}
      {canManage && (
        <button type="submit" className="btn btn-primary btn-sm justify-self-start" disabled={busy}>
          {busy ? "Saving..." : "Save inbox settings"}
        </button>
      )}
    </form>
  );
}

// Like, repost or hide the post of an X comment or mention. Each press asks X once.
export function XActions({ item }: { item: Pick<Item, "id" | "kind" | "platform"> }) {
  const [busy, setBusy] = useState<XAction | null>(null);
  const [note, setNote] = useState<{ text: ReactNode; ok: boolean } | null>(null);
  if (item.platform !== "x" || (item.kind !== "comment" && item.kind !== "mention")) return null;
  async function press(action: XAction, done: string) {
    setBusy(action);
    setNote(null);
    const r = await xAction(item.id, action);
    setBusy(null);
    setNote(isFailure(r) || isRefusal(r) ? { text: said(r), ok: false } : { text: done, ok: true });
  }
  const buttons: [XAction, string, string][] = [
    ["like", "Like", "Liked."],
    ["repost", "Repost", "Reposted."],
    ...(item.kind === "comment" ? ([["hide", "Hide reply", "Reply hidden."]] as [XAction, string, string][]) : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-ink/10 pt-3">
      {buttons.map(([action, label, done]) => (
        <button key={action} type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} aria-busy={busy === action} onClick={() => press(action, done)}>
          {label}
        </button>
      ))}
      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-sm font-bold" : "waitlist-error"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
