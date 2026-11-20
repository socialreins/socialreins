"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import type { Failure } from "@/lib/auth";
import {
  breakdown,
  broadcastLength,
  broadcastText,
  cancelBroadcast,
  createBroadcast,
  deleteBroadcast,
  example,
  getBroadcast,
  isProblem,
  listBroadcasts,
  listRecipients,
  MAX_NAME,
  MAX_RECIPIENTS,
  MAX_TEXT,
  NAME,
  PARTS,
  people,
  PLATFORMS,
  previewBroadcast,
  progress,
  reasonText,
  recipientStatusName,
  resumeBroadcast,
  RULES,
  sendBroadcast,
  statusName,
  updateBroadcast,
  type Broadcast,
  type Counts,
  type Preview,
  type Problem,
  type Recipient,
  type RecipientStatus,
} from "@/lib/broadcasts";
import { listContactTags, type TagCount } from "@/lib/contacts";
import { relativeTime } from "@/lib/inbox";
import { manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { platformOf, platformName, PlatformIcon } from "@/components/platform-icons";
import { TeamLink as Link, useTeamRouter as useRouter } from "@/components/team-link";
import { isFailure, linkButton, problemText } from "@/components/team-ui";
import { EmptyState, Icon, LoadFailed, Skeleton, SkeletonRows } from "@/components/ui";

const say = (code: Failure, field?: string): ReactNode => broadcastText(code, field) ?? problemText(code);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const ago = (iso: string) => (relativeTime(iso) === "now" ? "just now" : relativeTime(iso));
const useCanManage = () => manages(useSession().user.current_team.role);
const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-bold ${on ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"}`;
const heading = "font-display text-lg font-extrabold tracking-tight";

function Network({ id }: { id: string }) {
  const p = platformOf(id);
  return (
    <span className="inline-flex items-center gap-1.5">
      {p && <PlatformIcon platform={p} className="size-4 shrink-0" />}
      {platformName(id)}
    </span>
  );
}

// The tones of globals.css: a draft is dashed, sending blue, paused amber, sent green, cancelled plain.
export function StatusBadge({ status }: { status: Broadcast["status"] }) {
  const tone = { draft: "draft", sending: "running", sent: "sent", paused: undefined, cancelled: undefined }[status];
  return (
    <span className="badge tone" data-status={tone} data-approval={status === "paused" ? "pending" : undefined}>
      {statusName[status]}
    </span>
  );
}

const Audience = ({ b }: { b: Pick<Broadcast, "tag" | "platform"> }) => (
  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
    <span className="badge tone text-ink">
      <Icon name="tag" className="size-3.5" />
      {b.tag}
    </span>
    {b.platform ? <Network id={b.platform} /> : "Bluesky, Facebook and Instagram"}
  </span>
);

const barTone = { sent: "bg-[#2f9e5b]", skipped: "bg-ink/25", failed: "bg-[#d63a2f]", pending: "" };
const partName = { sent: "Sent", skipped: "Skipped", failed: "Failed", pending: "Waiting" };

// Sent, skipped, failed and waiting as numbers and as one bar of their shares. `parts`: the ones this kind of send has.
export function Progress({ counts, parts = PARTS }: { counts: Counts; parts?: readonly (typeof PARTS)[number][] }) {
  const share = progress(counts);
  return (
    <div className="grid gap-2">
      <dl aria-label="Progress" className="flex flex-wrap gap-x-5 gap-y-1">
        {parts.map((k) => (
          <div key={k}>
            <dt className="text-xs text-ink-soft">{partName[k]}</dt>
            <dd className={`font-bold tabular-nums ${k === "failed" && counts.failed ? "text-signal-deep" : ""}`}>{counts[k]}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-ink-soft">Of</dt>
          <dd className="font-bold tabular-nums">{counts.total}</dd>
        </div>
      </dl>
      <div
        role="img"
        aria-label={share ? `${share.done}% done: ${parts.map((k) => `${counts[k]} ${partName[k].toLowerCase()}`).join(", ")}` : "Nobody yet"}
        className="flex h-2 gap-px overflow-hidden rounded-full bg-ink/10"
      >
        {share && parts.map((k) => k !== "pending" && share[k] > 0 && <span key={k} data-part={k} className={`min-w-1 ${barTone[k]}`} style={{ width: `${share[k]}%` }} />)}
      </div>
    </div>
  );
}

const Rules = () => (
  <ul className="grid list-disc gap-1 pl-5 text-sm text-ink-soft">
    {RULES.map((r) => (
      <li key={r}>{r}</li>
    ))}
  </ul>
);

// A question asked in place, before something that can't be taken back. The safe answer takes focus.
export function Confirm({ id, title, about, yes, no, busy, danger, onYes, onNo }: { id: string; title: string; about: string; yes: string; no: string; busy: boolean; danger?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-about`} className="grid gap-2">
      <strong id={`${id}-title`}>{title}</strong>
      <p id={`${id}-about`} className="text-sm text-ink-soft">
        {about}
      </p>
      <span className="flex flex-wrap gap-2">
        <button type="button" className={`btn btn-sm ${danger ? "btn-danger-solid" : "btn-primary"}`} disabled={busy} onClick={onYes}>
          {busy ? "Working..." : yes}
        </button>
        <button type="button" autoFocus className="btn btn-quiet btn-sm" disabled={busy} onClick={onNo}>
          {no}
        </button>
      </span>
    </div>
  );
}

// The list: one card per broadcast, newest first.
export function Broadcasts() {
  const canManage = useCanManage();
  const [list, setList] = useState<Broadcast[] | Failure | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    listBroadcasts().then((r) => live && setList(r));
    return () => {
      live = false;
    };
  }, [tries]);

  if (list === null)
    return (
      <div role="status" className="grid gap-3">
        <span className="sr-only">Loading broadcasts...</span>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card grid gap-3 p-4">
            <Skeleton className={`h-4 ${i % 2 ? "w-1/4" : "w-1/3"}`} />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    );
  if (isFailure(list))
    return (
      <LoadFailed
        what="broadcasts"
        retry={() => {
          setList(null);
          setTries((n) => n + 1);
        }}
      >
        Broadcasts couldn&apos;t be loaded. {say(list)}
      </LoadFailed>
    );
  if (list.length === 0)
    return (
      <div className="grid max-w-3xl gap-4">
        <EmptyState
          title="No broadcasts yet."
          action={
            canManage && (
              <Link href="/broadcasts/new" className="btn btn-primary btn-sm">
                Write your first broadcast
              </Link>
            )
          }
        >
          A broadcast sends one message, as a DM, to everyone with a contact tag who can be messaged right now.
          {!canManage && " Team owners and admins write and send them."}
        </EmptyState>
        <section aria-label="How broadcasts work" className="enter card grid gap-2 p-5">
          <h2 className="label">How broadcasts work</h2>
          <Rules />
        </section>
      </div>
    );
  return (
    <div className="enter grid max-w-3xl gap-3">
      {canManage && (
        <Link href="/broadcasts/new" className="btn btn-primary btn-sm justify-self-end">
          <Icon name="plus" className="size-4" />
          New broadcast
        </Link>
      )}
      <ul aria-label="Broadcasts" className="grid gap-3">
        {list.map((b) => (
          <li key={b.id}>
            <Link href={`/broadcasts/${b.id}`} className="card grid gap-3 p-4 hover:shadow-[0_0_0_1px_var(--edge)]">
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <strong className="min-w-0 truncate">{b.name}</strong>
                <StatusBadge status={b.status} />
              </span>
              <Audience b={b} />
              {b.status === "draft" ? <span className="text-sm text-ink-soft">Not sent yet. Open it to review and send.</span> : <Progress counts={b.counts} />}
              {b.status === "paused" && b.pause_reason && <span className="text-sm font-bold text-signal-deep">Paused: {b.pause_reason}</span>}
              <span className="text-xs text-ink-soft">
                {b.started_at ? "Started" : "Created"} <time dateTime={b.started_at ?? b.created_at}>{ago(b.started_at ?? b.created_at)}</time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer font-bold text-ink-soft hover:text-ink">How broadcasts work</summary>
        <div className="pt-2">
          <Rules />
        </div>
      </details>
    </div>
  );
}

const ownersOnly = <p className="card p-5 text-ink-soft">Only team owners and admins can write and send broadcasts.</p>;

// A new draft, or a draft being changed. Saving never sends: that is the review step's job.
export function BroadcastForm({ broadcast, onSaved }: { broadcast?: Broadcast; onSaved?: (b: Broadcast) => void }) {
  const router = useRouter();
  const canManage = useCanManage();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [name, setName] = useState(broadcast?.name ?? "");
  const [tag, setTag] = useState(broadcast?.tag ?? "");
  const [platform, setPlatform] = useState(broadcast?.platform ?? "");
  const [text, setText] = useState(broadcast?.text ?? "");
  const [tags, setTags] = useState<TagCount[] | Failure | null>(null);
  const [tries, setTries] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listContactTags().then(setTags);
  }, [tries]);

  if (!canManage) return ownersOnly;

  const length = broadcastLength(text);
  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (length > MAX_TEXT) return setProblem({ code: "invalid_broadcast", field: "text" });
    const input = { name: name.trim(), text: text.trim(), tag, platform: platform || null };
    flushSync(() => {
      setProblem(null);
      setBusy(true);
    });
    const r = await (broadcast ? updateBroadcast(broadcast.id, input) : createBroadcast(input));
    if (isProblem(r)) {
      setBusy(false);
      return setProblem(r);
    }
    if (onSaved) onSaved(r);
    else router.push(`/broadcasts/${r.id}`);
  }

  // Puts {name} where the cursor is and keeps typing there.
  function insert() {
    const el = textRef.current;
    if (!el) return;
    const caret = el.selectionStart + NAME.length;
    flushSync(() => setText(text.slice(0, el.selectionStart) + NAME + text.slice(el.selectionEnd)));
    el.focus();
    el.setSelectionRange(caret, caret);
  }

  const field = problem?.code === "invalid_broadcast" ? problem.field : undefined;
  const err = (f: string) =>
    problem && field === f ? (
      <p id={`broadcast-${f}-error`} role="alert" className="waitlist-error">
        {say(problem.code, f)}
      </p>
    ) : null;
  const bad = (f: string) => ({ "aria-invalid": field === f || undefined, "aria-describedby": field === f ? `broadcast-${f}-error` : undefined });
  const known = Array.isArray(tags) ? tags : [];
  // A draft keeps its tag in the list even when no contact has it any more.
  const options = tag && !known.some((t) => t.tag === tag) ? [{ tag, count: 0 }, ...known] : known;

  return (
    <form onSubmit={onSave} className="enter card grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-5 p-5">
      <div className="grid gap-1.5">
        <label htmlFor="broadcast-name" className="label">
          Name
        </label>
        <input id="broadcast-name" required maxLength={MAX_NAME} className="field" placeholder="Spring offer" value={name} onChange={(e) => setName(e.target.value)} {...bad("name")} />
        {err("name") ?? <p className="hint">Only your team sees the name.</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label htmlFor="broadcast-tag" className="label">
            Send to everyone tagged
          </label>
          <select id="broadcast-tag" required className="field" value={tag} onChange={(e) => setTag(e.target.value)} {...bad("tag")}>
            <option value="">{tags === null ? "Loading the tags..." : "Pick a tag"}</option>
            {options.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({people(t.count)})
              </option>
            ))}
          </select>
          {err("tag")}
          {isFailure(tags) && (
            <p role="alert" className="waitlist-error">
              The tags couldn&apos;t be loaded.{" "}
              <button type="button" className={linkButton} onClick={() => setTries((n) => n + 1)}>
                Retry
              </button>
            </p>
          )}
          {Array.isArray(tags) && tags.length === 0 && (
            <p className="hint">
              No contact has a tag yet.{" "}
              <Link href="/contacts" className={linkButton}>
                Tag some contacts
              </Link>{" "}
              first.
            </p>
          )}
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor="broadcast-platform" className="label">
            Network
          </label>
          <select id="broadcast-platform" className="field" value={platform} onChange={(e) => setPlatform(e.target.value)} {...bad("platform")}>
            <option value="">Bluesky, Facebook and Instagram</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                Only {platformName(p)}
              </option>
            ))}
          </select>
          {err("platform")}
        </div>
      </div>
      <p className="hint">The count is everyone with the tag. The review step shows how many of them can get a message right now.</p>
      <div className="grid gap-1.5">
        <label htmlFor="broadcast-text" className="label">
          Message
        </label>
        <textarea id="broadcast-text" ref={textRef} required rows={5} className="field resize-y" value={text} onChange={(e) => setText(e.target.value)} {...bad("text")} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={insert}>
            Insert {NAME}
          </button>
          <p aria-label="Characters used" className={`hint tabular-nums ${length > MAX_TEXT ? "font-bold !text-signal-deep" : ""}`}>
            {length} / {MAX_TEXT}
          </p>
        </div>
        {err("text") ?? (
          <p className="hint">
            {NAME} becomes the person&apos;s name and counts as 64 characters, the longest a name can be.
          </p>
        )}
        <div role="group" aria-label="Example message" className="rounded-lg bg-ink/5 p-3">
          <p className="hint mb-1">What someone called Sam gets</p>
          <p className="text-sm break-words whitespace-pre-wrap">{text.trim() ? example(text.trim(), "Sam") : "Your message shows here as you type."}</p>
        </div>
      </div>
      {problem && !field && (
        <p role="alert" className="waitlist-error">
          {say(problem.code)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving..." : "Save draft"}
        </button>
        <Link href={broadcast ? `/broadcasts/${broadcast.id}` : "/broadcasts"} className="btn btn-quiet">
          Cancel
        </Link>
        <span className="hint">Saving sends nothing. You review the numbers next.</span>
      </div>
    </form>
  );
}

// One broadcast: a draft opens on the review step (or its form with ?edit=1), a started one on its progress.
export function BroadcastDetail({ id }: { id: string }) {
  const router = useRouter();
  const canManage = useCanManage();
  const edit = useSearchParams().get("edit") === "1";
  const [b, setB] = useState<Broadcast | Failure | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    getBroadcast(id).then((r) => live && setB(r));
    return () => {
      live = false;
    };
  }, [id, tries]);

  // While it sends: ask again every 10 seconds, not while the tab is hidden, and at once when it shows again.
  const sending = !isFailure(b) && b?.status === "sending";
  useEffect(() => {
    if (!sending) return;
    let live = true;
    const tick = () => {
      if (!document.hidden) getBroadcast(id).then((r) => live && !isFailure(r) && setB(r));
    };
    const timer = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [id, sending]);

  if (b === null)
    return (
      <div role="status" className="card grid max-w-3xl gap-4 p-5">
        <span className="sr-only">Loading the broadcast...</span>
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    );
  if (isFailure(b))
    return (
      <LoadFailed
        what="this broadcast"
        retry={() => {
          setB(null);
          setTries((n) => n + 1);
        }}
      >
        This broadcast couldn&apos;t be loaded. {say(b)}
      </LoadFailed>
    );
  const gone = () => router.replace("/broadcasts");
  if (b.status === "draft" && edit && canManage)
    return (
      <BroadcastForm
        broadcast={b}
        onSaved={(r) => {
          setB(r);
          router.replace(`/broadcasts/${r.id}`);
        }}
      />
    );
  return (
    <div className="enter grid max-w-4xl grid-cols-[minmax(0,1fr)] gap-4">
      <header className="grid gap-1.5">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="min-w-0 font-display text-xl font-extrabold tracking-tight break-words">{b.name}</h2>
          <StatusBadge status={b.status} />
        </span>
        <Audience b={b} />
      </header>
      {b.status === "draft" ? <Review b={b} canManage={canManage} onStarted={setB} onDeleted={gone} /> : <Started b={b} canManage={canManage} onChange={setB} onDeleted={gone} />}
    </div>
  );
}

const Message = ({ title, text }: { title: string; text: string }) => (
  <section aria-label="Message" className="card grid content-start gap-2 p-5">
    <h3 className="label">{title}</h3>
    <p className="rounded-lg bg-ink/5 p-3 text-sm break-words whitespace-pre-wrap">{text}</p>
  </section>
);

// Delete, behind a question. For a draft or a finished broadcast.
function Delete({ b, onDeleted }: { b: Broadcast; onDeleted: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Failure | null>(null);
  async function go() {
    setBusy(true);
    const r = await deleteBroadcast(b.id);
    if (!isFailure(r)) return onDeleted();
    setBusy(false);
    setAsking(false);
    setProblem(r);
  }
  return (
    <div className="grid gap-2 border-t border-ink/10 pt-4">
      {asking ? (
        <Confirm
          id="broadcast-delete"
          title={`Delete ${b.name}?`}
          about={b.status === "draft" ? "The draft is removed. Nothing was sent." : "The broadcast and its list of recipients are removed. Messages already sent stay sent."}
          yes="Yes, delete broadcast"
          no="Keep it"
          danger
          busy={busy}
          onYes={go}
          onNo={() => setAsking(false)}
        />
      ) : (
        <button type="button" className="btn btn-danger-outline btn-sm justify-self-start" onClick={() => setAsking(true)}>
          Delete broadcast
        </button>
      )}
      {problem && (
        <p role="alert" className="waitlist-error">
          {say(problem)}
        </p>
      )}
    </div>
  );
}

// The step before sending: who gets it, who does not and why, and the message as it will look.
// Nothing is sent without a second answer that repeats the number, and never again by itself.
function Review({ b, canManage, onStarted, onDeleted }: { b: Broadcast; canManage: boolean; onStarted: (b: Broadcast) => void; onDeleted: () => void }) {
  const [preview, setPreview] = useState<Preview | Failure | null>(null);
  const [tries, setTries] = useState(0);
  // The audience moved between the preview and the send: brain sent nothing and gave the new numbers.
  const [changed, setChanged] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Failure | null>(null);
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!canManage) return;
    let live = true;
    previewBroadcast(b.id).then((r) => live && setPreview(r));
    return () => {
      live = false;
    };
  }, [b.id, canManage, tries]);

  if (!canManage)
    return (
      <>
        <Message title="Message" text={b.text} />
        <p className="card p-5 text-ink-soft">This draft has not been sent. Only team owners and admins can review and send broadcasts.</p>
      </>
    );

  const again = () => {
    setPreview(null);
    setChanged(false);
    setProblem(null);
    setAsking(false);
    setTries((n) => n + 1);
  };
  async function send(n: number) {
    flushSync(() => {
      setProblem(null);
      setBusy(true);
    });
    // brain checks only the count: make sure the draft is still the one reviewed here.
    const fresh = await getBroadcast(b.id);
    if (!isFailure(fresh) && (fresh.status !== "draft" || fresh.text !== b.text || fresh.tag !== b.tag || fresh.platform !== b.platform)) {
      setBusy(false);
      setAsking(false);
      onStarted(fresh);
      if (fresh.status === "draft") {
        setEdited(true);
        again();
      }
      return;
    }
    const r = isFailure(fresh) ? { code: fresh } : await sendBroadcast(b.id, n);
    setBusy(false);
    setAsking(false);
    if (!isProblem(r)) return onStarted(r);
    if (r.code === "audience_changed" && r.preview) {
      setPreview(r.preview);
      return setChanged(true);
    }
    // An unclear failure may still have started it: show what brain has now.
    const now = await getBroadcast(b.id);
    if (!isFailure(now) && now.status !== "draft") return onStarted(now);
    setProblem(r.code);
  }

  const p = isFailure(preview) ? null : preview;
  const n = p?.reachable ?? 0;
  const blocked = !p ? null : n === 0 ? "Nobody can get this right now, so there is nothing to send." : n > MAX_RECIPIENTS ? `A broadcast goes to at most ${MAX_RECIPIENTS} people. Edit the draft to pick a smaller tag or one network.` : null;
  const first = p?.sample[0]?.display_name;
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 lg:items-start">
        <section aria-label="Who gets it" className="card grid content-start gap-4 p-5">
          <h3 className="label">Review and send</h3>
          {preview === null ? (
            <SkeletonRows label="Counting who can get this..." rows={4} className="" />
          ) : isFailure(preview) ? (
            <LoadFailed what="the count" retry={again} className="">
              The people couldn&apos;t be counted. {say(preview)}
            </LoadFailed>
          ) : (
            <div className="enter grid gap-4">
              {changed && (
                <p role="alert" className="tone rounded-lg px-3 py-2 text-sm font-bold" data-approval="pending">
                  The people who can get this changed while you were looking, so nothing was sent. These are the new numbers. Check them, then send again.
                </p>
              )}
              <p data-testid="reach" className="font-display text-2xl font-extrabold tracking-tight">
                {preview.total === 0 ? `Nobody is tagged ${b.tag} on ${b.platform ? platformName(b.platform) : "these networks"}.` : `${n} of ${people(preview.total)} will get this`}
              </p>
              {breakdown(preview).length > 0 && (
                <div className="grid gap-1">
                  <h4 className="text-sm font-bold">Who will not get it</h4>
                  <ul aria-label="Who will not get it" className="grid gap-1 text-sm text-ink-soft">
                    {breakdown(preview).map((r) => (
                      <li key={r.reason}>
                        <strong className="text-ink tabular-nums">{r.count}</strong> {r.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {n > 0 && (
                <div className="grid gap-1">
                  <h4 className="text-sm font-bold">By network</h4>
                  <ul aria-label="By network" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {preview.by_platform.map((x) => (
                      <li key={x.platform} className="flex items-center gap-1.5">
                        <Network id={x.platform} /> <strong className="tabular-nums">{x.reachable}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.sample.length > 0 && (
                <div className="grid gap-1">
                  <h4 className="text-sm font-bold">For example</h4>
                  <ul aria-label="For example" className="flex flex-wrap gap-1.5">
                    {preview.sample.map((s) => (
                      <li key={s.contact_id} className="badge tone text-ink">
                        {s.display_name || "No name"}
                        <span className="font-normal text-ink-soft">{platformName(s.platform)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
        <Message title={first ? `As ${first} will see it` : "As it will look"} text={example(b.text, first)} />
      </div>
      <section aria-label="Send" className="card grid gap-3 p-5">
        {asking && p ? (
          <Confirm
            id="broadcast-send"
            title={`Send to ${people(n)}?`}
            about={`Each of them gets this message as a DM, starting now. A sent message can't be taken back.`}
            yes={`Yes, send to ${people(n)}`}
            no="Not yet"
            busy={busy}
            onYes={() => send(n)}
            onNo={() => setAsking(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" disabled={!p || blocked !== null} aria-describedby={blocked ? "broadcast-blocked" : undefined} onClick={() => setAsking(true)}>
              <Icon name="send" className="size-4" />
              {p ? `Send to ${people(n)}` : "Send"}
            </button>
            <Link href={`/broadcasts/${b.id}?edit=1`} className="btn btn-secondary">
              Edit draft
            </Link>
            <button type="button" className="btn btn-quiet" disabled={preview === null} onClick={again}>
              Count again
            </button>
          </div>
        )}
        {blocked && (
          <p id="broadcast-blocked" className="text-sm font-bold text-signal-deep">
            {blocked}
          </p>
        )}
        {edited && (
          <p role="alert" className="waitlist-error">
            Someone changed this draft while you were reviewing it. Nothing was sent. Read the message again, then send.
          </p>
        )}
        {problem && (
          <p role="alert" className="waitlist-error">
            {say(problem)}
          </p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-ink-soft hover:text-ink">Why some people are left out</summary>
          <div className="pt-2">
            <Rules />
          </div>
        </details>
        <Delete b={b} onDeleted={onDeleted} />
      </section>
    </>
  );
}

// A broadcast that was started: where it stands, Cancel and Resume, and who got it.
function Started({ b, canManage, onChange, onDeleted }: { b: Broadcast; canManage: boolean; onChange: (b: Broadcast) => void; onDeleted: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<"cancel" | "resume" | null>(null);
  const [problem, setProblem] = useState<Failure | null>(null);
  const live = b.status === "sending" || b.status === "paused";
  async function act(key: "cancel" | "resume") {
    flushSync(() => {
      setProblem(null);
      setBusy(key);
    });
    const r = await (key === "cancel" ? cancelBroadcast(b.id) : resumeBroadcast(b.id));
    setBusy(null);
    setAsking(false);
    if (isFailure(r)) return setProblem(r);
    onChange(r);
  }
  return (
    <>
      {b.status === "paused" && (
        <section role="alert" aria-label="Paused" className="card card-danger grid gap-2 p-5">
          <h3 className={`flex items-center gap-2 ${heading}`}>
            <Icon name="warning" className="size-5 text-signal-deep" />
            This broadcast paused itself
          </h3>
          <p data-testid="pause-reason" className="font-bold break-words">
            {b.pause_reason || "A network refused it or slowed it down."}
          </p>
          <p className="text-sm text-ink-soft">
            Nothing more goes out until someone resumes it. {people(b.counts.pending)} still {b.counts.pending === 1 ? "waits" : "wait"}. The people it failed for are not tried again.
          </p>
          {canManage && !asking && (
            <button type="button" className="btn btn-primary btn-sm justify-self-start" disabled={busy !== null} onClick={() => act("resume")}>
              {busy === "resume" ? "Resuming..." : "Resume sending"}
            </button>
          )}
        </section>
      )}
      <section aria-label="Status" className="card grid gap-3 p-5">
        <Progress counts={b.counts} />
        <p className="text-sm text-ink-soft">
          {b.started_at && (
            <>
              Started <time dateTime={b.started_at}>{when(b.started_at)}</time>.{" "}
            </>
          )}
          {b.finished_at && (
            <>
              {b.status === "cancelled" ? "Cancelled" : "Finished"} <time dateTime={b.finished_at}>{when(b.finished_at)}</time>.{" "}
            </>
          )}
          {b.status === "sending" && "Going out a few at a time. These numbers refresh every 10 seconds."}
        </p>
        {canManage &&
          live &&
          (asking ? (
            <Confirm
              id="broadcast-cancel"
              title="Cancel this broadcast?"
              about={`${people(b.counts.pending)} still waiting will not get it. Messages already sent stay sent, and a cancelled broadcast can't be started again.`}
              yes="Yes, cancel broadcast"
              no="Keep it"
              danger
              busy={busy === "cancel"}
              onYes={() => act("cancel")}
              onNo={() => setAsking(false)}
            />
          ) : (
            <button type="button" className="btn btn-danger-outline btn-sm justify-self-start" disabled={busy !== null} onClick={() => setAsking(true)}>
              Cancel broadcast
            </button>
          ))}
        {problem && (
          <p role="alert" className="waitlist-error">
            {say(problem)}
          </p>
        )}
      </section>
      <Message title="Message" text={b.text} />
      {canManage && <Recipients b={b} />}
      {canManage && !live && (
        <div className="card p-5 pt-1">
          <Delete b={b} onDeleted={onDeleted} />
        </div>
      )}
    </>
  );
}

const FILTERS: (RecipientStatus | null)[] = [null, "pending", "sent", "skipped", "failed"];
type Rows = { filter: RecipientStatus | null; items: Recipient[]; next: string | null; more: boolean };

// Who the broadcast went to, 100 a page, by status.
function Recipients({ b }: { b: Broadcast }) {
  const [filter, setFilter] = useState<RecipientStatus | null>(null);
  const [loaded, setLoaded] = useState<Rows | { filter: RecipientStatus | null; failed: Failure } | null>(null);
  const [more, setMore] = useState<Failure | "loading" | null>(null);
  const [tries, setTries] = useState(0);
  // The first page follows the progress, unless more pages were loaded: those rows stay as they are.
  const settled = b.counts.sent + b.counts.skipped + b.counts.failed;
  useEffect(() => {
    let live = true;
    listRecipients(b.id, filter).then((r) => {
      if (!live) return;
      setLoaded((l) => (l && "items" in l && l.filter === filter && l.more ? l : isFailure(r) ? { filter, failed: r } : { filter, items: r.items, next: r.next_cursor, more: false }));
    });
    return () => {
      live = false;
    };
  }, [b.id, b.status, filter, settled, tries]);

  const rows = loaded?.filter === filter ? loaded : null;
  async function loadMore() {
    if (!rows || !("items" in rows) || !rows.next) return;
    setMore("loading");
    const r = await listRecipients(b.id, filter, rows.next);
    if (isFailure(r)) return setMore(r);
    setMore(null);
    setLoaded((l) => (l && "items" in l && l.filter === filter ? { filter, items: [...l.items, ...r.items], next: r.next_cursor, more: true } : l));
  }
  const count = (f: RecipientStatus | null) => (f === null ? b.counts.total : f === "sending" || f === "delivering" ? 0 : b.counts[f]);

  return (
    <section aria-label="Recipients" className="grid gap-3">
      <h3 className={heading}>Recipients</h3>
      <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f ?? "all"} type="button" aria-pressed={filter === f} className={chip(filter === f)} onClick={() => setFilter(f)}>
            {f ? recipientStatusName[f] : "All"} <span className="font-normal tabular-nums opacity-70">{count(f)}</span>
          </button>
        ))}
      </div>
      {rows === null ? (
        <SkeletonRows label="Loading recipients..." rows={4} tall />
      ) : "failed" in rows ? (
        <LoadFailed
          what="recipients"
          retry={() => {
            setLoaded(null);
            setTries((n) => n + 1);
          }}
        >
          The recipients couldn&apos;t be loaded. {say(rows.failed)}
        </LoadFailed>
      ) : rows.items.length === 0 ? (
        <EmptyState title={filter ? `Nobody is ${recipientStatusName[filter].toLowerCase()}.` : "No recipients."} />
      ) : (
        <>
          <div className="enter card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-2 font-bold">
                    Person
                  </th>
                  <th scope="col" className="px-4 py-2 font-bold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-bold">
                    Why
                  </th>
                  <th scope="col" className="hidden px-4 py-2 font-bold sm:table-cell">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 border-t border-ink/10">
                {rows.items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      {r.contact_id ? (
                        <Link href={`/contacts?contact=${encodeURIComponent(r.contact_id)}`} className="font-bold hover:underline">
                          {r.display_name || (r.handle ? `@${r.handle}` : "No name")}
                        </Link>
                      ) : (
                        <span className="text-ink-soft">Deleted contact</span>
                      )}
                      {r.platform && (
                        <span className="block text-xs text-ink-soft">
                          {r.handle && r.display_name ? `@${r.handle}, ` : ""}
                          {platformName(r.platform)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="badge tone" data-status={{ sent: "sent", failed: "failed", sending: "running", delivering: "running", pending: undefined, skipped: undefined }[r.status]}>
                        {recipientStatusName[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-ink-soft">{reasonText(r.reason)}</td>
                    <td className="hidden px-4 py-2 whitespace-nowrap text-ink-soft sm:table-cell">
                      <time dateTime={r.updated_at} title={when(r.updated_at)}>
                        {ago(r.updated_at)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.next && (
            <button type="button" className="btn btn-secondary btn-sm justify-self-start" disabled={more === "loading"} onClick={loadMore}>
              {more === "loading" ? "Loading..." : "Load more"}
            </button>
          )}
          {isFailure(more) && (
            <p role="alert" className="waitlist-error">
              More recipients couldn&apos;t be loaded. {say(more)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
