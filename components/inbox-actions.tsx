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
import { isFailure, problemText } from "@/components/team-ui";
import { REACTIONS } from "@/lib/inbox";

type Read = { id: string; actions: ItemActions | null; failed: boolean };

// The account's live state toward an item and what was done from here, read again after each action. A read that fails keeps the last good state.
export function useItemActions(item: Pick<Item, "id" | "kind" | "platform">) {
  const wanted = item.platform === "bluesky" ? item.id : null;
  const [read, setRead] = useState<Read | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    getActions(wanted).then((r) => {
      if (!live) return;
      setRead((prev) => {
        const kept = prev?.id === wanted ? prev.actions : null;
        return isFailure(r) ? { id: wanted, actions: kept, failed: true } : { id: wanted, actions: r, failed: false };
      });
    });
    return () => {
      live = false;
    };
  }, [wanted, n]);
  const here = read?.id === wanted ? read : null;
  return { actions: here?.actions ?? null, loading: wanted !== null && here === null, failed: here?.failed ?? false, wanted: wanted !== null, reload: () => setN((x) => x + 1) };
}

type Outcome = { ok: string } | { error: ReactNode };
// Sends one action and says how it went; a SendError carries brain's own words.
async function perform(id: string, input: ActionInput): Promise<Outcome & { unsure?: boolean }> {
  const r = await runAction(id, input);
  // No clear answer from brain: it may have gone through, so the state is read again and the person is told.
  if (r === "timeout" || r === "error") return { error: "No clear answer from Bluesky, so this may have gone through. The state is read again: check it before trying again.", unsure: true };
  if (typeof r === "string") return { error: problemText(r) };
  if ("message" in r) return { error: r.message };
  return { ok: actionDone[input.action] };
}

const note = "text-sm";

export function ItemActionsMenu({ item, canManage, state, loading, failed, reload }: { item: Item; canManage: boolean; state: ItemActions | null; loading: boolean; failed: boolean; reload: () => void }) {
  const [asking, setAsking] = useState<ActionButton | "report" | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Outcome | null>(null);
  const [reason, setReason] = useState({ type: "spam", text: "", account: false });
  const askRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
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
    // The button that was pressed goes with the confirmation: focus returns to the section's heading.
    if ("ok" in r) {
      setAsking(null);
      summaryRef.current?.focus();
    }
    // A refusal changed nothing; a success or an unsure answer may have, so the state is read again.
    if ("ok" in r || "unsure" in r) reload();
  }
  function report(e: FormEvent) {
    e.preventDefault();
    // An item that is no post of its own (a DM, a like, a follow) can only report its author's account.
    return go({ action: "report", reason_type: reason.type, reason: reason.text.trim() || undefined, account: reason.account || !post });
  }

  return (
    <details className="group text-sm">
      <summary ref={summaryRef} className="cursor-pointer select-none font-bold text-ink-soft hover:text-ink">
        Actions on Bluesky
      </summary>
      <div className="mt-2 grid gap-2">
        {loading && (
          <p role="status" className="text-xs text-ink-soft">
            Reading the current state from Bluesky...
          </p>
        )}
        {failed && !state && (
          <p role="alert" className="waitlist-error">
            The current state could not be read from Bluesky.{" "}
            <button type="button" className="font-bold underline" onClick={reload}>
              Retry
            </button>
          </p>
        )}
        {failed && state && <p className="text-xs text-ink-soft">The state could not be read again, so it may be out of date.</p>}
        {state?.viewer === null && <p className="text-xs text-ink-soft">The current state could not be read from Bluesky, so buttons show their first choice.</p>}
        <div className="flex flex-wrap gap-2">
          {(state || !failed) && buttons.map((b) => (
            <button key={b.action} type="button" className={`btn btn-secondary btn-sm ${b.danger ? "btn-danger" : ""}`} disabled={busy || loading} onClick={() => { setSaid(null); setAsking(b); }}>
              {b.label}
            </button>
          ))}
          {canManage && (state || !failed) && (
            <button type="button" className="btn btn-secondary btn-sm btn-danger" disabled={busy || loading} onClick={() => { setSaid(null); setAsking("report"); }}>
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
  const [deleted, setDeleted] = useState(false);
  if (deleted || state?.log.some((l) => l.action === "delete_reply" && l.status === "done" && l.reply_id === replyId))
    return (
      <span role="status" className="text-xs text-ink-soft">
        Deleted from Bluesky
      </span>
    );
  async function go() {
    setBusy(true);
    setProblem(null);
    const r = await perform(itemId, { action: "delete_reply", reply_id: replyId });
    setBusy(false);
    if ("error" in r) setProblem(r.error);
    else {
      setDeleted(true);
      setAsking(false);
    }
    if ("ok" in r || "unsure" in r) reload();
  }
  return asking ? (
    <span className="flex flex-wrap items-center justify-end gap-x-2 text-xs">
      <span>Delete this reply from Bluesky?</span>
      <button type="button" autoFocus className="font-bold underline decoration-signal-deep decoration-2 underline-offset-4" disabled={busy} onClick={go}>
        {busy ? "Deleting..." : "Yes, delete"}
      </button>
      <button
        type="button"
        className="font-bold text-ink-soft hover:text-ink"
        disabled={busy}
        onClick={() => {
          setProblem(null);
          setAsking(false);
        }}
      >
        Cancel
      </button>
      {problem && (
        <span role="alert" className="waitlist-error">
          {problem}
        </span>
      )}
    </span>
  ) : (
    <button type="button" className="text-xs font-bold text-ink-soft hover:text-signal-deep" aria-label="Delete this reply from Bluesky" onClick={() => setAsking(true)}>
      Delete
    </button>
  );
}

// A DM's conversation: a message request waits for a yes or a no, a group says a reply reaches everyone, and a mute stops its notifications.
export function DmTools({ itemId, canManage, state, reload }: { itemId: string; canManage: boolean; state: ItemActions | null; reload: () => void }) {
  const [busy, setBusy] = useState<ActionName | null>(null);
  const [said, setSaid] = useState<Outcome | null>(null);
  const [declining, setDeclining] = useState(false);
  const convo = state?.convo;
  if (!convo) return null;
  async function go(action: ActionName) {
    setBusy(action);
    setSaid(null);
    const r = await perform(itemId, { action });
    setBusy(null);
    setSaid(r);
    if ("ok" in r) {
      setDeclining(false);
      reload();
    }
  }
  return (
    <div className="grid gap-2 text-sm">
      {convo.status === "request" && (
        <div role="group" aria-label="Message request" className="grid gap-2 rounded-xl border border-ink/15 bg-canvas p-3">
          <p>This is a message request. Bluesky keeps it apart until you accept; accepting lets the sender see that you read it.</p>
          <p className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => go("accept_convo")}>
              {busy === "accept_convo" ? "Accepting..." : "Accept"}
            </button>
            {canManage &&
              (declining ? (
                <>
                  <span className="self-center">Decline and leave this conversation?</span>
                  <button type="button" className="btn btn-danger-solid btn-sm" disabled={busy !== null} onClick={() => go("leave_convo")}>
                    {busy === "leave_convo" ? "Declining..." : "Yes, decline"}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDeclining(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm btn-danger" disabled={busy !== null} onClick={() => setDeclining(true)}>
                  Decline
                </button>
              ))}
          </p>
        </div>
      )}
      {convo.group && <p className="text-ink-soft">A group conversation of {convo.members}{convo.members > 2 ? " or more" : ""} people: a reply goes to everyone in it.</p>}
      <p className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => go(convo.muted ? "unmute_convo" : "mute_convo")}>
          {convo.muted ? "Unmute conversation" : "Mute conversation"}
        </button>
        {convo.muted && <span className="text-xs text-ink-soft">Bluesky sends no notifications for it.</span>}
      </p>
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
    </div>
  );
}

// React to one message with an emoji, or (owners and admins) delete it for this account only.
export function MessageTools({ itemId, canManage }: { itemId: string; canManage: boolean }) {
  const [said, setSaid] = useState<Outcome | null>(null);
  const [deleting, setDeleting] = useState(false);
  async function go(input: ActionInput) {
    setSaid(null);
    const r = await perform(itemId, input);
    setSaid(r);
    if ("ok" in r) setDeleting(false);
  }
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      {REACTIONS.map((emoji) => (
        <button key={emoji} type="button" className="rounded-full px-1.5 py-0.5 hover:bg-ink/10" aria-label={`React ${emoji}`} onClick={() => go({ action: "react", emoji })}>
          {emoji}
        </button>
      ))}
      {canManage &&
        (deleting ? (
          <>
            <span>Delete for this account only?</span>
            <button type="button" className="font-bold underline decoration-signal-deep decoration-2 underline-offset-4" onClick={() => go({ action: "delete_message" })}>
              Yes, delete
            </button>
            <button type="button" className="font-bold text-ink-soft hover:text-ink" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="font-bold text-ink-soft hover:text-signal-deep" onClick={() => setDeleting(true)}>
            Delete
          </button>
        ))}
      {said && "ok" in said && <span role="status">{said.ok}</span>}
      {said && "error" in said && <span role="alert" className="waitlist-error">{said.error}</span>}
    </span>
  );
}
