"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { isFailure, problemText } from "@/components/team-ui";
import { getActions, relativeTime, runAction, type Item, type ItemActions } from "@/lib/inbox";

// What the log says of each action, and of one that failed.
const did: Record<string, string> = { hide_reply: "Hid the reply", unhide_reply: "Showed the reply again" };

// Hide or show a Threads reply under one of the account's posts. Threads lets an app do only this: no like, repost, follow,
// mute or block. Brain asks for a confirmation, refuses a reply that is not directly under a post of the account, and logs
// every attempt, which is listed here.
export function ThreadsActions({ item, canManage }: { item: Pick<Item, "id" | "kind" | "platform">; canManage: boolean }) {
  return item.platform === "threads" && item.kind === "comment" ? <Hide id={item.id} canManage={canManage} /> : null;
}

function Hide({ id, canManage }: { id: string; canManage: boolean }) {
  const [state, setState] = useState<ItemActions | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const [n, setN] = useState(0);
  const ask = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    getActions(id).then((r) => {
      if (!live) return;
      if (isFailure(r)) setFailed(true);
      else {
        setFailed(false);
        setState(r);
      }
    });
    return () => {
      live = false;
    };
  }, [id, n]);
  useEffect(() => {
    if (asking) ask.current?.querySelector<HTMLElement>("button")?.focus();
  }, [asking]);

  const hidden = state?.hidden === true;
  async function go() {
    setBusy(true);
    setSaid(null);
    const r = await runAction(id, { action: hidden ? "unhide_reply" : "hide_reply" });
    setBusy(false);
    // No clear answer from Threads: it may have gone through, so the state is read again.
    if (r === "timeout" || r === "error") {
      setSaid({ ok: false, text: "No clear answer from Threads, so this may have gone through. The state is read again: check it before trying again." });
      return setN((x) => x + 1);
    }
    if (typeof r === "string") return setSaid({ ok: false, text: problemText(r) });
    if ("message" in r) return setSaid({ ok: false, text: r.message });
    setAsking(false);
    setSaid({ ok: true, text: hidden ? "The reply is shown again." : "The reply is hidden." });
    setN((x) => x + 1);
  }

  const log = state?.log.slice(0, 5) ?? [];
  return (
    <section aria-label="Actions on Threads" className="grid gap-2 border-t border-ink/10 pt-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold text-ink-soft">Actions on Threads</p>
        {canManage ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || (!state && !failed)} onClick={() => { setSaid(null); setAsking(true); }}>
            {hidden ? "Show reply" : "Hide reply"}
          </button>
        ) : (
          <span className="text-ink-soft">Owners and admins can hide replies.</span>
        )}
      </div>
      {asking && (
        <div ref={ask} role="group" aria-label="Confirm" className="grid gap-2 rounded-xl border border-ink/15 bg-canvas p-3">
          <p>
            {hidden
              ? "Show this reply under your post again?"
              : "Hide this reply under your post? It stays on Threads, but other people no longer see it in the thread. You can show it again."}
          </p>
          <p className="flex gap-2">
            <button type="button" className={`btn btn-sm ${hidden ? "btn-primary" : "btn-danger-solid"}`} disabled={busy} onClick={go}>
              {busy ? "Working..." : "Confirm"}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setAsking(false)}>
              Cancel
            </button>
          </p>
        </div>
      )}
      {said && (
        <p role={said.ok ? "status" : "alert"} className={said.ok ? "font-bold" : "waitlist-error"}>
          {said.text}
        </p>
      )}
      {failed && !state && <p className="text-xs text-ink-soft">What was done here before could not be read.</p>}
      {log.length > 0 && (
        <ul aria-label="Recent actions" className="grid gap-0.5 text-xs text-ink-soft">
          {log.map((l) => (
            <li key={l.id}>
              {did[l.action] ?? l.action}
              {l.status === "failed" ? ", not done" : ""}
              {" "}
              <time dateTime={l.created_at}>{relativeTime(l.created_at)}</time>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-soft">Threads lets an app reply and hide or show a reply, nothing else: no like, repost, follow or block. It has no DMs.</p>
    </section>
  );
}
