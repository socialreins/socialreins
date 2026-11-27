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
  hold: "Held for review. It is hidden on YouTube until you publish it.",
  publish: "Published again.",
  reject: "Rejected. YouTube hides it for good.",
  ban: "Rejected, and the author is banned from the channel's comments.",
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
  not_supported: "The platform does not allow that on this comment.",
  youtube_reconnect_required: (
    <>
      YouTube refused this channel&apos;s sign-in or a permission is missing.{" "}
      <Link href="/connections" className="underline decoration-2 underline-offset-4">
        Reconnect it under Accounts
      </Link>
      .
    </>
  ),
};

// Hide, like and delete a Facebook or Instagram comment on the platform. What is offered is what brain says
// can be done now (`moderation.can`); Instagram has no like, so none is offered there. Delete is for owners and admins.
export function ModerationBar({ item, canDelete, onChange }: { item: Item; canDelete: boolean; onChange: (i: Item) => void }) {
  const m = item.moderation;
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (!m) return null;
  const youtube = item.platform === "youtube";
  const on = youtube ? "YouTube" : item.platform === "instagram" ? "Instagram" : "Facebook";

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
  const hide = youtube ? flip("hold", "publish") : flip("hide", "unhide");
  const like = flip("like", "unlike");
  const label: Record<ModerationAction, string> = { hide: "Hide", unhide: "Show again", delete: "Delete", like: "Like", unlike: "Remove like", hold: "Hold for review", publish: "Publish again", reject: "Reject", ban: "Reject and ban author" };
  // On YouTube the destructive actions are reject and ban (for good), for owners and admins.
  const destructive: ModerationAction[] = youtube ? ["reject", "ban"] : ["delete"];
  const verb = youtube ? "Reject" : "Delete";
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
        {m.deleted && <span className="badge tone">{youtube ? "Rejected" : "Deleted"}</span>}
        {m.hidden && !m.deleted && <span className="badge tone">{youtube ? "Held for review" : "Hidden"}</span>}
        {m.liked && !m.deleted && <span className="badge tone">Liked</span>}
        {button(hide)}
        {button(like)}
        {item.platform === "instagram" && !m.deleted && (
          <span className="text-ink-soft" title="Instagram's API has no like for comments">
            Like: not available on Instagram
          </span>
        )}
        {youtube && !m.deleted && (
          <span className="text-ink-soft" title="YouTube's API has no like or heart for comments">
            Like: not available on YouTube
          </span>
        )}
        {destructive.some((a) => can.has(a)) &&
          canDelete &&
          (confirming ? (
            <span className="flex flex-wrap items-center gap-2">
              <span id="delete-warning">{youtube ? "Hide it on YouTube for good? A rejected comment cannot be published again. \"Reject and ban author\" also bans its author from this channel's comments, which only YouTube Studio can undo." : `Delete it on ${on} for good?`}</span>
              {destructive.map((a) => (
                <button key={a} type="button" className="btn btn-secondary btn-sm" aria-describedby="delete-warning" disabled={busy !== null} onClick={() => run(a)}>
                  {busy === a ? "Working..." : `Yes, ${label[a].toLowerCase()}`}
                </button>
              ))}
              <button type="button" className="font-bold text-ink-soft hover:text-ink" autoFocus onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => setConfirming(true)}>
              {verb}
            </button>
          ))}
        {destructive.some((a) => can.has(a)) && !canDelete && <span className="text-ink-soft">{youtube ? "Rejecting" : "Deleting"} is for owners and admins.</span>}
      </div>
      {said && (
        <p role={said.ok ? "status" : "alert"} className={said.ok ? "waitlist-done" : "waitlist-error"}>
          {said.text}
        </p>
      )}
    </section>
  );
}
