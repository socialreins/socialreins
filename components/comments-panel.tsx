"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { TeamLink as Link } from "@/components/team-link";
import type { Failure } from "@/lib/auth";
import { accountName } from "@/components/connections";
import { platformName } from "@/components/platform-icons";
import { isFailure, planLimit, problemText } from "@/components/team-ui";
import { Icon } from "@/components/ui";
import type { Connection } from "@/lib/connections";
import { automationHref, commentCapable, commentsHref, inboxFromFilters, listOf, narrows, notInInbox, pickedAccounts, sameFilters, setLabel, type FilterKey, type Filters } from "@/lib/comments";
import { createInbox, inboxCapable } from "@/lib/inbox";
import { getPost } from "@/lib/posts";
import { address } from "@/lib/ref";
import type { SocialSet } from "@/lib/sets";
import { changeView, createView, deleteView, listViews, MAX_VIEWS, viewForKey, type View } from "@/lib/views";

const viewMessages: Partial<Record<Failure, ReactNode>> = {
  name_taken: "You already have a view with that name. Pick a different one.",
  too_many_views: `You can keep ${MAX_VIEWS} views. Delete one first.`,
  invalid_view: "A view needs a name of 1 to 60 characters.",
  not_found: "That view is already gone. Reload to see your views.",
};
const inboxMessages: Partial<Record<Failure, ReactNode>> = {
  plan_limit_inboxes: planLimit("inboxes"),
  too_many_inboxes: "This team already has 50 inboxes, the most allowed. Delete one first.",
  invalid_accounts: "Pick at least one account that has an inbox. LinkedIn comments are not read yet.",
  forbidden: "Only team owners and admins can make an inbox.",
};

// The first words of a post, for a chip or a card.
export const excerpt = (text?: string, n = 60) => (text ? (text.length > n ? `${text.slice(0, n).trimEnd()}...` : text) : "");

const heading = "font-display text-lg font-extrabold tracking-tight";
const groupSummary = "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-sm font-bold text-ink hover:bg-ink/5 focus-visible:outline-offset-[-2px]";

// The views of the Comments page, their default and the keys that apply them. `apply` and `clear` change the address only;
// the page reads its filters from there. The default view is applied once, when the page opens with no filters at all
// (not after Clear, which puts `view=none` in the address).
export function useViews(enabled: boolean, params: URLSearchParams, go: (href: string) => void) {
  const [views, setViews] = useState<View[] | Failure | null>(null);
  useEffect(() => {
    if (enabled) listViews("comments").then(setViews);
  }, [enabled]);
  const list = Array.isArray(views) ? views : [];
  const fallback = list.find((v) => v.is_default);
  // No filters at all in the address (the Done tab aside): the person just opened Comments, so their default view applies.
  // Clear puts `view=none` in the address, so it is not a bare one and the default stays off until the next visit.
  const bare = enabled && [...params.keys()].every((k) => k === "state");
  const loaded = Array.isArray(views);
  // The page's own moves (a filter ticked, a view applied, Clear) never bring the default back, even when they leave the address bare;
  // only a visit from outside does (the sidebar, a bookmark). `ownMove` is when the last own move was made.
  const ownMove = useRef(0);
  const move = (to: string) => {
    ownMove.current = Date.now();
    go(to);
  };
  const state = params.get("state");
  const key = params.toString();
  useEffect(() => {
    const mine = Date.now() - ownMove.current < 2000;
    ownMove.current = 0;
    if (mine || !bare || !fallback || Object.keys(fallback.filters).length === 0) return;
    go(commentsHref(fallback.filters, { state: state === "done" ? "done" : "open" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new address, or the views arriving; not the default being changed
  }, [key, loaded]);
  return {
    views,
    setViews,
    list,
    fallback,
    move,
    apply: (v: View) => move(commentsHref(v.filters)),
    // Every filter off, and the default view left alone until the next visit.
    clear: () => move(commentsHref({}, { view: "none" })),
    byKey: (key: string) => viewForKey(key, list),
  };
}

// Our posts the comments hang off, by id: their text and number, read once each. A post that is gone or unreadable is left out.
const postCache = new Map<string, { text: string; number: number }>();
export function usePosts(ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))].slice(0, 60);
  const [, bump] = useState(0);
  const key = wanted.join(",");
  useEffect(() => {
    const missing = wanted.filter((id) => !postCache.has(id));
    if (!missing.length) return;
    let live = true;
    Promise.all(
      missing.map((id) =>
        getPost(id).then((r) => {
          if (!isFailure(r)) postCache.set(id, { text: r.body, number: r.number });
        }),
      ),
    ).then(() => live && bump((n) => n + 1));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the ids
  }, [key]);
  return new Map(wanted.flatMap((id) => (postCache.has(id) ? [[id, postCache.get(id)!] as const] : [])));
}

// A menu button closes its menu: the <details> it sits in.
const closeMenu = (e: { currentTarget: HTMLElement }) => e.currentTarget.closest("details")?.removeAttribute("open");

const sortViews = (l: View[]) => [...l].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));

function Group({ title, open, count, children }: { title: string; open?: boolean; count?: number; children: ReactNode }) {
  return (
    <details open={open} className="rounded-xl border border-ink/10 px-2 py-0.5">
      <summary className={groupSummary}>
        <span>{title}</span>
        {Boolean(count) && <span className="badge tone tabular-nums">{count}</span>}
      </summary>
      <div className="grid gap-1 pt-1 pb-2">{children}</div>
    </details>
  );
}

function Check({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (on: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-sm hover:bg-ink/[0.04]">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 break-words">
        {label}
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
    </label>
  );
}

// What a network without readable comments says it needs, so a missing network is explained, not just absent.
const networkNote: Record<string, string> = {
  linkedin: "LinkedIn comments need LinkedIn's approval, so none arrive yet.",
  x: "X reads cost credits. Turn the X inbox on under Accounts.",
  youtube: "YouTube comments are read when you turn the YouTube inbox on for a channel, under Accounts.",
};

export function CommentsPanel({
  filters,
  accounts,
  sets,
  members,
  views,
  canManage,
  search,
  go,
  posts,
}: {
  filters: Filters;
  accounts: Connection[];
  sets: SocialSet[];
  members: { id: string; name: string }[];
  views: ReturnType<typeof useViews>;
  canManage: boolean;
  // What is typed in the list's search box, which is the keyword filter.
  search: string;
  go: (href: string) => void;
  // The post filter's text, when it has loaded.
  posts: Map<string, { text: string; number: number }>;
}) {
  const { list, fallback } = views;
  const capable = commentCapable(accounts);
  const networks = [...new Set(capable.map((a) => a.provider))];
  const shown: Filters = { ...filters, ...(search.trim() ? { q: search.trim() } : {}) };
  const change = (patch: Partial<Record<FilterKey, string>>) => {
    const next: Filters = { ...shown };
    for (const [k, v] of Object.entries(patch) as [FilterKey, string][]) {
      if (v) next[k] = v;
      else delete next[k];
    }
    go(commentsHref(next));
  };
  const toggle = (key: "set" | "network" | "account", value: string, on: boolean) => {
    const now = listOf(filters[key]);
    change({ [key]: (on ? [...now, value] : now.filter((x) => x !== value)).join(",") });
  };
  const active = narrows(shown);
  const current = list.find((v) => sameFilters(shown, v.filters));

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
    const r = await createView("comments", name.trim(), shown as Record<string, string>, asDefault);
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
    setBusy(true);
    setProblem(null);
    const r = await deleteView(v.id);
    setBusy(false);
    if (isFailure(r)) return setProblem(r);
    views.setViews((l) => (Array.isArray(l) ? l.filter((x) => x.id !== v.id) : l));
    say(`Deleted the view "${v.name}".`);
  }
  async function saveInbox() {
    setBusy(true);
    setProblem(null);
    const label = [...listOf(filters.network).map(platformName), ...(filters.q ? [`"${filters.q}"`] : [])].join(", ");
    const body = inboxFromFilters(label ? `Comments: ${label}` : "Comments", filters, accounts);
    body.account_ids = inboxCapable(accounts.filter((a) => body.account_ids.includes(a.id))).map((a) => a.id);
    const r = await createInbox(body);
    setBusy(false);
    if (isFailure(r)) return setProblem(r);
    const left = notInInbox(shown);
    say(
      <>
        Made the inbox &quot;{r.name}&quot; with comments and mentions of {r.account_ids.length === 1 ? "1 account" : `${r.account_ids.length} accounts`}
        {left.length ? `. An inbox does not hold ${left.join(", ")}` : ""}.{" "}
        <Link href={`/inbox/${address(r)}`} className="font-bold underline decoration-signal decoration-2 underline-offset-4">
          Open it
        </Link>
      </>,
    );
  }

  const sticky = canManage && capable.length > 0;
  const liveSets = sets.filter((s) => !s.deleted_at);
  const picked = (key: "set" | "network" | "account") => listOf(filters[key]);

  return (
    // One column that may shrink: a long view or account name truncates instead of widening the panel past its pane.
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-3">
      <h2 id="comments-views-heading" className={heading}>
        Views
      </h2>
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
                        <button type="button" disabled={busy} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/5" onClick={(e) => (closeMenu(e), changeFilters(v))}>
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
            Default: <strong className="text-ink">{fallback.name}</strong>. It is applied when you open Comments with no filters.
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
            <input className="field w-full font-normal" maxLength={60} placeholder="For example: X, unanswered" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} />
            Open Comments with this view
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
          {problemText(problem, { ...viewMessages, ...inboxMessages })}
        </p>
      )}

      <h2 id="comments-filters-heading" className={`${heading} mt-2`}>
        Filters
      </h2>
      <div className="grid gap-1.5">
        {liveSets.length > 1 && (
          <Group title="Sets" open={picked("set").length > 0} count={picked("set").length}>
            {liveSets.map((s) => (
              <Check key={s.id} label={s.is_default ? "All accounts (default set)" : s.name} checked={picked("set").includes(s.id)} onChange={(on) => toggle("set", s.id, on)} hint={`${s.account_count} ${s.account_count === 1 ? "account" : "accounts"}`} />
            ))}
          </Group>
        )}
        <Group title="Networks" open={picked("network").length > 0} count={picked("network").length}>
          {networks.map((n) => (
            <Check key={n} label={platformName(n)} checked={picked("network").includes(n)} onChange={(on) => toggle("network", n, on)} hint={networkNote[n]} />
          ))}
          {networks.length === 0 && <p className="px-1 text-sm text-ink-soft">No network with comments is connected.</p>}
        </Group>
        <Group title="Accounts" open={picked("account").length > 0} count={picked("account").length}>
          {capable.map((a) => (
            <Check key={a.id} label={`${accountName(a)}`} hint={platformName(a.provider)} checked={picked("account").includes(a.id)} onChange={(on) => toggle("account", a.id, on)} />
          ))}
        </Group>
        <Group title="Replies" open={Boolean(filters.answer)} count={filters.answer ? 1 : 0}>
          <div role="radiogroup" aria-label="Replies" className="grid gap-1">
            {(["", "unanswered", "answered"] as const).map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-ink/[0.04]">
                <input type="radio" name="comments-answer" checked={(filters.answer ?? "") === v} onChange={() => change({ answer: v })} />
                {v === "" ? "Any" : v === "unanswered" ? "Unanswered" : "Answered"}
              </label>
            ))}
          </div>
        </Group>
        <Group title="Assigned" open={Boolean(filters.assigned)} count={filters.assigned ? 1 : 0}>
          <label className="px-1 text-sm">
            <span className="sr-only">Assigned to</span>
            <select className="field w-full py-1" value={filters.assigned ?? ""} onChange={(e) => change({ assigned: e.target.value })}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="none">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </Group>
        <Group title="Dates" open={Boolean(filters.from || filters.to)} count={(filters.from ? 1 : 0) + (filters.to ? 1 : 0)}>
          <label className="grid gap-0.5 px-1 text-sm">
            From
            <input type="date" className="field py-1" value={filters.from ?? ""} max={filters.to || undefined} onChange={(e) => change({ from: e.target.value })} />
          </label>
          <label className="grid gap-0.5 px-1 text-sm">
            To (that day included)
            <input type="date" className="field py-1" value={filters.to ?? ""} min={filters.from || undefined} onChange={(e) => change({ to: e.target.value })} />
          </label>
        </Group>
        <Group title="Moderation" open={filters.hidden === "1" || filters.show === "activity"} count={(filters.hidden === "1" ? 1 : 0) + (filters.show === "activity" ? 1 : 0)}>
          <Check label="Hidden or held for review" hint="Facebook and Instagram comments you hid, YouTube comments held." checked={filters.hidden === "1"} onChange={(on) => change({ hidden: on ? "1" : "" })} />
          <Check label="Activity instead of comments" hint="Follows, likes and reposts." checked={filters.show === "activity"} onChange={(on) => change({ show: on ? "activity" : "" })} />
        </Group>
      </div>
      {(pickedAccounts(filters, accounts)?.length ?? 0) > 100 && <p className="text-sm text-ink-soft">These filters reach more than 100 accounts, so only the first 100 are listed. Narrow them to see the rest.</p>}
      {filters.post && (
        <p className="badge tone gap-1 pr-1 text-ink">
          Post: {excerpt(posts.get(filters.post)?.text) || "one post"}
          <button type="button" aria-label="Clear the post filter" className="grid size-5 place-items-center rounded-full hover:bg-ink/10" onClick={() => change({ post: "" })}>
            <Icon name="close" className="size-3" />
          </button>
        </p>
      )}
      {filters.set && listOf(filters.set).some((id) => !liveSets.some((s) => s.id === id)) && (
        <p className="text-sm text-ink-soft">{listOf(filters.set).filter((id) => !liveSets.some((s) => s.id === id)).map((id) => setLabel(id, sets)).join(", ")} is not a set any more, so it matches no account.</p>
      )}

      <div className="grid gap-2">
        <h2 className={`${heading} mt-2`}>Use these comments</h2>
        {sticky ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm justify-self-start" disabled={busy} onClick={saveInbox}>
              <Icon name="inbox" className="size-4" />
              Save as inbox
            </button>
            <Link href={automationHref(filters, accounts)} className="btn btn-secondary btn-sm justify-self-start">
              <Icon name="automations" className="size-4" />
              Automate comments like this
            </Link>
          </>
        ) : (
          <p className="text-sm text-ink-soft">{capable.length === 0 ? "Connect an account to make an inbox or an automation from its comments." : "Team owners and admins can make an inbox or an automation from these comments."}</p>
        )}
      </div>
    </div>
  );

  // Puts the filters on screen into a saved view.
  async function changeFilters(v: View) {
    await change1(v, { filters: shown as Record<string, string> }, `Updated "${v.name}" with the filters on screen.`);
  }
}
