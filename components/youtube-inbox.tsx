"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isFailure, problemText } from "@/components/team-ui";
import { connectUrl, safeAvatar } from "@/lib/connections";
import { moderateItem, type Item } from "@/lib/inbox";
import { everyText } from "@/lib/x-inbox";
import { BUDGET_CHOICES, getYouTubeInbox, isRefusal, POLL_CHOICES, resumeYouTubeInbox, setYouTubeInbox, youtubeMessages, type YouTubeInbox } from "@/lib/youtube-inbox";

const said = (r: unknown): ReactNode => (isRefusal(r) ? (r.message ?? youtubeMessages[r.code] ?? "YouTube refused it.") : problemText(r as never));

// A YouTube channel's inbox settings, inside its settings dialog. Off by default: every read uses YouTube quota that all
// SocialReins teams and every upload share, so the team turns reading on, picks how often and how many units a day.
export function YouTubeInboxSettings({ id, canManage }: { id: string; canManage: boolean }) {
  const [state, setState] = useState<YouTubeInbox | null>(null);
  const [problem, setProblem] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [on, setOn] = useState(false);
  const [every, setEvery] = useState(30);
  const [units, setUnits] = useState(300);

  function show(s: YouTubeInbox) {
    setState(s);
    setOn(s.enabled);
    setEvery(s.poll_minutes);
    setUnits(s.daily_units);
  }
  useEffect(() => {
    let live = true;
    getYouTubeInbox(id).then((r) => {
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
    setBusy(true);
    setProblem(null);
    const r = await setYouTubeInbox(id, { enabled: on, poll_minutes: every, daily_units: units });
    setBusy(false);
    if (isFailure(r) || isRefusal(r)) return setProblem(said(r));
    show(r);
    setSaved(true);
  }
  async function resume() {
    setBusy(true);
    setProblem(null);
    const r = await resumeYouTubeInbox(id);
    setBusy(false);
    if (isFailure(r) || isRefusal(r)) return setProblem(said(r));
    show(r);
  }

  if (!state) return <p className="text-sm text-ink-soft">{problem ?? "Loading the inbox settings..."}</p>;
  const reconnect = (
    <a href={connectUrl("youtube")} className="font-bold underline decoration-2 underline-offset-4">
      Reconnect
    </a>
  );
  return (
    <form onSubmit={submit} className="grid gap-3" aria-labelledby={`yt-inbox-${id}`}>
      <fieldset className="grid gap-2" disabled={!canManage}>
        <legend id={`yt-inbox-${id}`} className="mb-1 font-bold">
          YouTube inbox
        </legend>
        <p className="text-sm text-ink-soft">
          Comments on this channel&apos;s videos and Shorts arrive in your inbox, where you can reply, hold a comment for review or reject it. YouTube allows every SocialReins channel together 10,000 units a day, so this is off until you turn it
          on, and it stops at the daily budget you set. A comment is kept here for 30 days, as YouTube requires.
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={on} onChange={(ev) => setOn(ev.target.checked)} />
          Read this channel&apos;s comments
        </label>
        {state.reconnect_for_comments && (
          <p className="text-sm">
            <strong>Reconnect to enable comments.</strong> <span className="text-ink-soft">This channel was connected without the permission YouTube needs to read comments.</span> {reconnect}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <label htmlFor={`yt-every-${id}`} className="label">
              Read every
            </label>
            <select id={`yt-every-${id}`} className="field" value={every} onChange={(ev) => setEvery(Number(ev.target.value))}>
              {[...new Set([...POLL_CHOICES, every])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {everyText(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor={`yt-units-${id}`} className="label">
              Most units to spend a day
            </label>
            <select id={`yt-units-${id}`} className="field" value={units} onChange={(ev) => setUnits(Number(ev.target.value))} aria-describedby={`yt-cost-${id}`}>
              {[...new Set([...BUDGET_CHOICES, units])].sort((a, b) => a - b).map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString("en-US")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p id={`yt-cost-${id}`} className="text-sm text-ink-soft">
          Checking costs 1 unit, about {state.idle_units_per_day} a day at this pace, and a busy channel needs a few more to read replies and video titles. Replying, holding or rejecting a comment costs {state.write_units} units each, outside
          this budget, and a channel may make 40 such calls a day. Today (Pacific time): <strong>{state.units_today}</strong> of {state.daily_units} used reading, {state.write_units_today} on replies and moderation. YouTube&apos;s day starts at midnight Pacific time.
        </p>
      </fieldset>
      {state.shared_exhausted && (
        <p role="alert" className="rounded-xl bg-canvas p-3 text-sm">
          <strong>All channels together used today&apos;s share of YouTube&apos;s quota.</strong> Nothing is read until midnight Pacific time.
        </p>
      )}
      {state.paused && (
        <p role="alert" className="rounded-xl bg-canvas p-3 text-sm">
          <strong>Reading is paused.</strong> {state.message}
          {canManage && (
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
          YouTube refused this channel&apos;s sign-in, so nothing is read until you reconnect it. {reconnect}
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

// What a YouTube comment sits under: the video (its title and thumbnail, as last read) and, for a reply, the comment it answers.
export function YouTubeContext({ item }: { item: Pick<Item, "video" | "reply_to"> }) {
  const { video, reply_to: parent } = item;
  if (!video && !parent) return null;
  const thumb = safeAvatar(video?.thumbnail_url ?? null);
  return (
    <>
      {video && (
        <li data-row="context" className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-ink/[0.03] p-3 text-sm">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element -- a remote thumbnail, no Next image loader configured
            <img src={thumb} alt="" width={96} height={54} referrerPolicy="no-referrer" className="aspect-video w-24 shrink-0 rounded-lg object-cover" />
          )}
          <p className="min-w-0">
            <span className="block text-xs text-ink-soft">On the video</span>
            <a href={video.url} target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-2 underline-offset-4">
              {video.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </li>
      )}
      {parent && (
        <li data-row="context" className="grid gap-1 rounded-2xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-sm">
          <span className="text-xs text-ink-soft">In reply to {parent.author_name ?? "a comment"}</span>
          <p className="whitespace-pre-wrap break-words">{parent.text}</p>
        </li>
      )}
    </>
  );
}

// Takes back one of the channel's own public replies on YouTube (50 quota units; only the channel that wrote it can).
export function YouTubeDeleteReply({ itemId, replyId, onChange }: { itemId: string; replyId: string; onChange: (i: Item) => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReactNode>(null);
  async function go() {
    setBusy(true);
    setProblem(null);
    const r = await moderateItem(itemId, "delete_reply", replyId);
    setBusy(false);
    if (isFailure(r)) return setProblem(problemText(r));
    if ("code" in r) return setProblem(r.message);
    onChange(r);
  }
  return asking ? (
    <span className="flex flex-wrap items-center justify-end gap-x-2 text-xs">
      <span>Delete this reply from YouTube?</span>
      <button type="button" autoFocus className="font-bold underline decoration-signal-deep decoration-2 underline-offset-4" disabled={busy} onClick={go}>
        {busy ? "Deleting..." : "Yes, delete"}
      </button>
      <button type="button" className="font-bold text-ink-soft hover:text-ink" disabled={busy} onClick={() => setAsking(false)}>
        Cancel
      </button>
      {problem && (
        <span role="alert" className="font-bold text-signal-deep">
          {problem}
        </span>
      )}
    </span>
  ) : (
    <button type="button" className="font-bold text-ink-soft hover:text-ink" onClick={() => setAsking(true)}>
      Delete reply
    </button>
  );
}
