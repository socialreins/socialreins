"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import { TeamLink as Link } from "@/components/team-link";
import { problemText } from "@/components/team-ui";
import { Icon } from "@/components/ui";
import { pageMedia } from "@/lib/posts";
import {
  addMedia,
  createSnippet,
  deleteMedia,
  deleteSnippet,
  httpsUrl,
  insertAt,
  isProblem,
  libraryText,
  listMedia,
  listSnippets,
  mediaLabel,
  renameMedia,
  updateSnippet,
  type MediaItem,
  type Problem,
  type Snippet,
  type SnippetKind,
} from "@/lib/library";

const say = (p: Problem) => libraryText(p) ?? problemText(p.code);
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const byName = (a: Snippet, b: Snippet) => a.name.localeCompare(b.name);
const kindTitle: Record<SnippetKind, string> = { caption: "Captions", hashtags: "Hashtag groups" };
const kindOne: Record<SnippetKind, string> = { caption: "caption", hashtags: "hashtag group" };

// A library item as a tile: image links and Drive or Dropbox shares as their picture (pageMedia, as the public
// page shows them), anything else, or a picture that fails to load, as a file tile with the host.
export function MediaThumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  const m = pageMedia([url])[0];
  if (m?.kind === "image" && !broken)
    // eslint-disable-next-line @next/next/no-img-element -- any https host, so next/image can't optimise it.
    return <img src={m.src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="aspect-square w-full rounded-md bg-ink/5 object-cover" />;
  return (
    <span className="grid aspect-square w-full place-items-center rounded-md bg-ink/5 p-2 text-center text-xs text-ink-soft">
      <span className="grid min-w-0 justify-items-center gap-1">
        <Icon name="image" className="size-6" />
        <span className="max-w-full truncate">{host(url)}</span>
      </span>
    </span>
  );
}

export function LibraryPage() {
  const [tab, setTab] = useState<"media" | "snippets">("media");
  const tabs = [
    { id: "media", label: "Media" },
    { id: "snippets", label: "Snippets" },
  ] as const;
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? "media" : e.key === "End" ? "snippets" : tab === "media" ? "snippets" : "media";
    flushSync(() => setTab(next));
    document.getElementById(`library-tab-${next}`)?.focus();
  }
  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="Library" onKeyDown={onKey} className="flex gap-1 border-b border-[var(--line)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`library-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`library-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className="rounded-t-md px-3 py-2 text-sm font-bold text-ink-soft hover:bg-ink/[0.04] hover:text-ink aria-selected:text-ink aria-selected:shadow-[inset_0_-2px_0_var(--color-signal-deep)]"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={`library-panel-${tab}`} role="tabpanel" aria-labelledby={`library-tab-${tab}`} className="grid min-w-0 gap-5">
        {tab === "media" ? <MediaPanel /> : <SnippetsPanel />}
      </div>
    </div>
  );
}

// A status line: a refusal as an alert, a success that is announced.
function Line({ problem, done }: { problem?: Problem | null; done?: string | null }) {
  if (problem)
    return (
      <p role="alert" className="waitlist-error">
        {say(problem)}
      </p>
    );
  if (done)
    return (
      <p role="status" className="waitlist-done">
        {done}
      </p>
    );
  return null;
}

// One page of the library at a time, newest first, with Load more; `q` searches brain-side.
function useMedia(limit = 24) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [q, setQ] = useState("");

  async function load(query: string, after: string | null) {
    setLoading(true);
    setProblem(null);
    const r = await listMedia(query, after, limit);
    setLoading(false);
    if (isProblem(r)) return setProblem(r);
    setItems((list) => (after ? [...list, ...r.items] : r.items));
    setCursor(r.next_cursor);
  }
  useEffect(() => {
    // The first page, once; later loads come from search and Load more.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load("", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    items,
    setItems,
    cursor,
    loading,
    problem,
    q,
    search: (query: string) => {
      setQ(query);
      return load(query, null);
    },
    more: () => load(q, cursor),
  };
}

function SearchBox({ id, onSearch }: { id: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      role="search"
      className="flex gap-2"
      onSubmit={(e) => {
        // Stop here: inside the composer, React would carry the submit on to the post's own form.
        e.preventDefault();
        e.stopPropagation();
        onSearch(value);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Search media
      </label>
      <input id={id} type="search" className="field" placeholder="Search by name or link" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="btn btn-secondary">
        Search
      </button>
    </form>
  );
}

function MediaPanel() {
  const lib = useMedia();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [addProblem, setAddProblem] = useState<Problem | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setAdded(null);
    const link = httpsUrl(url);
    if (!link) return setAddProblem({ code: "invalid_media", field: "url" });
    setBusy(true);
    const r = await addMedia(link, name);
    setBusy(false);
    if (isProblem(r)) return setAddProblem(r);
    setAddProblem(null);
    lib.setItems((list) => [r, ...list]);
    setUrl("");
    setName("");
    setAdded(`Added ${mediaLabel(r)}.`);
  }

  function removed(item: MediaItem) {
    lib.setItems((list) => list.filter((x) => x.id !== item.id));
    // The deleted card took focus with it; the note says what happened and holds focus.
    flushSync(() => setNote(`Deleted ${mediaLabel(item)}.`));
    noteRef.current?.focus();
  }

  return (
    <>
      <section aria-labelledby="library-add" className="card grid gap-3 p-4 sm:p-5">
        <h2 id="library-add" className="text-base font-semibold">
          Add media
        </h2>
        <p className="hint">A public https link, or a Google Drive or Dropbox share link. Nothing is uploaded: the composer posts from the link.</p>
        <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-1.5">
            <label htmlFor="library-url" className="label">
              Link
            </label>
            <input id="library-url" type="url" inputMode="url" required placeholder="https://" className="field" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={addProblem?.field === "url" || undefined} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="library-name" className="label">
              Name <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input id="library-name" className="field" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={addProblem?.field === "name" || undefined} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Icon name="plus" className="size-4" />
            {busy ? "Adding..." : "Add to library"}
          </button>
        </form>
        <Line problem={addProblem} done={added} />
      </section>
      <section aria-labelledby="library-media" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="library-media" className="text-base font-semibold">
            Media
          </h2>
          <SearchBox id="library-search" onSearch={lib.search} />
        </div>
        {note && (
          <p ref={noteRef} tabIndex={-1} role="status" className="waitlist-done outline-none">
            {note}
          </p>
        )}
        {lib.problem && (
          <p role="alert" className="waitlist-error">
            The library couldn&apos;t be loaded. {say(lib.problem)}
          </p>
        )}
        {lib.items.length === 0 && !lib.loading && !lib.problem ? (
          <p className="rounded-md bg-ink/[0.03] p-4 text-sm text-ink-soft">{lib.q ? `Nothing matches "${lib.q}".` : "No media yet. Add a link above to reuse it in posts."}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {lib.items.map((item) => (
              <MediaCard key={item.id} item={item} onRenamed={(n) => lib.setItems((list) => list.map((x) => (x.id === n.id ? n : x)))} onDeleted={() => removed(item)} />
            ))}
          </ul>
        )}
        {lib.loading && <p className="text-ink-soft">Loading media...</p>}
        {lib.cursor && !lib.loading && (
          <button type="button" className="btn btn-secondary justify-self-center" onClick={lib.more}>
            Load more
          </button>
        )}
      </section>
    </>
  );
}

function MediaCard({ item, onRenamed, onDeleted }: { item: MediaItem; onRenamed: (item: MediaItem) => void; onDeleted: () => void }) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(item.name);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const renameRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const label = mediaLabel(item);

  function back(to: "rename" | "delete") {
    flushSync(() => setMode("view"));
    (to === "rename" ? renameRef : deleteRef).current?.focus();
  }

  async function onRename(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await renameMedia(item.id, name);
    setBusy(false);
    if (isProblem(r)) return setProblem(r);
    setProblem(null);
    onRenamed(r);
    setDone("Renamed.");
    back("rename");
  }

  async function onDelete() {
    setBusy(true);
    const r = await deleteMedia(item.id);
    setBusy(false);
    if (isProblem(r)) return setProblem(r);
    onDeleted();
  }

  async function copy() {
    setProblem(null);
    try {
      await navigator.clipboard.writeText(item.url);
      setDone("Link copied.");
    } catch {
      setDone(null);
      setProblem({ code: "error" });
    }
  }

  return (
    <li className="card grid min-w-0 content-start gap-2 p-2">
      <a href={item.url.startsWith("https://") ? item.url : undefined} target="_blank" rel="noreferrer" className="block" aria-label={`Open ${label}`}>
        <MediaThumb url={item.url} />
      </a>
      {mode === "rename" ? (
        <form onSubmit={onRename} onKeyDown={(e) => e.key === "Escape" && back("rename")} className="grid gap-1.5">
          <label htmlFor={`rename-${item.id}`} className="sr-only">
            New name for {label}
          </label>
          <input id={`rename-${item.id}`} className="field py-1 text-sm" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-1">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => back("rename")}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="truncate px-1 text-sm font-bold" title={item.url}>
          {label}
        </p>
      )}
      {mode === "delete" ? (
        <div className="grid gap-1.5 px-1">
          <p id={`delete-q-${item.id}`} className="text-sm">
            Delete {label}? Posts that use the link keep it.
          </p>
          <div className="flex gap-1">
            <button type="button" className="btn btn-quiet btn-danger btn-sm" aria-describedby={`delete-q-${item.id}`} autoFocus disabled={busy} onClick={onDelete}>
              {busy ? "Deleting..." : "Yes, delete"}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => back("delete")}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        mode === "view" && (
          <div className="flex flex-wrap gap-0.5">
            <button type="button" className="icon-btn" aria-label={`Copy link of ${label}`} title="Copy link" onClick={copy}>
              <Icon name="copy" className="size-4" />
            </button>
            <button
              ref={renameRef}
              type="button"
              className="icon-btn"
              aria-label={`Rename ${label}`}
              title="Rename"
              onClick={() => {
                setName(item.name);
                setProblem(null);
                setDone(null);
                setMode("rename");
              }}
            >
              <Icon name="edit" className="size-4" />
            </button>
            <button ref={deleteRef} type="button" className="icon-btn ml-auto hover:text-danger" aria-label={`Delete ${label}`} title="Delete" onClick={() => setMode("delete")}>
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        )
      )}
      <div className="px-1 text-xs">
        <Line problem={problem} done={done} />
      </div>
    </li>
  );
}

function SnippetsPanel() {
  return (
    <div className="grid gap-5">
      <p className="max-w-prose text-ink-soft">Text you reuse. In the composer, Insert snippet puts one at the cursor of the post text, a network&apos;s own text or the first comment.</p>
      <SnippetSection kind="caption" />
      <SnippetSection kind="hashtags" />
    </div>
  );
}

function SnippetSection({ kind }: { kind: SnippetKind }) {
  const [items, setItems] = useState<Snippet[] | Problem | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const headingId = `snippets-${kind}`;
  useEffect(() => {
    listSnippets(kind).then((r) => setItems(isProblem(r) ? r : r.items));
  }, [kind]);

  const list = Array.isArray(items) ? items : [];
  const put = (s: Snippet) => setItems([...list.filter((x) => x.id !== s.id), s].sort(byName));

  async function remove(s: Snippet) {
    const r = await deleteSnippet(s.id);
    if (isProblem(r)) return setProblem(r);
    setProblem(null);
    setConfirming(null);
    setItems(list.filter((x) => x.id !== s.id));
    flushSync(() => setNote(`Deleted ${s.name}.`));
    document.getElementById(`${headingId}-note`)?.focus();
  }

  return (
    <section aria-labelledby={headingId} className="card grid min-w-0 gap-4 p-4 sm:p-5">
      <h2 id={headingId} className="text-base font-semibold">
        {kindTitle[kind]}
      </h2>
      {note && (
        <p id={`${headingId}-note`} tabIndex={-1} role="status" className="waitlist-done outline-none">
          {note}
        </p>
      )}
      {items === null ? (
        <p className="text-ink-soft">Loading...</p>
      ) : isProblem(items) ? (
        <p role="alert" className="waitlist-error">
          The {kindTitle[kind].toLowerCase()} couldn&apos;t be loaded. {say(items)}
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-ink-soft">No {kindTitle[kind].toLowerCase()} yet.</p>
      ) : (
        <ul className="grid gap-2">
          {list.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="rounded-md border border-[var(--line)] p-3">
                <SnippetForm
                  kind={kind}
                  snippet={s}
                  onSaved={(n) => {
                    put(n);
                    setEditing(null);
                    setNote(`Saved ${n.name}.`);
                  }}
                  onCancel={() => {
                    flushSync(() => setEditing(null));
                    document.getElementById(`edit-${s.id}`)?.focus();
                  }}
                />
              </li>
            ) : (
              <li key={s.id} className="grid gap-1 rounded-md border border-[var(--line)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">{s.name}</h3>
                  {confirming === s.id ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <span id={`snippet-delete-q-${s.id}`} className="text-sm">
                        Delete {s.name}?
                      </span>
                      <button type="button" className="btn btn-quiet btn-danger btn-sm" aria-describedby={`snippet-delete-q-${s.id}`} autoFocus onClick={() => remove(s)}>
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => {
                          flushSync(() => setConfirming(null));
                          document.getElementById(`delete-${s.id}`)?.focus();
                        }}
                      >
                        Keep it
                      </button>
                    </span>
                  ) : (
                    <span className="flex gap-0.5">
                      <button id={`edit-${s.id}`} type="button" className="icon-btn" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => setEditing(s.id)}>
                        <Icon name="edit" className="size-4" />
                      </button>
                      <button id={`delete-${s.id}`} type="button" className="icon-btn hover:text-danger" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => setConfirming(s.id)}>
                        <Icon name="trash" className="size-4" />
                      </button>
                    </span>
                  )}
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink-soft">{s.body}</p>
              </li>
            ),
          )}
        </ul>
      )}
      <Line problem={problem} />
      {!isProblem(items) && items !== null && (
        <details className="group rounded-md border border-[var(--line)]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 p-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
            <Icon name="plus" className="size-4" />
            New {kindOne[kind]}
          </summary>
          <div className="border-t border-[var(--line)] p-3">
            <SnippetForm
              kind={kind}
              onSaved={(n) => {
                put(n);
                setNote(`Saved ${n.name}.`);
              }}
            />
          </div>
        </details>
      )}
    </section>
  );
}

function SnippetForm({ kind, snippet, onSaved, onCancel }: { kind: SnippetKind; snippet?: Snippet; onSaved: (s: Snippet) => void; onCancel?: () => void }) {
  const id = useId();
  const [name, setName] = useState(snippet?.name ?? "");
  const [body, setBody] = useState(snippet?.body ?? "");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const input = { kind, name: name.trim(), body };
    const r = snippet ? await updateSnippet(snippet.id, input) : await createSnippet(input);
    setBusy(false);
    if (isProblem(r)) return setProblem(r);
    setProblem(null);
    if (!snippet) {
      setName("");
      setBody("");
    }
    onSaved(r);
  }

  const chars = [...body].length;
  return (
    <form onSubmit={onSubmit} onKeyDown={(e) => e.key === "Escape" && onCancel?.()} className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="label">
          Name
        </label>
        <input id={`${id}-name`} required className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!!snippet} aria-invalid={problem?.code === "snippet_name_taken" || problem?.field === "name" || undefined} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-body`} className="label">
          {kind === "hashtags" ? "Hashtags" : "Text"}
        </label>
        <textarea
          id={`${id}-body`}
          required
          rows={kind === "hashtags" ? 2 : 4}
          className="field resize-y"
          placeholder={kind === "hashtags" ? "#launch #buildinpublic" : ""}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={`${id}-count`}
          aria-invalid={problem?.field === "body" || undefined}
        />
        <p id={`${id}-count`} className="hint tabular-nums">
          {chars === 1 ? "1 character" : `${chars.toLocaleString("en")} characters`}
        </p>
      </div>
      <Line problem={problem} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving..." : snippet ? "Save changes" : `Save ${kindOne[kind]}`}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// The composer's "Add from library": a modal picker of up to `remaining` items, appended in the order picked.
export function LibraryPicker({ remaining, of = "", onPick }: { remaining: number; of?: string; onPick: (urls: string[]) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  if (remaining <= 0) return null;
  return (
    <>
      <button
        ref={openRef}
        type="button"
        className="btn btn-secondary btn-sm justify-self-start"
        aria-haspopup="dialog"
        onClick={() => {
          flushSync(() => setOpen(true));
          ref.current?.showModal();
        }}
      >
        <Icon name="library" className="size-4" />
        Add from library<span className="sr-only">{of}</span>
      </button>
      {open &&
        createPortal(
          <dialog
            ref={ref}
            aria-labelledby={titleId}
            onClose={() => {
              setOpen(false);
              openRef.current?.focus();
            }}
            className="app-root m-auto w-[min(48rem,calc(100vw-1rem))] rounded-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40"
          >
            <Picker
              titleId={titleId}
              remaining={remaining}
              onClose={() => ref.current?.close()}
              onPick={(urls) => {
                onPick(urls);
                ref.current?.close();
              }}
            />
          </dialog>,
          document.body,
        )}
    </>
  );
}

function Picker({ titleId, remaining, onClose, onPick }: { titleId: string; remaining: number; onClose: () => void; onPick: (urls: string[]) => void }) {
  const lib = useMedia(24);
  const [picked, setPicked] = useState<string[]>([]);
  const full = picked.length >= remaining;
  const toggle = (url: string) => setPicked((list) => (list.includes(url) ? list.filter((u) => u !== url) : [...list, url]));
  return (
    <div className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-4 sm:p-6">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-xl font-extrabold tracking-tight">
            Add from library
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <SearchBox id={`${titleId}-search`} onSearch={lib.search} />
      </div>
      <div className="min-h-0 overflow-y-auto">
        {lib.problem && (
          <p role="alert" className="waitlist-error">
            The library couldn&apos;t be loaded. {say(lib.problem)}
          </p>
        )}
        {lib.items.length === 0 && !lib.loading && !lib.problem ? (
          <p className="text-sm text-ink-soft">
            {lib.q ? `Nothing matches "${lib.q}".` : <>The library is empty. Add media on the <Link href="/library" className="underline">Library</Link> page, or save a link here with Save to library.</>}
          </p>
        ) : (
          <fieldset>
            <legend className="sr-only">Media to add</legend>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {lib.items.map((item) => {
                const on = picked.includes(item.url);
                return (
                  <li key={item.id}>
                    <label className={`grid cursor-pointer gap-1 rounded-lg p-1.5 ring-1 ring-[var(--line)] has-checked:ring-2 has-checked:ring-[var(--color-signal-deep)] has-disabled:cursor-not-allowed has-disabled:opacity-50`}>
                      <MediaThumb url={item.url} />
                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                        <input type="checkbox" className="accent-[var(--color-signal-deep)]" checked={on} disabled={!on && full} onChange={() => toggle(item.url)} />
                        <span className="truncate">{mediaLabel(item)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
        {lib.loading && <p className="text-ink-soft">Loading media...</p>}
        {lib.cursor && !lib.loading && (
          <div className="mt-3 text-center">
            <button type="button" className="btn btn-secondary btn-sm" onClick={lib.more}>
              Load more
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={picked.length === 0} onClick={() => onPick(picked)}>
          {picked.length ? `Add ${picked.length}` : "Add"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
        <p className="hint ml-auto" aria-live="polite">
          {picked.length} of {remaining} picked{full ? ": that fills every free slot" : ""}.
        </p>
      </div>
    </div>
  );
}

// Saves one media link of the composer to the library.
export function SaveToLibrary({ url, label, onResult }: { url: string; label: string; onResult: (text: string, ok: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  async function save() {
    const link = httpsUrl(url);
    if (!link) return onResult("Only a public https link can go in the library.", false);
    setBusy(true);
    const r = await addMedia(link);
    setBusy(false);
    if (!isProblem(r)) return onResult(`Saved ${label.toLowerCase()} to the library.`, true);
    if (r.code === "already_in_library") return onResult(`${label} is already in the library.`, true);
    onResult(String(libraryText(r) ?? "It couldn't be saved. Try again in a moment."), false);
  }
  return (
    <button type="button" className="icon-btn mb-1" aria-label={`Save ${label.toLowerCase()} to library`} title="Save to library" disabled={busy || !url.trim()} onClick={save}>
      <Icon name="library" className="size-4" />
    </button>
  );
}

// "Insert snippet" beside a text box (by id): a menu of captions and hashtag groups; a choice goes in at the
// cursor and focus returns to the box. `value` and `onChange` are the box's own state.
export function SnippetMenu({ target, label, value, onChange }: { target: string; label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<Record<SnippetKind, Snippet[]> | Problem | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const items = () => [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  async function show() {
    flushSync(() => setOpen(true));
    const [c, h] = await Promise.all([listSnippets("caption"), listSnippets("hashtags")]);
    const next = isProblem(c) ? c : isProblem(h) ? h : { caption: c.items, hashtags: h.items };
    flushSync(() => setLists(next));
    (items()[0] ?? wrap.current?.querySelector<HTMLElement>("[data-menu]"))?.focus();
  }

  function close() {
    flushSync(() => setOpen(false));
    button.current?.focus();
  }

  function insert(s: Snippet) {
    const el = document.getElementById(target) as HTMLTextAreaElement | null;
    const r = insertAt(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, s.body, s.kind);
    flushSync(() => {
      onChange(r.text);
      setOpen(false);
    });
    el?.focus();
    el?.setSelectionRange(r.caret, r.caret);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      all[(i + all.length) % all.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") setOpen(false);
    else if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
  }

  const group = (kind: SnippetKind, list: Snippet[]) =>
    list.length > 0 && (
      <div role="group" aria-labelledby={`${menuId}-${kind}`} className="grid gap-0.5">
        <p id={`${menuId}-${kind}`} className="px-2 pt-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
          {kindTitle[kind]}
        </p>
        {list.map((s) => (
          <button key={s.id} type="button" role="menuitem" tabIndex={-1} className="grid rounded-md px-2 py-1.5 text-left hover:bg-ink/[0.05] focus:bg-ink/[0.07] focus:outline-none" onClick={() => insert(s)}>
            <span className="truncate text-sm font-bold">{s.name}</span>
            <span className="truncate text-xs text-ink-soft">{s.body}</span>
          </button>
        ))}
      </div>
    );

  return (
    <div ref={wrap} className="relative" onKeyDown={open ? onKey : undefined}>
      <button
        ref={button}
        type="button"
        className="btn btn-quiet btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : show())}
      >
        Insert snippet<span className="sr-only"> into {label}</span>
        <Icon name="down" className="size-3.5" />
      </button>
      {open && (
        <div
          id={menuId}
          data-menu
          tabIndex={-1}
          role="menu"
          aria-label={`Snippets for ${label}`}
          className="absolute right-0 z-20 mt-1 grid max-h-80 w-72 max-w-[calc(100vw-2rem)] gap-1 overflow-y-auto rounded-xl border border-[var(--line)] bg-paper p-1.5 shadow-lg"
        >
          {lists === null ? (
            <p className="p-2 text-sm text-ink-soft">Loading snippets...</p>
          ) : isProblem(lists) ? (
            <p role="alert" className="p-2 text-sm text-danger">
              The snippets couldn&apos;t be loaded. {say(lists)}
            </p>
          ) : lists.caption.length + lists.hashtags.length === 0 ? (
            <p className="p-2 text-sm text-ink-soft">
              No snippets yet. Add some on the{" "}
              <Link href="/library" role="menuitem" className="underline">
                Library
              </Link>{" "}
              page.
            </p>
          ) : (
            <>
              {group("caption", lists.caption)}
              {group("hashtags", lists.hashtags)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
