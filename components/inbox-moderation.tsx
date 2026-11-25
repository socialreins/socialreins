"use client";

import { useState, type ReactNode } from "react";
import { TeamLink as Link } from "@/components/team-link";
import { isFailure, problemText } from "@/components/team-ui";
import { moderateItem, type Item, type ModerationAction } from "@/lib/inbox";

const done: Record<ModerationAction, string> = {
  hide: "Hidden.",
  unhide: "Shown again.",
  delete: "Deleted.",
  like: "Liked as your Page.",
  unlike: "Like removed.",
};

// What to do about a refusal, by brain's code; anything else shows Meta's own words.
const advice: Record<string, ReactNode> = {
  meta_reconnect_required: (
    <>
      Meta refused this account&apos;s sign-in.{" "}
      <Link href="/connections" className="underline decoration-2 underline-offset-4">
        Reconnect it under Accounts
      </Link>
      .
    </>
  ),
  not_supported: "Facebook and Instagram do not allow that on this comment.",
};

// Hide, like and delete a Facebook or Instagram comment on the platform. What is offered is what brain says
// can be done now (`moderation.can`); Instagram has no like, so none is offered there. Delete is for owners and admins.
export function ModerationBar({ item, canDelete, onChange }: { item: Item; canDelete: boolean; onChange: (i: Item) => void }) {
  const m = item.moderation;
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (!m) return null;
  const on = item.platform === "instagram" ? "Instagram" : "Facebook";

  async function run(action: ModerationAction) {
    setBusy(action);
    setSaid(null);
    setConfirming(false);
    const r = await moderateItem(item.id, action);
    setBusy(null);
    if (isFailure(r)) return setSaid({ ok: false, text: problemText(r) });
    if ("code" in r) return setSaid({ ok: false, text: advice[r.code] ?? r.message });
    onChange(r);
    setSaid({ ok: true, text: done[action] });
  }

  const can = new Set(m.can);
  const flip = (a: ModerationAction, b: ModerationAction) => (can.has(a) ? a : can.has(b) ? b : null);
  const hide = flip("hide", "unhide");
  const like = flip("like", "unlike");
  const label: Record<ModerationAction, string> = { hide: "Hide", unhide: "Show again", delete: "Delete", like: "Like", unlike: "Remove like" };
  const button = (a: ModerationAction | null, extra = "") =>
    a && (
      <button key={a} type="button" className={`btn btn-secondary btn-sm ${extra}`} disabled={busy !== null} onClick={() => run(a)}>
        {busy === a ? "Working..." : label[a]}
      </button>
    );

  return (
    <section aria-label="Moderate" className="grid gap-2 border-t border-ink/10 pt-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">On {on}:</span>
        {m.deleted && <span className="badge tone">Deleted</span>}
        {m.hidden && !m.deleted && <span className="badge tone">Hidden</span>}
        {m.liked && !m.deleted && <span className="badge tone">Liked</span>}
        {button(hide)}
        {button(like)}
        {item.platform === "instagram" && !m.deleted && (
          <span className="text-ink-soft" title="Instagram's API has no like for comments">
            Like: not available on Instagram
          </span>
        )}
        {can.has("delete") &&
          canDelete &&
          (confirming ? (
            <span className="flex flex-wrap items-center gap-2">
              <span id="delete-warning">Delete it on {on} for good?</span>
              <button type="button" className="btn btn-secondary btn-sm" aria-describedby="delete-warning" disabled={busy !== null} onClick={() => run("delete")}>
                {busy === "delete" ? "Working..." : "Yes, delete"}
              </button>
              <button type="button" className="font-bold text-ink-soft hover:text-ink" autoFocus onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => setConfirming(true)}>
              Delete
            </button>
          ))}
        {can.has("delete") && !canDelete && <span className="text-ink-soft">Deleting is for owners and admins.</span>}
      </div>
      {said && (
        <p role={said.ok ? "status" : "alert"} className={said.ok ? "waitlist-done" : "waitlist-error"}>
          {said.text}
        </p>
      )}
    </section>
  );
}
