"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { listConnections, type Connection } from "@/lib/connections";
import {
  checkFeed,
  createFeed,
  DEFAULT_TEMPLATE,
  deleteFeed,
  feedField,
  feedHost,
  feedInput,
  feedPlatforms,
  feedText,
  fillTemplate,
  isProblem,
  listFeeds,
  MAX_TEMPLATE,
  modes,
  modeSummary,
  PLACEHOLDERS,
  updateFeed,
  type Feed,
  type FeedField,
  type FeedMode,
  type Problem,
} from "@/lib/feeds";
import { relativeTime } from "@/lib/inbox";
import { listSets, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { platformName, platforms as allPlatforms } from "@/components/platform-icons";
import { PlatformMark } from "@/components/posts";
import { TeamLink as Link } from "@/components/team-link";
import { linkButton, problemText } from "@/components/team-ui";
import { EmptyState, Icon, LoadFailed, Skeleton } from "@/components/ui";

const say = (p: Problem): ReactNode => feedText(p, platformName) ?? problemText(p.code);
const order = allPlatforms.map((p) => p.id);
const warning = "tone rounded-lg px-3 py-2 text-sm font-bold";

function lastChecked(f: Feed) {
  if (!f.last_checked_at) return "Not checked yet";
  const ago = relativeTime(f.last_checked_at);
  return `Last checked ${ago === "now" ? "just now" : ago}`;
}

export function FeedsPage() {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const [feeds, setFeeds] = useState<Feed[] | Problem | null>(null);
  const [sets, setSets] = useState<SocialSet[]>([]);
  const [accounts, setAccounts] = useState<Connection[]>([]);
  // The feed in the form, or "new".
  const [editing, setEditing] = useState<Feed | "new" | null>(null);
  // What the last action said, shown in the card of feed `id` ("" for the page).
  const [note, setNote] = useState<{ id: string; text: ReactNode; bad: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    // The sets and accounts only name things and fill the form, so a failed one still shows the feeds.
    Promise.all([listFeeds(), listSets(), listConnections()]).then(([f, s, a]) => {
      if (Array.isArray(s)) setSets(s);
      if (Array.isArray(a)) setAccounts(a);
      setFeeds(f);
    });
  }, [tries]);

  const put = (f: Feed) => setFeeds((l) => (Array.isArray(l) ? (l.some((x) => x.id === f.id) ? l.map((x) => (x.id === f.id ? f : x)) : [...l, f]) : l));

  async function act(f: Feed, key: string, call: () => Promise<Feed | "ok" | Problem>, ok: (r: Feed | "ok") => string) {
    flushSync(() => {
      setNote(null);
      setBusy(`${key}:${f.id}`);
    });
    const r = await call();
    setBusy(null);
    if (isProblem(r)) return setNote({ id: f.id, text: say(r), bad: true });
    if (r === "ok") setFeeds((l) => (Array.isArray(l) ? l.filter((x) => x.id !== f.id) : l));
    else put(r);
    setNote({ id: r === "ok" ? "" : f.id, text: ok(r), bad: false });
  }

  if (feeds === null)
    return (
      <div role="status" className="grid gap-3">
        <span className="sr-only">Loading feeds...</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card flex items-start gap-4 p-5">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <span className="grid flex-1 gap-2.5 py-0.5">
              <Skeleton className={`h-3.5 ${i % 2 ? "w-1/3" : "w-1/2"}`} />
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/4" />
            </span>
          </div>
        ))}
      </div>
    );
  if (isProblem(feeds))
    return (
      <LoadFailed
        what="feeds"
        retry={() => {
          setFeeds(null);
          setTries((n) => n + 1);
        }}
      >
        Feeds couldn&apos;t be loaded. {say(feeds)}
      </LoadFailed>
    );

  const setName = (id: string) => sets.find((s) => s.id === id)?.name ?? "A set that no longer exists";

  return (
    <section aria-labelledby="feeds-heading" className="grid gap-4">
      <h2 id="feeds-heading" className="sr-only">
        Your feeds
      </h2>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-ink-soft">
          A feed watches a blog or site&apos;s RSS link and turns each new item into a post for one of your sets. Feeds are checked every 15 minutes.
        </p>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            <Icon name="plus" className="size-4" />
            Add feed
          </button>
        )}
      </div>
      {!canManage && <p className="text-ink-soft">Only team owners and admins can add or change feeds.</p>}
      {note?.id === "" && (
        <p role="status" className="waitlist-done">
          {note.text}
        </p>
      )}
      {feeds.length === 0 ? (
        <EmptyState
          title="No feeds yet."
          action={
            canManage && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
                Add your first feed
              </button>
            )
          }
        >
          Add your blog&apos;s RSS link and every new article becomes a draft, a queued post or a post right away.
        </EmptyState>
      ) : (
        <ul className="enter grid gap-3">
          {feeds.map((f) => {
            const [host, rest] = feedHost(f.url);
            return (
              <li key={f.id} aria-label={f.url} className="card grid gap-3 p-5">
                <div className="flex items-start gap-4">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${f.active ? "bg-signal/10 text-signal-deep" : "bg-ink/5 text-ink-soft"}`}>
                    <Icon name="rss" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="break-all">
                      <strong>{host}</strong>
                      <span className="text-ink-soft">{rest}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.95rem]">
                      <span>{setName(f.social_set_id)}</span>
                      <span className="flex items-center gap-1.5">
                        {f.platforms.map((p) => (
                          <span key={p}>
                            <PlatformMark platform={p} className="size-4" />
                          </span>
                        ))}
                      </span>
                      <span>{modeSummary(f.mode)}</span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      {f.items_posted} {f.items_posted === 1 ? "post" : "posts"} made. {lastChecked(f)}.
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={f.active}
                      aria-label={`${host} feed`}
                      disabled={busy !== null}
                      onClick={() => act(f, "switch", () => updateFeed(f.id, { ...feedInput(f), active: !f.active }), (r) => `The feed is ${r !== "ok" && r.active ? "on" : "off"}.`)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-progress ${f.active ? "bg-ink" : "bg-ink/20"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-1 left-1 size-5 rounded-full bg-paper transition-transform motion-reduce:transition-none ${f.active ? "translate-x-5 bg-signal" : ""}`}
                      />
                    </button>
                  ) : (
                    <span className="badge tone" data-status={f.active ? "sent" : undefined}>
                      {f.active ? "On" : "Off"}
                    </span>
                  )}
                </div>
                {f.last_error && (
                  <p className={warning} data-approval="pending">
                    Problem at the last check: {f.last_error}
                  </p>
                )}
                {note?.id === f.id && (
                  <p role={note.bad ? "alert" : "status"} className={note.bad ? "waitlist-error" : "text-sm font-bold"}>
                    {note.text}
                  </p>
                )}
                {canManage &&
                  (confirming === f.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span id={`feed-delete-${f.id}`} className="text-sm">
                        Delete this feed? The posts it made stay.
                      </span>
                      <button
                        type="button"
                        className="btn btn-quiet btn-danger btn-sm"
                        aria-describedby={`feed-delete-${f.id}`}
                        autoFocus
                        disabled={busy !== null}
                        onClick={() => act(f, "delete", () => deleteFeed(f.id), () => `The feed for ${host} was deleted.`).then(() => setConfirming(null))}
                      >
                        {busy === `delete:${f.id}` ? "Deleting..." : "Yes, delete"}
                      </button>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirming(null)}>
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => act(f, "check", () => checkFeed(f.id), () => "Checked.")}>
                        <Icon name="repeat" className="size-4" />
                        {busy === `check:${f.id}` ? "Checking..." : "Check now"}
                      </button>
                      <button type="button" className="btn btn-quiet btn-sm" aria-label={`Edit the ${host} feed`} onClick={() => setEditing(f)}>
                        <Icon name="edit" className="size-4" />
                        Edit
                      </button>
                      <button type="button" className="btn btn-quiet btn-danger btn-sm" aria-label={`Delete the ${host} feed`} onClick={() => setConfirming(f.id)}>
                        <Icon name="trash" className="size-4" />
                        Delete
                      </button>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <FeedForm
          feed={editing === "new" ? null : editing}
          sets={sets}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={(f, created) => {
            put(f);
            setNote({ id: f.id, text: created ? "Feed added. Items already in it are skipped: only new ones become posts." : "Feed saved.", bad: false });
          }}
        />
      )}
    </section>
  );
}

// Add or edit a feed in a modal dialog. The browser keeps focus inside it and returns focus on close.
function FeedForm({
  feed,
  sets,
  accounts,
  onSaved,
  onClose,
}: {
  feed: Feed | null;
  sets: SocialSet[];
  accounts: Connection[];
  onSaved: (f: Feed, created: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const available = (id: string) => feedPlatforms(id, accounts, order);
  const firstSet = feed?.social_set_id ?? sets[0]?.id ?? "";
  const [url, setUrl] = useState(feed?.url ?? "");
  const [setId, setSetId] = useState(firstSet);
  const [ticked, setTicked] = useState<string[]>(feed?.platforms ?? available(firstSet));
  const [mode, setMode] = useState<FeedMode>(feed?.mode ?? "draft");
  const [template, setTemplate] = useState(feed?.template ?? DEFAULT_TEMPLATE);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const offered = available(setId);
  // A network the set lost since the feed was saved is not sent again.
  const platforms = ticked.filter((p) => offered.includes(p));

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (platforms.length === 0) return setProblem({ code: "invalid_feed", field: "platforms" });
    const input = { url: url.trim(), social_set_id: setId, platforms, template, mode };
    flushSync(() => {
      setProblem(null);
      setBusy(true);
    });
    const r = await (feed ? updateFeed(feed.id, { ...input, active: feed.active }) : createFeed(input));
    setBusy(false);
    if (isProblem(r)) return setProblem(r);
    onSaved(r, !feed);
    ref.current?.close();
  }

  // Puts a placeholder where the cursor is and keeps typing there.
  function insert(placeholder: string) {
    const el = templateRef.current;
    if (!el) return;
    const caret = el.selectionStart + placeholder.length;
    flushSync(() => setTemplate(template.slice(0, el.selectionStart) + placeholder + template.slice(el.selectionEnd)));
    el.focus();
    el.setSelectionRange(caret, caret);
  }

  const field = problem && feedField(problem);
  // The refusal under the field it is about.
  const err = (f: FeedField) =>
    problem && field === f ? (
      <p id={`feed-${f}-error`} role="alert" className="waitlist-error">
        {say(problem)}
      </p>
    ) : null;
  const bad = (f: FeedField) => ({ "aria-invalid": field === f || undefined, "aria-describedby": field === f ? `feed-${f}-error` : undefined });

  return (
    <dialog
      ref={ref}
      aria-labelledby="feed-form-title"
      onClose={onClose}
      className="m-auto w-[min(38rem,calc(100vw-2rem))] rounded-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <form onSubmit={onSave} className="grid gap-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="feed-form-title" className="font-display text-xl font-extrabold tracking-tight">
            {feed ? "Edit feed" : "Add a feed"}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="feed-url" className="label">
            Feed link
          </label>
          <input
            id="feed-url"
            type="url"
            required
            maxLength={2048}
            placeholder="https://example.com/feed.xml"
            className="field"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            {...bad("url")}
          />
          {err("url") ?? <p className="hint">The RSS or Atom link of a blog or site. Items already in it are skipped: only new ones become posts.</p>}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="feed-set" className="label">
            Set
          </label>
          <select
            id="feed-set"
            required
            className="field"
            value={setId}
            onChange={(e) => {
              setSetId(e.target.value);
              setTicked(available(e.target.value));
            }}
            {...bad("set")}
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {err("set")}
        </div>
        <fieldset className="grid gap-1">
          <legend className="label mb-1">Post to</legend>
          {offered.length === 0 ? (
            <p className="hint">
              This set has no account a feed can post to.{" "}
              <Link href="/connections" className={linkButton}>
                Connect an account
              </Link>{" "}
              or pick another set.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {offered.map((p) => (
                <label key={p} className="flex items-center gap-2">
                  <input type="checkbox" checked={ticked.includes(p)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, p] : t.filter((x) => x !== p)))} />
                  <PlatformMark platform={p} className="size-4" named />
                </label>
              ))}
            </div>
          )}
          {err("platforms")}
          <p className="hint">TikTok and YouTube are left out: they take video only, and a feed item has none. Instagram skips an item without a picture.</p>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="label mb-1">When a new item appears</legend>
          {modes.map((m) => (
            <label key={m.id} className="flex items-start gap-2">
              <input type="radio" name="feed-mode" className="mt-1" checked={mode === m.id} onChange={() => setMode(m.id)} />
              <span>
                <strong className="block">{m.label}</strong>
                <span className="hint block">{m.hint}</span>
              </span>
            </label>
          ))}
          {mode === "now" && (
            <p className={warning} data-approval="pending">
              Careful: items go out without anyone reviewing them, up to 5 per check.
            </p>
          )}
          {err("mode")}
        </fieldset>
        <div className="grid gap-1.5">
          <label htmlFor="feed-template" className="label">
            Post text
          </label>
          <textarea
            id="feed-template"
            ref={templateRef}
            required
            rows={3}
            maxLength={MAX_TEMPLATE}
            className="field"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            {...bad("template")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="hint">Insert:</span>
            {PLACEHOLDERS.map((p) => (
              <button key={p} type="button" className="btn btn-secondary btn-sm" aria-label={`Insert ${p}`} onClick={() => insert(p)}>
                {p}
              </button>
            ))}
          </div>
          {err("template")}
          <div role="group" aria-label="Preview" className="rounded-lg bg-ink/5 p-3">
            <p className="hint mb-1">Preview with a sample item</p>
            <p className="text-sm break-words whitespace-pre-wrap">
              {fillTemplate(template)}
            </p>
          </div>
        </div>
        {problem && !field && (
          <p role="alert" className="waitlist-error">
            {say(problem)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : feed ? "Save feed" : "Add feed"}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => ref.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
