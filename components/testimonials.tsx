"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { TeamLink as Link } from "@/components/team-link";
import { useTeamRouter as useRouter } from "@/components/team-link";
import { useSession } from "@/components/app-shell";
import { linkButton, problemText } from "@/components/team-ui";
import { EmptyState, Icon, LoadFailed, Skeleton } from "@/components/ui";
import { manages } from "@/lib/teams";
import { platformName } from "@/components/platform-icons";
import {
  addTestimonial,
  attribution,
  changeTestimonial,
  deleteTestimonial,
  isProblem,
  listTestimonials,
  markdownQuote,
  PERMISSIONS,
  permissionName,
  permissionNote,
  quoteText,
  startPost,
  type Permission,
  type Problem,
  type Testimonial,
} from "@/lib/testimonials";

// What brain's own refusals mean here; the rest goes through the shared messages.
export function testimonialText(p: Problem): string | null {
  switch (p.code) {
    case "not_a_comment":
      return "Only a comment or a mention can become a testimonial. A DM stays in the Inbox.";
    case "already_testimonial":
      return "This comment is already a testimonial. Open Testimonials to find it.";
    case "invalid_testimonial":
      return p.field === "permission"
        ? "Pick Not asked, Granted or Declined."
        : p.field === "note"
          ? "That note is too long. Keep it under 1,000 characters."
          : "Write the quote first, and keep it under 5,000 characters.";
    case "forbidden":
      return "Only the member who added it, an owner or an admin can change this testimonial.";
    default:
      return null;
  }
}

const say = (p: Problem) => testimonialText(p) ?? problemText(p.code);
const NETWORK = (platform: string | null) => (platform ? platformName(platform) : "the network");

// One section's status: the action in flight, brain's last refusal in words, and what worked.
// It keeps the whole `Problem` so a named `field` can be worded, which the shared Status cannot.
function useAsk() {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function run<T>(key: string, call: () => Promise<T | Problem>, onOk: (r: T) => string | void) {
    setBusy(key);
    setProblem(null);
    setDone(null);
    const r = await call();
    setBusy(null);
    if (isProblem(r)) {
      setProblem(r);
      return false;
    }
    const said = onOk(r as T);
    if (said) setDone(said);
    return true;
  }
  return { busy, problem, done, run };
}

function AskStatus({ ask }: { ask: ReturnType<typeof useAsk> }) {
  if (ask.problem) {
    return (
      <p role="alert" className="waitlist-error">
        {say(ask.problem)}
      </p>
    );
  }
  if (ask.done) {
    return (
      <p role="status" className="waitlist-done">
        {ask.done}
      </p>
    );
  }
  return null;
}

// "Add as testimonial" in the Comments reader: keeps the open comment or mention as a quote.
// `added` is the one already made from this item, when the list knows it.
export function AddAsTestimonial({ itemId, kind, added }: { itemId: string; kind: string; added?: Testimonial }) {
  const ask = useAsk();
  const [made, setMade] = useState<Testimonial | null>(added ?? null);
  // A DM or a follow, like or repost has nothing to quote.
  if (kind !== "comment" && kind !== "mention") return null;
  const add = () =>
    ask.run("add", () => addTestimonial(itemId), (t) => {
      setMade(t);
      return "Added to Testimonials.";
    });
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {made ? (
        <Link href="/testimonials" className="text-sm font-bold underline decoration-signal decoration-2 underline-offset-4">
          In Testimonials
        </Link>
      ) : (
        <button
          id="add-testimonial"
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={ask.busy !== null}
          onClick={add}
        >
          {ask.busy === "add" ? "Adding..." : "Add as testimonial"}
        </button>
      )}
      <AskStatus ask={ask} />
    </span>
  );
}

// One card: the words, who said them, the permission and what can be done with it.
function Card({
  t,
  editable,
  onChanged,
  onDeleted,
}: {
  t: Testimonial;
  // The member who added it, an owner or an admin.
  editable: boolean;
  onChanged: (t: Testimonial) => void;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const ask = useAsk();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(t.text);
  const [note, setNote] = useState(t.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  const setPermission = (permission: Permission) =>
    ask.run("permission", () => changeTestimonial(t.id, { permission }), (r) => {
      onChanged(r);
      return `Marked ${permissionName[permission].toLowerCase()}.`;
    });

  async function copy(what: "quote" | "markdown") {
    const value = what === "quote" ? quoteText(t) : markdownQuote(t);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what === "quote" ? "Quote copied." : "Markdown copied.");
    } catch {
      setCopied("This browser would not copy. Select the quote and copy it yourself.");
    }
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    ask.run("save", () => changeTestimonial(t.id, { text, note }), (r) => {
      onChanged(r);
      setEditing(false);
      return "Testimonial saved.";
    });
  }

  return (
    <li className="card grid min-w-0 content-start gap-3 p-4">
      <blockquote className="border-l-2 border-signal pl-3 text-[15px] whitespace-pre-wrap break-words">{t.text}</blockquote>
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
        <span className="font-bold text-ink">{attribution(t) || "Unknown author"}</span>
        {t.source_url && (
          <a href={t.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold text-ink-soft hover:text-ink">
            View on {NETWORK(t.platform)}
            <Icon name="external" className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </p>
      {t.note && <p className="text-sm text-ink-soft">Note: {t.note}</p>}

      {editing ? (
        <form onSubmit={save} className="grid gap-2">
          <label htmlFor={`quote-${t.id}`} className="label">
            Quote
          </label>
          <textarea id={`quote-${t.id}`} ref={textRef} rows={3} className="field" value={text} onChange={(e) => setText(e.target.value)} />
          <label htmlFor={`note-${t.id}`} className="label">
            Note, only you see it
          </label>
          <textarea id={`note-${t.id}`} rows={2} className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={ask.busy !== null || !text.trim()}>
              {ask.busy === "save" ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setEditing(false);
                setText(t.text);
                setNote(t.note ?? "");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`permission-${t.id}`} className="label">
              Permission
            </label>
            <select
              id={`permission-${t.id}`}
              className="field w-auto py-1 text-sm"
              value={t.permission}
              disabled={!editable || ask.busy !== null}
              onChange={(e) => setPermission(e.target.value as Permission)}
            >
              {PERMISSIONS.map((p) => (
                <option key={p} value={p}>
                  {permissionName[p]}
                </option>
              ))}
            </select>
            <span className="text-sm text-ink-soft">
              {t.permission === "granted" ? "They said yes to it being reused." : t.permission === "declined" ? "They said no. Keep it here, do not post it." : "Ask before you reuse it."}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className={linkButton} onClick={() => copy("quote")}>
              Copy quote
            </button>
            <button type="button" className={linkButton} onClick={() => copy("markdown")}>
              Copy as Markdown
            </button>
            {t.permission === "granted" && (
              <button type="button" className={linkButton} onClick={() => router.push(startPost(t))}>
                Post it
              </button>
            )}
            {editable && (
              <button type="button" className={linkButton} onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            {editable && !confirming && (
              <button type="button" className="font-bold text-ink-soft hover:text-signal-deep" onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
          </div>
          {copied && (
            <p role="status" className="hint">
              {copied}
            </p>
          )}
          {confirming && (
            <div role="alertdialog" aria-labelledby={`delete-title-${t.id}`} className="grid gap-2 rounded-xl border border-ink/15 bg-canvas p-3">
              <strong id={`delete-title-${t.id}`}>Delete this testimonial?</strong>
              <p className="text-sm text-ink-soft">Its copy of the words goes with it. The comment itself stays where it is.</p>
              <span className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-danger-solid btn-sm"
                  disabled={ask.busy !== null}
                  onClick={() => ask.run("delete", () => deleteTestimonial(t.id), () => onDeleted(t.id))}
                >
                  {ask.busy === "delete" ? "Deleting..." : "Yes, delete"}
                </button>
                <button type="button" className="btn btn-quiet btn-sm" disabled={ask.busy !== null} onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </span>
            </div>
          )}
        </>
      )}
      <AskStatus ask={ask} />
    </li>
  );
}

const FILTERS: { id: Permission | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "granted", label: "Granted" },
  { id: "not_asked", label: "Not asked" },
  { id: "declined", label: "Declined" },
];

export function TestimonialsPage() {
  const { user } = useSession();
  const [rows, setRows] = useState<Testimonial[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Permission | "all">("all");
  const [paging, setPaging] = useState(false);
  const [reloads, setReloads] = useState(0);
  const me = user.current_team;

  useEffect(() => {
    let live = true;
    listTestimonials().then((r) => {
      if (!live) return;
      if (isProblem(r)) {
        setFailed(true);
        return setRows([]);
      }
      setFailed(false);
      setRows(r.items);
      setNext(r.next_cursor);
    });
    return () => {
      live = false;
    };
  }, [reloads]);

  async function more() {
    if (!next) return;
    setPaging(true);
    const r = await listTestimonials(next);
    setPaging(false);
    if (isProblem(r)) return setFailed(true);
    setRows((l) => [...(l ?? []), ...r.items.filter((t) => !(l ?? []).some((x) => x.id === t.id))]);
    setNext(r.next_cursor);
  }

  const shown = (rows ?? []).filter((t) => filter === "all" || t.permission === filter);
  const manager = manages(me.role);
  const editable = (t: Testimonial) => manager || t.created_by === user.id;

  return (
    <div className="grid gap-5">
      <p className="max-w-2xl text-sm text-ink-soft">
        The kind words people wrote you, kept to reuse. {permissionNote}
      </p>

      {rows === null ? (
        <div className="grid gap-3">
          {[0, 1].map((n) => (
            <Skeleton key={n} className="block h-32 rounded-2xl" />
          ))}
          <span role="status" className="sr-only">
            Loading testimonials...
          </span>
        </div>
      ) : failed && rows.length === 0 ? (
        <LoadFailed what="testimonials" retry={() => setReloads((n) => n + 1)}>
          The testimonials could not be loaded.
        </LoadFailed>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No testimonials yet"
          action={
            <Link href="/comments" className="btn btn-primary btn-sm">
              Open Comments
            </Link>
          }
        >
          Open a comment or a mention on the Comments page and choose Add as testimonial. Its words and author are kept
          here, and you can track whether the person agreed to them being reused.
        </EmptyState>
      ) : (
        <>
          <div role="group" aria-label="Filter by permission" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-3 py-1 text-sm font-bold ${filter === f.id ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p role="status" className="card px-4 py-3 text-ink-soft">
              No testimonial is {filter === "granted" ? "granted yet" : filter === "declined" ? "declined" : "waiting for an answer"}.
            </p>
          ) : (
            <ul aria-label="Testimonials" className="grid gap-3">
              {shown.map((t) => (
                <Card
                  key={t.id}
                  t={t}
                  editable={editable(t)}
                  onChanged={(r) => setRows((l) => (l ?? []).map((x) => (x.id === r.id ? r : x)))}
                  onDeleted={(id) => setRows((l) => (l ?? []).filter((x) => x.id !== id))}
                />
              ))}
            </ul>
          )}
          {next && filter === "all" && (
            <button type="button" className="btn btn-secondary justify-self-start" disabled={paging} onClick={more}>
              {paging ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
