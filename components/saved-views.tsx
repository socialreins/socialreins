"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Failure } from "@/lib/auth";
import { isFailure, problemText } from "@/components/team-ui";
import { Icon } from "@/components/ui";
import { changeView, createView, deleteView, listViews, MAX_VIEWS, viewForKey, type View, type ViewScope } from "@/lib/views";

const viewMessages: Partial<Record<Failure, ReactNode>> = {
  name_taken: "You already have a view with that name. Pick a different one.",
  too_many_views: `You can keep ${MAX_VIEWS} views. Delete one first.`,
  invalid_view: "A view needs a name of 1 to 60 characters.",
  not_found: "That view is already gone. Reload to see your views.",
};

const heading = "font-display text-lg font-extrabold tracking-tight";

// A page's filters as a saved view holds them: short strings, no empty ones.
export type ViewFilters = Record<string, string>;
// How a page writes a view's filters back to its address, and says whether it opened with nothing
// chosen (the one moment its default view applies).
export type ViewsOptions = {
  href: (filters: ViewFilters, extra?: { none?: boolean }) => string;
  bare: (params: URLSearchParams) => boolean;
};

// The views of one page, their default and the keys that apply them. `apply` and `clear` change the
// address only; the page reads its own filters from there. The default view is applied once, when the
// page opens with no filters at all (not after Clear, which puts `view=none` in the address).
export function useViews(scope: ViewScope, params: URLSearchParams, go: (href: string) => void, opts: ViewsOptions) {
  const [views, setViews] = useState<View[] | Failure | null>(null);
  useEffect(() => {
    listViews(scope).then(setViews);
  }, [scope]);
  const list = Array.isArray(views) ? views : [];
  const fallback = list.find((v) => v.is_default);
  const bare = opts.bare(params);
  const loaded = Array.isArray(views);
  // The page's own moves (a filter ticked, a view applied, Clear) never bring the default back, even
  // when they leave the address bare; only a visit from outside does (the sidebar, a bookmark).
  const ownMove = useRef(0);
  const move = (to: string) => {
    ownMove.current = Date.now();
    go(to);
  };
  const key = params.toString();
  useEffect(() => {
    const mine = Date.now() - ownMove.current < 2000;
    ownMove.current = 0;
    if (mine || !bare || !fallback || Object.keys(fallback.filters).length === 0) return;
    go(opts.href(fallback.filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new address, or the views arriving; not the default being changed
  }, [key, loaded, scope]);
  return {
    views,
    setViews,
    list,
    fallback,
    move,
    apply: (v: View) => move(opts.href(v.filters)),
    // Every filter off, and the default view left alone until the next visit.
    clear: () => move(opts.href({}, { none: true })),
    byKey: (key: string) => viewForKey(key, list),
  };
}

const closeMenu = (e: { currentTarget: HTMLElement }) => e.currentTarget.closest("details")?.removeAttribute("open");

const sortViews = (l: View[]) => [...l].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));

// The Views column of a list page: the person's views, the one that matches the filters on screen, the
// default, the form that saves the current filters, and every change made to them. One implementation
// for the Comments page and the Inbox; `noun` is how the page names itself in its own sentences.
export function SavedViews({
  id,
  scope,
  noun,
  example,
  filters,
  active,
  current,
  views,
  messages,
  showActive = false,
  confirmDelete = false,
}: {
  id: string;
  scope: ViewScope;
  // The page's name in a sentence: "Comments" or "the Inbox".
  noun: string;
  example: string;
  // The filters on screen, as a view would store them.
  filters: ViewFilters;
  // Whether any filter is on: only then is there something to save or replace.
  active: boolean;
  current?: View;
  views: ReturnType<typeof useViews>;
  messages?: Partial<Record<Failure, ReactNode>>;
  // Says which view is applied above the list (the Inbox, where a default can open the page).
  showActive?: boolean;
  // Asks before deleting (the browser's own question).
  confirmDelete?: boolean;
}) {
  const { list, fallback } = views;
  const [name, setName] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Failure | null>(null);
  const [note, setNote] = useState<{ text: ReactNode; n: number } | null>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (note) noteRef.current?.focus();
  }, [note]);
  const say = (text: ReactNode) => setNote((n) => ({ text, n: (n?.n ?? 0) + 1 }));

  async function saveView(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    const r = await createView(scope, name.trim(), filters, asDefault);
    setBusy(false);
    if (isFailure(r)) return setProblem(r);
    views.setViews((l) => sortViews([...(Array.isArray(l) ? l : []).map((v) => (asDefault ? { ...v, is_default: false } : v)), r]));
    setName("");
    setAsDefault(false);
    say(`Saved the view "${r.name}"${r.is_default ? ", now your default" : ""}.`);
  }
  async function change1(v: View, change: { name?: string; is_default?: boolean; filters?: Record<string, string> }, said: string) {
    setBusy(true);
    setProblem(null);
    const r = await changeView(v.id, change);
    setBusy(false);
    if (isFailure(r)) return setProblem(r);
    views.setViews((l) => sortViews((Array.isArray(l) ? l : []).map((x) => (x.id === r.id ? r : change.is_default ? { ...x, is_default: false } : x))));
    setEditing(null);
    say(said);
  }
  async function remove(v: View) {
    if (confirmDelete && !window.confirm(`Delete the view "${v.name}"?`)) return;
    setBusy(true);
    setProblem(null);
    const r = await deleteView(v.id);
    setBusy(false);
    if (isFailure(r)) return setProblem(r);
    views.setViews((l) => (Array.isArray(l) ? l.filter((x) => x.id !== v.id) : l));
    say(`Deleted the view "${v.name}".`);
  }

  return (
    // One column that may shrink: a long view or account name truncates instead of widening the panel.
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-3">
      <h2 id={id} className={heading}>
        Views
      </h2>
      {showActive && current && (
        <p className="text-sm text-ink-soft" data-testid="active-view">
          Showing <strong className="text-ink">{current.name}</strong>.
        </p>
      )}
      {views.views === null ? (
        <div role="status" className="h-10 rounded-xl bg-ink/5 motion-safe:animate-pulse">
          <span className="sr-only">Loading your views...</span>
        </div>
      ) : isFailure(views.views) ? (
        <p role="alert" className="waitlist-error">
          Your views couldn&apos;t be loaded. {problemText(views.views)}
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-ink-soft">Pick filters, then save them as a view to bring them back in one click or with the keys 1 to 9.</p>
      ) : (
        <ul aria-label="Saved views" className="grid gap-1">
          {list.slice(0, 20).map((v, n) => (
            <li key={v.id} className="group flex min-w-0 items-center gap-1">
              {editing?.id === v.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editing.name.trim()) void change1(v, { name: editing.name.trim() }, `Renamed the view to "${editing.name.trim()}".`);
                  }}
                >
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">New name of the view {v.name}</span>
                    <input className="field w-full py-1" maxLength={60} value={editing.name} autoFocus onChange={(e) => setEditing({ id: v.id, name: e.target.value })} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditing(null))} />
                  </label>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                    Save
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    aria-pressed={current?.id === v.id}
                    onClick={() => views.apply(v)}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-bold focus-visible:outline-offset-[-2px] ${current?.id === v.id ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink"}`}
                  >
                    {n < 9 && (
                      <kbd aria-hidden="true" className={`rounded border px-1 font-mono text-[0.7rem] ${current?.id === v.id ? "border-paper/40" : "border-ink/20"}`}>
                        {n + 1}
                      </kbd>
                    )}
                    <span className="truncate">{v.name}</span>
                    {v.is_default && <span className="badge ml-auto shrink-0">Default</span>}
                    {n < 9 && <span className="sr-only"> (key {n + 1})</span>}
                  </button>
                  <details data-menu="" className="relative" onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), e.nativeEvent.stopImmediatePropagation(), e.currentTarget.removeAttribute("open"))}>
                    <summary className="grid size-8 cursor-pointer list-none place-items-center rounded-lg text-ink-soft hover:bg-ink/5 hover:text-ink focus-visible:outline-offset-[-3px]" aria-label={`Manage the view ${v.name}`}>
                      <Icon name="edit" className="size-4" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 grid w-48 gap-0.5 rounded-xl border border-ink/10 bg-paper p-1 shadow-lg">
                      <button type="button" className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/5" onClick={(e) => (closeMenu(e), setEditing({ id: v.id, name: v.name }))}>
                        Rename
                      </button>
                      <button type="button" disabled={busy} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/5" onClick={(e) => (closeMenu(e), change1(v, { is_default: !v.is_default }, v.is_default ? `"${v.name}" is no longer your default.` : `"${v.name}" is now your default.`))}>
                        {v.is_default ? "Stop using by default" : "Use by default"}
                      </button>
                      {active && current?.id !== v.id && (
                        <button type="button" disabled={busy} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/5" onClick={(e) => (closeMenu(e), change1(v, { filters }, `Updated "${v.name}" with the filters on screen.`))}>
                          Replace with the current filters
                        </button>
                      )}
                      <button type="button" disabled={busy} className="rounded-lg px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40" onClick={(e) => (closeMenu(e), remove(v))}>
                        Delete
                      </button>
                    </div>
                  </details>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-soft" data-testid="default-view">
        {fallback ? (
          <>
            Default: <strong className="text-ink">{fallback.name}</strong>. It is applied when you open {noun} with no filters.
          </>
        ) : list.length > 0 ? (
          "No default view. Use one by default from its menu."
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={views.clear} aria-keyshortcuts="0 Escape">
          <Icon name="close" className="size-4" />
          Clear filters <kbd aria-hidden="true" className="ml-1 rounded border border-ink/20 px-1 font-mono text-[0.7rem]">0</kbd>
        </button>
        {fallback && <span className="text-xs text-ink-soft">Clearing does not delete a view.</span>}
      </div>
      {active && (
        <form onSubmit={saveView} className="card grid gap-2 p-3">
          <label className="grid gap-1 text-sm font-bold">
            Save these filters as a view
            <input className="field w-full font-normal" maxLength={60} placeholder={example} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} />
            Open {noun} with this view
          </label>
          <button type="submit" className="btn btn-primary btn-sm justify-self-start" disabled={busy || !name.trim() || list.length >= MAX_VIEWS}>
            Save view
          </button>
          {list.length >= MAX_VIEWS && <p className="text-sm text-ink-soft">You have {MAX_VIEWS} views, the most you can keep. Delete one to save another.</p>}
        </form>
      )}
      {note && (
        <p ref={noteRef} tabIndex={-1} role="status" key={note.n} className="rounded-xl bg-signal/10 p-2 text-sm outline-none">
          {note.text}
        </p>
      )}
      {problem && (
        <p role="alert" className="waitlist-error">
          {problemText(problem, { ...viewMessages, ...messages })}
        </p>
      )}
    </div>
  );
}
