"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  actionButtons,
  actionDone,
  getActions,
  REPORT_REASONS,
  runAction,
  type ActionButton,
  type ActionInput,
  type ActionName,
  type ItemActions,
  type Item,
} from "@/lib/inbox";
import type { Failure } from "@/lib/auth";
import { isFailure, problemText } from "@/components/team-ui";

type Read = { id: string; actions: ItemActions | Failure };

// The account's live state toward an item and what was done from here, read again after each action.
export function useItemActions(item: Pick<Item, "id" | "kind" | "platform">) {
  const wanted = item.platform === "bluesky" && item.kind !== "dm" ? item.id : null;
  const [read, setRead] = useState<Read | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    getActions(wanted).then((actions) => live && setRead({ id: wanted, actions }));
    return () => {
      live = false;
    };
  }, [wanted, n]);
  const actions = read?.id === wanted && read ? read.actions : null;
  return { actions: actions && !isFailure(actions) ? actions : null, wanted: wanted !== null, reload: () => setN((x) => x + 1) };
}

type Outcome = { ok: string } | { error: ReactNode };
// Sends one action and says how it went; a SendError carries brain's own words.
async function perform(id: string, input: ActionInput): Promise<Outcome> {
  const r = await runAction(id, input);
  if (typeof r === "string") return { error: problemText(r) };
  if ("message" in r) return { error: r.message };
  return { ok: actionDone[input.action] };
}

const note = "text-sm";

export function ItemActionsMenu({ item, canManage, state, reload }: { item: Item; canManage: boolean; state: ItemActions | null; reload: () => void }) {
  const [asking, setAsking] = useState<ActionButton | "report" | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Outcome | null>(null);
  const [reason, setReason] = useState({ type: "spam", text: "", account: false });
  const askRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asking) askRef.current?.querySelector<HTMLElement>("button, select")?.focus();
  }, [asking]);

  const buttons = actionButtons(item, state?.viewer ?? null, canManage).map((b) =>
    // A hidden reply offers to be shown again.
    b.action === "hide_reply" && state?.hidden ? { action: "unhide_reply" as ActionName, label: "Show reply", confirm: "Show this reply in the thread again?" } : b,
  );
  const post = item.kind === "comment" || item.kind === "mention";

  async function go(input: ActionInput) {
    setBusy(true);
    setSaid(null);
    const r = await perform(item.id, input);
    setBusy(false);
    setSaid(r);
    if ("ok" in r) {
      setAsking(null);
      reload();
    }
  }
  function report(e: FormEvent) {
    e.preventDefault();
    // An item that is no post of its own (a DM, a like, a follow) can only report its author's account.
    return go({ action: "report", reason_type: reason.type, reason: reason.text.trim() || undefined, account: reason.account || !post });
  }

  return (
    <details className="group text-sm">
      <summary className="cursor-pointer select-none font-bold text-ink-soft hover:text-ink">Actions on Bluesky</summary>
      <div className="mt-2 grid gap-2">
        {state?.viewer === null && <p className="text-xs text-ink-soft">The current state could not be read from Bluesky, so buttons show their first choice.</p>}
        <div className="flex flex-wrap gap-2">
          {buttons.map((b) => (
            <button key={b.action} type="button" className={`btn btn-secondary btn-sm ${b.danger ? "btn-danger" : ""}`} disabled={busy} onClick={() => { setSaid(null); setAsking(b); }}>
              {b.label}
            </button>
          ))}
          {canManage && (
            <button type="button" className="btn btn-secondary btn-sm btn-danger" disabled={busy} onClick={() => { setSaid(null); setAsking("report"); }}>
              Report
            </button>
          )}
        </div>
        {asking && asking !== "report" && (
          <div ref={askRef} role="group" aria-label="Confirm" className="grid gap-2 rounded-xl border border-ink/15 bg-canvas p-3">
            <p className={note}>{asking.confirm}</p>
            <p className="flex gap-2">
              <button type="button" className={`btn btn-sm ${asking.danger ? "btn-danger-solid" : "btn-primary"}`} disabled={busy} onClick={() => go({ action: asking.action })}>
                {busy ? "Working..." : "Confirm"}
              </button>
              <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setAsking(null)}>
                Cancel
              </button>
            </p>
          </div>
        )}
        {asking === "report" && (
          <form ref={askRef as never} onSubmit={report} aria-label="Report to Bluesky" className="grid gap-2 rounded-xl border border-ink/15 bg-canvas p-3">
            <p className={note}>Reports go to Bluesky&apos;s moderators, from this account. Only report what breaks Bluesky&apos;s rules.</p>
            <label className="grid gap-1">
              <span className="label">Reason</span>
              <select className="field" value={reason.type} onChange={(e) => setReason({ ...reason, type: e.target.value })}>
                {REPORT_REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="label">Details (optional)</span>
              <textarea className="field resize-none" rows={2} maxLength={2000} value={reason.text} onChange={(e) => setReason({ ...reason, text: e.target.value })} />
            </label>
            {post && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={reason.account} onChange={(e) => setReason({ ...reason, account: e.target.checked })} />
                Report the account, not just this post
              </label>
            )}
            <p className="flex gap-2">
              <button type="submit" className="btn btn-danger-solid btn-sm" disabled={busy}>
                {busy ? "Sending..." : "Send report"}
              </button>
              <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setAsking(null)}>
                Cancel
              </button>
            </p>
          </form>
        )}
        {said && "ok" in said && (
          <p role="status" className="waitlist-done">
            {said.ok}
          </p>
        )}
        {said && "error" in said && (
          <p role="alert" className="waitlist-error">
            {said.error}
          </p>
        )}
        {state && state.log.length > 0 && (
          <ul aria-label="Recent actions" className="grid gap-0.5 text-xs text-ink-soft">
            {state.log.slice(0, 3).map((l) => (
              <li key={l.id}>
                {actionDone[l.action]?.replace(/\.$/, "") ?? l.action}
                {l.status === "failed" ? " (failed)" : ""}, {new Date(l.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

// Takes one of our public replies off Bluesky; owners and admins only. A reply already deleted from here says so.
export function DeleteReply({ itemId, replyId, state, reload }: { itemId: string; replyId: string; state: ItemActions | null; reload: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReactNode>(null);
  if (state?.log.some((l) => l.action === "delete_reply" && l.status === "done" && l.reply_id === replyId)) return <span className="text-xs text-ink-soft">Deleted from Bluesky</span>;
  async function go() {
    setBusy(true);
    const r = await perform(itemId, { action: "delete_reply", reply_id: replyId });
    setBusy(false);
    if ("error" in r) setProblem(r.error);
    else {
      setAsking(false);
      reload();
    }
  }
  return asking ? (
    <span className="flex flex-wrap items-center justify-end gap-x-2 text-xs">
      <span>Delete this reply from Bluesky?</span>
      <button type="button" className="font-bold underline decoration-signal-deep decoration-2 underline-offset-4" disabled={busy} onClick={go}>
        {busy ? "Deleting..." : "Yes, delete"}
      </button>
      <button type="button" className="font-bold text-ink-soft hover:text-ink" disabled={busy} onClick={() => setAsking(false)}>
        Cancel
      </button>
      {problem && (
        <span role="alert" className="waitlist-error">
          {problem}
        </span>
      )}
    </span>
  ) : (
    <button type="button" className="text-xs font-bold text-ink-soft hover:text-signal-deep" onClick={() => setAsking(true)}>
      Delete
    </button>
  );
}
