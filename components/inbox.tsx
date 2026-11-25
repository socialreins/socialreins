"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { TeamLink as Link } from "@/components/team-link";
import { useSearchParams } from "next/navigation";
import { useTeamRouter as useRouter } from "@/components/team-link";
import type { Failure } from "@/lib/auth";
import { listConnections, safeAvatar, type Connection } from "@/lib/connections";
import { listContactTags, updateContact } from "@/lib/contacts";
import {
  assignItem,
  attachmentName,
  authorName,
  chatRows,
  getConversation,
  getItem,
  inboxName,
  itemSummary,
  kindName,
  listInboxes,
  listItems,
  maxFor,
  mergeConversation,
  mergeFresh,
  messageCount,
  relativeTime,
  replyToItem,
  sentAlready,
  setItemState,
  shortcutFor,
  stepInbox,
  threadKey,
  unboxed,
  type Attachment,
  type Author,
  type ConversationPage,
  type Inbox as InboxT,
  type Item,
  type ItemState,
  type Kind,
  type Page,
} from "@/lib/inbox";
import { createSnippet, isProblem, libraryText, type Problem } from "@/lib/library";
import { graphemes } from "@/lib/posts";
import { getBilling, type Billing } from "@/lib/billing";
import { listMembers, manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { accountName, Avatar } from "@/components/connections";
import { InboxEditor, inboxMessages } from "@/components/inbox-editor";
import { SnippetMenu } from "@/components/library";
import { platformName } from "@/components/platform-icons";
import { TagEditor } from "@/components/tag-editor";
import { isFailure, linkButton, planLimit, problemText, Status, useAction, useSearchInUrl } from "@/components/team-ui";
import { Icon } from "@/components/ui";
import { XActions } from "@/components/x-inbox";

// New comments arrive on brain's per-minute tick; the open list checks twice a minute.
const REFRESH_MS = 30_000;

const replyMessages: Partial<Record<Failure, ReactNode>> = {
  reply_in_progress: "Another reply to this is going out right now. Wait a moment, then reload.",
  rate_limited: "Too many replies and posts in a minute. Wait a minute, then try again.",
  invalid_text: "Write something first, within the length limit.",
  not_found: "This item is no longer there. Reload to see the latest.",
  timeout: "Bluesky is taking a long time to answer. The reply may still go out, so reload before sending it again.",
};

const accountsLink = (
  <Link href="/connections" className="underline decoration-2 underline-offset-4">
    Open Accounts
  </Link>
);
const sendMessages: Record<string, ReactNode> = {
  no_dm_access: <>This account&apos;s app password doesn&apos;t allow DMs. Reconnect with an app password that allows DMs. {accountsLink}</>,
  dm_not_allowed: "They only accept DMs from people they follow, so Bluesky didn't take it.",
  reconnect_required: <>Bluesky refused the app password. Reconnect the account. {accountsLink}</>,
};

const kindOptions: { value: Kind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "comment", label: "Comments" },
  { value: "mention", label: "Mentions" },
  { value: "dm", label: "DMs" },
];

// Who the list shows: everyone's items, mine, or the ones nobody has. In the address as ?assigned=.
const assignedOptions = [
  { value: "", label: "Anyone" },
  { value: "me", label: "Me" },
  { value: "none", label: "Unassigned" },
];

const shortcuts: [string, string][] = [
  ["J", "Next item"],
  ["K", "Previous item"],
  ["E", "Mark done and open the next one"],
  ["R", "Write a reply"],
  ["A", "Assign to me"],
  ["/", "Search this inbox"],
  ["[", "Previous inbox"],
  ["]", "Next inbox"],
  ["?", "Show these shortcuts"],
  ["Ctrl or Cmd + Enter", "Send the reply"],
];

// How long Mark done offers Undo.
const UNDO_MS = 5_000;
// A done item that left the list at once: where it was, and the PATCH still on its way. Each has its own
// line, so a second Mark done never takes the first one's Undo away.
type Undo = { id: number; item: Item; row: Item | null; saved: Promise<Item | Failure>; problem?: Failure; undoing?: boolean };
// A reply shown in the thread before brain answered: on its way, refused (`failed` says why), or `unsure`,
// when no clear answer came and it may have gone out. Kept by the Inbox per thread, so it survives opening another item.
type Pending = { id: number; thread: string; itemId: string; name: string; text: string; failed?: ReactNode; unsure?: boolean };
const settled = (p: Pending) => p.failed !== undefined || p.unsure === true;
let lastId = 0;

// A change to one item, laid over a list row or the open item of the same thread. A conversation's row is its
// latest DM, so a change made through an older DM moves only what the whole conversation shares.
const patched = (x: Item, i: Item): Item =>
  x.id === i.id ? { ...i, conversation: x.conversation } : { ...x, state: i.state, assigned_to: i.assigned_to, contact_tags: i.contact_tags };

const chip = "badge tone gap-1 pr-1 text-ink";
const chipClear = "grid size-5 place-items-center rounded-full hover:bg-ink/10";

// A small menu in the filter bar: the filter's name with a native select as its value.
function FilterMenu<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center gap-1 rounded-full border border-ink/15 py-1 pr-1 pl-3 text-sm text-ink-soft hover:border-ink/40 has-[:focus-visible]:border-ink">
      {label}
      <select className="cursor-pointer rounded-full bg-transparent py-0.5 pr-1 font-bold text-ink" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="shortcuts-title" onClose={onClose} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40">
      <div className="grid gap-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="shortcuts-title" className="font-display text-xl font-extrabold tracking-tight">
            Keyboard shortcuts
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-sm">
          {shortcuts.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded-md border border-ink/20 bg-canvas px-1.5 py-0.5 font-mono text-xs font-bold">{keys}</kbd>
              </dt>
              <dd className="text-ink-soft">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">Shortcuts wait while you type in a box.</p>
      </div>
    </dialog>
  );
}
const metaMessages: Partial<Record<Failure, ReactNode>> = {
  invalid_assignee: "That person is no longer in this team. Reload, then pick someone else.",
  invalid_contact: "That tag wasn't saved: a tag takes 1 to 30 characters and no commas, and a contact 20 tags.",
  not_found: "This is no longer there. Reload to see the latest.",
};
type Person = { id: string; name: string };

export function AuthorAvatar({ author, size = "size-10" }: { author: Author; size?: string }) {
  const src = safeAvatar(author.avatar_url);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a remote avatar, no Next image loader configured
    <img src={src} alt="" width={40} height={40} referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-full`} />
  ) : (
    <span aria-hidden="true" className={`grid ${size} shrink-0 place-items-center rounded-full bg-ink/10 font-bold`}>
      {authorName(author).replace(/^@/, "").charAt(0).toUpperCase()}
    </span>
  );
}

export function KindBadge({ kind }: { kind: Item["kind"] }) {
  return (
    <span className="badge tone" data-kind={kind}>
      {kindName[kind]}
    </span>
  );
}

export function Inbox({ inboxId }: { inboxId?: string }) {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const router = useRouter();
  const params = useSearchParams();
  const itemId = params.get("item");
  const state: ItemState = params.get("state") === "done" ? "done" : "open";
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const assigned = params.get("assigned") ?? "";
  const tag = params.get("tag") ?? "";
  const [search, setSearch] = useState(q);
  const [members, setMembers] = useState<Person[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);

  const [inboxes, setInboxes] = useState<InboxT[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[] | Failure | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  // Loaded data remembers what it was loaded for, so a new inbox, tab or item shows loading, not stale rows.
  const [loaded, setLoaded] = useState<{ key: string; page: Page | Failure } | null>(null);
  const [more, setMore] = useState<Failure | "loading" | null>(null);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [shown, setShown] = useState<{ id: string; item: Item | Failure } | null>(null);
  const [editing, setEditing] = useState<InboxT | "new" | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [undos, setUndos] = useState<Undo[]>([]);
  const [outbox, setOutbox] = useState<Pending[]>([]);
  // Threads with a state PATCH on its way: a second Mark done for one waits its turn by not happening.
  const patching = useRef(new Set<string>());
  const [help, setHelp] = useState(false);
  const rowsRef = useRef<HTMLUListElement>(null);
  // The item a key press just went to, until the address has it: J pressed twice fast moves two rows.
  const heading = useRef<string | null>(null);

  useEffect(() => {
    listInboxes().then(setInboxes);
    listConnections().then(setAccounts);
    getBilling().then((r) => !isFailure(r) && setBilling(r));
    listMembers().then((r) => Array.isArray(r) && setMembers(r));
    listContactTags().then((r) => Array.isArray(r) && setTagOptions(r.map((t) => t.tag)));
  }, []);

  const list = Array.isArray(inboxes) ? inboxes : [];
  const current = inboxId ? list.find((i) => i.id === inboxId) : list[0];
  const currentId = current?.id ?? inboxId;
  const base = inboxId ? `/inbox/${encodeURIComponent(inboxId)}` : "/inbox";
  const href = (to: { item?: string | null; state?: ItemState; assigned?: string; tag?: string }) => {
    const s = new URLSearchParams();
    if ((to.state ?? state) === "done") s.set("state", "done");
    if (to.item) s.set("item", to.item);
    if (search.trim()) s.set("q", search.trim());
    if (to.assigned ?? assigned) s.set("assigned", to.assigned ?? assigned);
    if (to.tag ?? tag) s.set("tag", to.tag ?? tag);
    return s.size ? `${base}?${s}` : base;
  };

  const kindQ = kind === "all" ? null : kind;
  const key = JSON.stringify([currentId, state, kind, q, assigned, tag]);
  // Every list call, the poll and Load more included, carries the same filters.
  const fetchItems = (id: string, cursor?: string | null) => listItems(id, state, cursor, kindQ, q, { assigned, tag, conversations: true });
  const page = loaded?.key === key ? loaded.page : null;
  const setPage = (f: (p: Page | Failure | null) => Page | Failure | null) =>
    // A late answer for another inbox or tab leaves the newer page alone.
    setLoaded((l) => {
      if (l?.key !== key) return l;
      const next = f(l.page);
      return next ? { key, page: next } : l;
    });
  const items = page && !isFailure(page) ? page.items : [];
  // Until the item itself answers, its list row stands in, so a row opens at once.
  const detail = !itemId ? null : shown?.id === itemId ? shown.item : (items.find((i) => i.id === itemId) ?? null);
  // What is open, as the list knows it: a conversation matches its row whichever of its DMs the address names.
  const openKey = detail && !isFailure(detail) ? threadKey(detail) : itemId;
  const refreshCounts = () => listInboxes().then((l) => Array.isArray(l) && setInboxes(l));
  const go = (id: string | null, how: "push" | "replace" = "replace") => {
    if (id) setOpened(id);
    heading.current = id;
    router[how](href({ item: id }), { scroll: false });
  };

  useEffect(() => {
    if (!currentId) return;
    let live = true;
    fetchItems(currentId).then((r) => live && setLoaded({ key, page: isFailure(r) ? r : { items: r.items, next: r.next_cursor } }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` holds every filter fetchItems reads
  }, [currentId, key, reloads]);

  useSearchInUrl(search, q);

  // While the tab shows, fold the newest page into the list and refresh the open counts; a failed check waits for the next.
  useEffect(() => {
    if (!currentId) return;
    let live = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      listInboxes().then((l) => live && Array.isArray(l) && setInboxes(l));
      const r = await fetchItems(currentId);
      if (!live || isFailure(r)) return;
      setLoaded((l) => (l?.key === key && !isFailure(l.page) ? { key, page: mergeFresh(l.page, r) } : l));
    };
    const timer = setInterval(check, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` holds every filter fetchItems reads
  }, [currentId, key]);

  useEffect(() => {
    heading.current = null;
    if (!itemId) return;
    let live = true;
    getItem(itemId).then((r) => live && setShown({ id: itemId, item: r }));
    return () => {
      live = false;
    };
  }, [itemId]);

  async function loadMore() {
    if (!currentId || isFailure(page) || !page?.next) return;
    setMore("loading");
    const r = await fetchItems(currentId, page.next);
    if (isFailure(r)) return setMore(r);
    setMore(null);
    // A refresh that replaced the list meanwhile has its own cursor; this page no longer follows it.
    const cursor = page.next;
    setPage((p) => (p && !isFailure(p) && p.next === cursor ? { items: [...p.items, ...r.items], next: r.next_cursor } : p));
  }

  // A changed item: the detail shows it, the list keeps its row only while it fits the tab.
  function changed(i: Item) {
    const k = threadKey(i);
    setShown((s) => (s && !isFailure(s.item) && threadKey(s.item) === k ? { id: s.id, item: patched(s.item, i) } : s));
    // Done or reopened: the open counts moved.
    refreshCounts();
    setPage((p) =>
      p && !isFailure(p) ? { ...p, items: i.state === state ? p.items.map((x) => (threadKey(x) === k ? patched(x, i) : x)) : p.items.filter((x) => threadKey(x) !== k) } : p,
    );
  }

  // Back in its place, unless the list already holds its thread: a poll may have brought a newer row of the conversation.
  const putBack = (u: Undo) =>
    setPage((p) => {
      const row = u.row;
      if (!row || !p || isFailure(p) || p.items.some((x) => threadKey(x) === threadKey(row))) return p;
      // By its time, as the list is ordered: an index from before would be off once other rows came or went.
      const older = p.items.findIndex((x) => x.received_at < row.received_at);
      const at = older < 0 ? p.items.length : older;
      return { ...p, items: [...p.items.slice(0, at), row, ...p.items.slice(at)] };
    });
  const failUndo = (u: Undo, problem: Failure, undoing = false) => setUndos((l) => [...l.filter((x) => x.id !== u.id), { ...u, problem, undoing }]);

  // Mark done: the row goes and the next item opens at once, the PATCH follows. A whole conversation for a DM.
  function markDone(i: Item) {
    const k = threadKey(i);
    if (patching.current.has(k)) return;
    patching.current.add(k);
    const at = items.findIndex((x) => threadKey(x) === k);
    const row = state === "open" && at >= 0 ? items[at]! : null;
    const saved = setItemState(i.id, "done", i.kind === "dm");
    const u: Undo = { id: ++lastId, item: i, row, saved };
    setUndos((l) => [...l, u]);
    // A line that turned into a failure stays until dismissed.
    setTimeout(() => setUndos((l) => l.filter((x) => x.id !== u.id || x.problem)), UNDO_MS);
    if (row) {
      setPage((p) => (p && !isFailure(p) ? { ...p, items: p.items.filter((x) => x.id !== row.id) } : p));
      go((items[at + 1] ?? items[at - 1])?.id ?? null);
    }
    saved.then((r) => {
      patching.current.delete(k);
      if (isFailure(r)) {
        putBack(u);
        failUndo(u, r);
      } else if (row) refreshCounts();
      else changed(r);
    });
  }

  async function undoDone(u: Undo) {
    const k = threadKey(u.item);
    setUndos((l) => l.filter((x) => x.id !== u.id));
    // The done PATCH lands first, so the two can't cross.
    await u.saved;
    patching.current.add(k);
    const r = await setItemState(u.item.id, "open", u.item.kind === "dm");
    patching.current.delete(k);
    if (isFailure(r)) return failUndo(u, r, true);
    putBack(u);
    if (u.row) {
      refreshCounts();
      go(u.item.id);
    } else changed(r);
  }

  // One-key shortcuts. Done, assign and reply act through the reader's own controls, so they do what a click does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = shortcutFor(e);
      if (!s || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      if (s === "next" || s === "previous") {
        const from = heading.current;
        const at = items.findIndex((x) => (from ? x.id === from : threadKey(x) === openKey || x.id === itemId));
        const n = at < 0 ? 0 : at + (s === "next" ? 1 : -1);
        if (!items[n]) return;
        go(items[n].id, "push");
        rowsRef.current?.children[n]?.scrollIntoView({ block: "nearest" });
      } else if (s === "done") {
        // A held key marks one item, not the whole list.
        if (!e.repeat) document.getElementById("mark-done")?.click();
      }
      else if (s === "assign") document.getElementById("assign-me")?.click();
      else if (s === "reply") document.getElementById("reply-text")?.focus();
      else if (s === "search") document.getElementById("inbox-search")?.focus();
      else if (s === "nextInbox" || s === "previousInbox") {
        const to = stepInbox(list, current?.id, s === "nextInbox" ? 1 : -1);
        if (to) router.push(`/inbox/${encodeURIComponent(to.id)}`);
      } else setHelp(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const loadMoreButton = page && !isFailure(page) && page.next && (
    <>
      <button type="button" className="btn btn-secondary btn-sm mt-3" disabled={more === "loading"} onClick={loadMore}>
        {more === "loading" ? "Loading..." : "Load more"}
      </button>
      {isFailure(more) && (
        <p role="alert" className="waitlist-error mt-2">
          More items couldn&apos;t be loaded. {problemText(more)}
        </p>
      )}
    </>
  );
  // Replies that did not clearly go out, one line per thread, for the threads not on screen.
  const stuck = outbox.filter((p, n) => settled(p) && p.thread !== openKey && outbox.findIndex((x) => settled(x) && x.thread === p.thread) === n);
  const noAccounts = Array.isArray(accounts) && accounts.length === 0;
  const accountList = Array.isArray(accounts) ? accounts : [];
  const accountById = new Map(accountList.map((a) => [a.id, a]));
  const custom = list.filter((i) => !i.is_all);
  const left = Array.isArray(inboxes) && Array.isArray(accounts) ? unboxed(accountList, list) : [];
  // The plan's inbox count is reached ("All inboxes" never counts); existing ones stay.
  const max = billing?.enabled ? billing.limits.inboxes : null;
  const atLimit = max != null && custom.length >= max;
  const nameOf = new Map(list.map((i) => [i.id, i.name]));
  // On small screens one pane shows at a time: inboxes, then items, then the item.
  const show = (pane: "inboxes" | "items" | "detail") =>
    (pane === "detail" ? itemId : pane === "items" ? inboxId && !itemId : !inboxId && !itemId) ? "block" : "hidden";

  return (
    // From lg up the inbox fills the window under the top bar (3rem) and main's padding (2rem twice); each pane scrolls on its own.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:h-[calc(100dvh-7rem)] lg:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1.25fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4 xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1.25fr)] xl:gap-6">
      <nav aria-labelledby="inboxes-heading" className={`${show("inboxes")} grid content-start gap-3 lg:block lg:overflow-y-auto lg:overscroll-contain`}>
        <div className="flex items-center justify-between gap-2 lg:mb-3">
          <h2 id="inboxes-heading" className="font-display text-lg font-extrabold tracking-tight">
            Inboxes
          </h2>
        </div>
        {inboxes === null ? (
          <div role="status" className="h-32 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading inboxes...</span>
          </div>
        ) : isFailure(inboxes) ? (
          <p role="alert" className="waitlist-error">
            Inboxes couldn&apos;t be loaded. {problemText(inboxes)}
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {inboxes.map((i) => {
              const active = i.id === current?.id;
              return (
                <li key={i.id} className="group flex items-center gap-1">
                  <Link
                    href={`/inbox/${encodeURIComponent(i.id)}`}
                    aria-current={active ? "page" : undefined}
                    className={`grid min-w-0 flex-1 gap-1 rounded-xl px-3 py-2 font-bold focus-visible:outline-offset-[-3px] ${
                      active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon name="inbox" className={`size-4 shrink-0 ${active ? "text-signal" : ""}`} />
                      <span className="truncate">{inboxName(i)}</span>
                    </span>
                    {!i.is_all && i.account_ids.length > 0 && (
                      <span aria-hidden="true" className="flex -space-x-1.5 pl-6">
                        {i.account_ids.slice(0, 4).flatMap((id) => {
                          const a = accountById.get(id);
                          return a ? [<span key={id} className="rounded-full ring-2 ring-paper"><Avatar connection={a} size="size-5" /></span>] : [];
                        })}
                        {i.account_ids.length > 4 && <span className="pl-2.5 text-xs font-normal">+{i.account_ids.length - 4}</span>}
                      </span>
                    )}
                  </Link>
                  {Boolean(i.open_count) && (
                    <span className="badge tone shrink-0 tabular-nums" data-kind="dm">
                      {i.open_count}
                      <span className="sr-only"> open in {inboxName(i)}</span>
                    </span>
                  )}
                  {canManage && !i.is_all && (
                    <button
                      type="button"
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-ink/5 hover:text-ink focus-visible:outline-offset-[-3px]"
                      aria-label={`Edit ${i.name}`}
                      onClick={() => setEditing(i)}
                    >
                      <Icon name="edit" className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {Array.isArray(inboxes) && custom.length === 0 && (
          <p className="card mt-3 p-3 text-sm text-ink-soft">
            <strong className="block text-ink">No inboxes yet</strong>
            Group accounts into an inbox, for example one per brand.
          </p>
        )}
        {left.length > 0 && custom.length > 0 && (
          <p className="mt-3 text-sm text-ink-soft">
            {left.length === 1 ? "1 account is" : `${left.length} accounts are`} in no inbox, so {left.length === 1 ? "its" : "their"} messages show only in All inboxes.
          </p>
        )}
        {canManage &&
          (atLimit ? (
            <p className="mt-3 text-sm text-ink-soft">{planLimit("inboxes")}</p>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm mt-3 w-full" onClick={() => setEditing("new")}>
              <Icon name="plus" className="size-4" />
              New inbox
            </button>
          ))}
      </nav>

      <section aria-labelledby="items-heading" className={`${show("items")} grid content-start gap-3 lg:flex lg:flex-col lg:gap-0`}>
        <Link href="/inbox" className="flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink lg:hidden">
          <Icon name="left" className="size-4" />
          Inboxes
        </Link>
        <h2 id="items-heading" className="font-display text-lg font-extrabold tracking-tight lg:mb-3">
          {current ? inboxName(current) : "Inbox"}
        </h2>
        <div className="grid gap-2 lg:mb-3">
          <div className="flex items-center gap-2">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Search {current ? inboxName(current) : "this inbox"}</span>
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft" />
              <input id="inbox-search" type="search" maxLength={100} className="field w-full py-1.5 pl-9" placeholder="Search text or author" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <nav aria-label="State" className="flex shrink-0 gap-0.5 rounded-full bg-ink/5 p-1">
              {(["open", "done"] as const).map((s) => (
                <Link
                  key={s}
                  aria-current={state === s ? "true" : undefined}
                  href={href({ state: s, item: itemId })}
                  className={`rounded-full px-3 py-1 text-center text-sm font-bold ${state === s ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
                >
                  {s === "open" ? "Open" : "Done"}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterMenu label="Kind" value={kind} options={kindOptions} onChange={setKind} />
            <FilterMenu label="Assigned" value={assigned} options={assignedOptions} onChange={(v) => router.replace(href({ assigned: v, item: itemId }), { scroll: false })} />
          </div>
          {(kind !== "all" || assigned || tag) && (
            <ul aria-label="Active filters" className="flex flex-wrap items-center gap-1.5">
              {kind !== "all" && (
                <li className={chip}>
                  {kindOptions.find((o) => o.value === kind)?.label}
                  <button type="button" aria-label="Clear the kind filter" className={chipClear} onClick={() => setKind("all")}>
                    <Icon name="close" className="size-3" />
                  </button>
                </li>
              )}
              {assigned && (
                <li className={chip}>
                  Assigned: {assignedOptions.find((o) => o.value === assigned)?.label ?? "one person"}
                  <Link href={href({ assigned: "", item: itemId })} scroll={false} aria-label="Clear the assigned filter" className={chipClear}>
                    <Icon name="close" className="size-3" />
                  </Link>
                </li>
              )}
              {tag && (
                <li className={chip}>
                  Tag: {tag}
                  <Link href={href({ tag: "", item: itemId })} scroll={false} aria-label={`Clear the tag filter ${tag}`} className={chipClear}>
                    <Icon name="close" className="size-3" />
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
        {stuck.map((p) => (
          <p key={p.thread} role="alert" className="waitlist-error lg:mb-3">
            <button type="button" className={linkButton} onClick={() => go(p.itemId, "push")}>
              A reply to {p.name} {p.unsure ? "may not have been sent" : "was not sent"}
            </button>
          </p>
        ))}
        {/* p-px keeps the card's 1px ring inside the scroller. */}
        <div className="grid content-start gap-3 lg:block lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:p-px">
          {noAccounts ? (
            <div className="card grid gap-3 p-5">
              <p>
                <strong className="block">No accounts connected</strong>
                <span className="text-ink-soft">Connect a Bluesky, Facebook or Instagram account and its comments, mentions and DMs land here.</span>
              </p>
              <Link href="/connections" className="btn btn-primary justify-self-start">
                Connect an account
              </Link>
            </div>
          ) : page === null ? (
            <div role="status" className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
              <span className="sr-only">Loading items...</span>
            </div>
          ) : isFailure(page) ? (
            <p role="alert" className="waitlist-error">
              Items couldn&apos;t be loaded. {problemText(page)}
            </p>
          ) : items.length === 0 ? (
            <>
            <p className="card p-5 text-ink-soft">
              {q
                ? `Nothing matches "${q}".`
                : assigned || tag
                ? "Nothing matches these filters."
                : state === "done"
                ? "Nothing marked done yet."
                : kind !== "all"
                  ? "No items of this kind here."
                  : current && !current.is_all && current.account_ids.length === 0
                  ? "This inbox has no accounts. Edit it to add some."
                  : "Nothing here yet. New comments, mentions and DMs show up here within a minute."}
            </p>
            {loadMoreButton}
            </>
          ) : (
            <>
              <ul
                ref={rowsRef}
                aria-label="Items"
                className="card divide-y divide-ink/10 overflow-hidden"
                // Up and Down move between rows; Enter opens one, as any link.
                onKeyDown={(e) => {
                  const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
                  if (!step) return;
                  const links = [...e.currentTarget.querySelectorAll("a")];
                  const next = links[links.indexOf(document.activeElement as HTMLAnchorElement) + step];
                  if (!next) return;
                  e.preventDefault();
                  next.focus();
                }}
              >
                {items.map((i) => {
                  const selected = i.id === itemId || threadKey(i) === openKey;
                  // A conversation row: its latest DM, with the count and whether anything in it is still open.
                  const c = i.conversation;
                  const dot = c ? (c.open_count > 0 ? "Unread" : null) : i.replied_at ? null : "Unanswered";
                  return (
                    <li key={i.id} className="relative">
                      <Link
                        href={href({ item: i.id })}
                        scroll={false}
                        onClick={() => setOpened(i.id)}
                        aria-current={selected ? "true" : undefined}
                        className={`flex gap-2.5 px-3 py-2.5 focus-visible:outline-offset-[-3px] ${selected ? "bg-signal/[0.07] shadow-[inset_3px_0_0_var(--color-signal)]" : "hover:bg-ink/[0.03]"}`}
                      >
                        <AuthorAvatar author={i.author} size="size-9" />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="flex min-w-0 items-center gap-2">
                            {dot && (
                              <>
                                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-signal" title={dot} />
                                <span className="sr-only">{dot}:</span>
                              </>
                            )}
                            <strong className="min-w-0 truncate">{authorName(i.author)}</strong>
                            {/* The handle gives way first when the row is narrow. */}
                            {i.author.handle && i.author.name && <span className="min-w-0 shrink-[4] truncate text-sm text-ink-soft">@{i.author.handle}</span>}
                            <time dateTime={c?.last_at ?? i.received_at} className="ml-auto shrink-0 text-xs text-ink-soft">
                              {relativeTime(c?.last_at ?? i.received_at)}
                            </time>
                          </span>
                          <span className="line-clamp-2 text-sm text-ink-soft">{itemSummary(i)}</span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <KindBadge kind={i.kind} />
                            {c && <span className="text-xs text-ink-soft">{messageCount(c.count)}</span>}
                            {/* With one custom inbox every row would carry the same chip. */}
                            {current?.is_all &&
                              custom.length > 1 &&
                              i.inbox_ids?.flatMap((id) => {
                                const n = nameOf.get(id);
                                return n ? [<span key={id} className="badge max-w-32 truncate">{n}</span>] : [];
                              })}
                            {i.assigned_to && (
                              <span className="ml-auto grid size-5 place-items-center rounded-full bg-ink text-[0.65rem] font-bold text-paper" title={`Assigned to ${i.assigned_to.name}`}>
                                <span aria-hidden="true">{i.assigned_to.name.charAt(0).toUpperCase()}</span>
                                <span className="sr-only">Assigned to {i.assigned_to.name}</span>
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {loadMoreButton}
            </>
          )}
        </div>
      </section>

      <section aria-label="Item" className={`${show("detail")} lg:block lg:overflow-y-auto lg:overscroll-contain lg:p-px`}>
        <Link href={href({ item: null })} scroll={false} className="mb-3 flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink lg:hidden">
          <Icon name="left" className="size-4" />
          Back to {current ? inboxName(current) : "the inbox"}
        </Link>
        {!itemId ? (
          <div className="hidden h-full place-content-center justify-items-center gap-3 p-8 text-center text-sm text-ink-soft lg:grid">
            <p>Pick an item to read it and reply.</p>
            <p>
              <Key>J</Key> and <Key>K</Key> move between items, <Key>E</Key> marks one done, <Key>R</Key> replies.
            </p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setHelp(true)}>
              All shortcuts <Key>?</Key>
            </button>
          </div>
        ) : detail === null ? (
          <div role="status" className="h-80 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading the item...</span>
          </div>
        ) : isFailure(detail) ? (
          <p role="alert" className="waitlist-error">
            This item couldn&apos;t be loaded. {problemText(detail, replyMessages)}
          </p>
        ) : (
          <Detail
            key={detail.id}
            item={detail}
            row={items.find((x) => threadKey(x) === openKey)}
            focus={opened === detail.id}
            account={accountList.find((a) => a.id === detail.social_account_id)}
            me={user}
            members={members}
            tagOptions={tagOptions}
            pending={outbox.filter((p) => p.thread === openKey)}
            setPending={setOutbox}
            onChange={changed}
            onDone={markDone}
          />
        )}
      </section>

      {undos.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto grid w-fit max-w-[calc(100vw-2rem)] justify-items-center gap-2">
          {undos.map((u) => (
            <div key={u.id} role={u.problem ? "alert" : "status"} className="flex items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-sm font-bold text-paper shadow-lg">
              {u.problem ? (
                <span>
                  {authorName(u.item.author)} {u.undoing ? "couldn't be reopened, so it is still done." : "couldn't be marked done, so it is back in the list."} {problemText(u.problem, inboxMessages)}
                </span>
              ) : (
                <span>
                  Marked done. <span className="font-normal opacity-80">{authorName(u.item.author)}</span>
                </span>
              )}
              <button
                type="button"
                className="rounded-full bg-paper/15 px-3 py-1 hover:bg-paper/25"
                aria-label={u.problem ? undefined : `Undo marking ${authorName(u.item.author)} done`}
                onClick={() => (u.problem ? setUndos((l) => l.filter((x) => x.id !== u.id)) : undoDone(u))}
              >
                {u.problem ? "Dismiss" : "Undo"}
              </button>
            </div>
          ))}
        </div>
      )}
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}

      {editing && (
        <InboxEditor
          inbox={editing === "new" ? null : editing}
          accounts={accountList}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setInboxes((l) => (Array.isArray(l) ? (l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved]) : l));
            // The saved inbox comes without its count, and new filters change it.
            listInboxes().then((l) => Array.isArray(l) && setInboxes(l));
            if (editing === "new") getBilling().then((r) => !isFailure(r) && setBilling(r));
            // Its filters changed, so its items did too.
            if (saved.id === currentId) setReloads((n) => n + 1);
          }}
          onDeleted={(id) => {
            setInboxes((l) => (Array.isArray(l) ? l.filter((x) => x.id !== id) : l));
            if (id === inboxId) router.replace("/inbox");
          }}
        />
      )}
    </div>
  );
}

const stills: Attachment["kind"][] = ["image", "sticker", "gif"];

// A thumbnail linking to the file. Meta's links expire: a still that no longer loads falls back to the kind's label.
// no-referrer: the platform learns nothing beyond the link it gave out.
function AttachmentLink({ a }: { a: Attachment }) {
  const [broken, setBroken] = useState(false);
  const name = attachmentName[a.kind];
  const still = a.preview_url ?? (stills.includes(a.kind) ? a.url : undefined);
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="group relative block rounded-xl hover:opacity-90">
      {still && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- a platform link that expires, not ours to optimize
        <img src={still} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-28 rounded-xl border border-ink/10 bg-canvas object-cover" />
      ) : (
        <span className="badge tone gap-1">
          {name}
          <Icon name="external" className="size-3.5" />
        </span>
      )}
      <span className="sr-only"> (view the original, opens in a new tab)</span>
    </a>
  );
}

function Attachments({ items }: { items?: Attachment[] }) {
  if (!items?.length) return null;
  return (
    <ul aria-label="Attachments" className="flex max-w-[90%] flex-wrap gap-2">
      {items.map((a, n) => (
        <li key={n}>
          <AttachmentLink a={a} />
        </li>
      ))}
    </ul>
  );
}

const Key = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-md border border-ink/20 bg-paper px-1.5 py-0.5 font-mono text-xs font-bold text-ink">{children}</kbd>
);

// The reply box grows with its text up to this height, then scrolls.
const REPLY_MAX_PX = 192;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Detail({
  item,
  row,
  account,
  focus,
  me,
  members,
  tagOptions,
  pending,
  setPending,
  onChange,
  onDone,
}: {
  item: Item;
  // The list row of this item or, for a DM, of its conversation.
  row?: Item;
  account?: Connection;
  focus: boolean;
  me: Person;
  members: Person[];
  tagOptions: string[];
  // This thread's replies not yet confirmed, and the Inbox's setter over all of them.
  pending: Pending[];
  setPending: (f: (l: Pending[]) => Pending[]) => void;
  onChange: (i: Item) => void;
  onDone: (i: Item) => void;
}) {
  const dm = item.kind === "dm";
  const [text, setText] = useState("");
  // A DM opens as its whole conversation: null while it loads.
  const [convo, setConvo] = useState<ConversationPage | null>(null);
  const [convoProblem, setConvoProblem] = useState<Failure | null>(null);
  const [earlier, setEarlier] = useState<Failure | "loading" | null>(null);
  // The unsure reply whose Send again waits for a yes.
  const [confirming, setConfirming] = useState<number | null>(null);
  const [reloads, setReloads] = useState(0);
  const [sent, setSent] = useState<{ text: string; n: number } | null>(null);
  // Saving the typed text as a saved reply: null, or the name being typed.
  const [naming, setNaming] = useState<string | null>(null);
  const [kept, setKept] = useState<Problem | "saved" | null>(null);
  const action = useAction();
  const meta = useAction();
  const who = item.assigned_to ?? null;
  // The team's members, with me and whoever has the item even when the list did not load or they left.
  const people = [...members, me, ...(who ? [who] : [])].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const threadRef = useRef<HTMLOListElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // The newest page of the conversation, again whenever the list shows a newer DM in it.
  const newest = row?.id;
  useEffect(() => {
    if (!dm) return;
    let live = true;
    getConversation(item.id).then((r) => {
      if (!live) return;
      setConvoProblem(isFailure(r) ? r : null);
      if (!isFailure(r)) setConvo((c) => mergeConversation(c, r));
    });
    return () => {
      live = false;
    };
    // Read again too when a reply of this thread settles: it may have gone out while another item was open.
  }, [dm, item.id, newest, reloads, pending.length]);

  const thread = dm ? (convo?.items ?? []) : [item];
  // A reply goes to the latest message of a conversation.
  const latest = thread.at(-1) ?? item;
  const rows = chatRows(thread).filter((r) => dm || r.type !== "day");
  const isOpen = item.state === "open" || (dm && ((row?.conversation?.open_count ?? 0) > 0 || thread.some((i) => i.state === "open")));
  const max = maxFor(item.kind, account?.provider);
  const platform = platformName(account?.provider ?? "bluesky");
  const count = graphemes(text);
  const sending = pending.some((p) => !settled(p));

  const assign = (id: string | null) =>
    meta.run("assign", () => assignItem(item.id, id, dm), (r) => {
      onChange(r);
      return r.assigned_to ? `Assigned to ${r.assigned_to.name}.` : "Unassigned.";
    });
  const saveTags = (tags: string[]) =>
    meta.run("tags", () => updateContact(item.contact_id!, { tags }), (c) => {
      onChange({ ...item, contact_tags: c.tags });
      return "Tags saved.";
    });
  async function keep() {
    const name = naming?.trim();
    if (!name) return;
    const r = await createSnippet({ kind: "reply", name, body: text });
    setKept(isProblem(r) ? r : "saved");
    if (!isProblem(r)) setNaming(null);
  }

  // Opened from the list: focus moves here (on a phone the list is gone). A shared link leaves focus alone.
  useEffect(() => {
    if (focus) headingRef.current?.focus();
  }, [focus]);

  // A conversation opens at its newest message and follows each new one.
  const lastKey = `${rows.at(-1)?.key}:${pending.length}`;
  useEffect(() => {
    const el = threadRef.current;
    if (dm && el) el.scrollTop = el.scrollHeight;
  }, [dm, lastKey]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    // 2px for the borders, which scrollHeight leaves out.
    el.style.height = `${Math.min(el.scrollHeight + 2, REPLY_MAX_PX)}px`;
  }, [text]);

  async function loadEarlier() {
    const first = convo?.items[0];
    if (!first) return;
    setEarlier("loading");
    const r = await getConversation(item.id, first.id);
    if (isFailure(r)) return setEarlier(r);
    const el = threadRef.current;
    const fromEnd = el ? el.scrollHeight - el.scrollTop : 0;
    flushSync(() => {
      setEarlier(null);
      setConvo((c) => c && { items: [...r.items.filter((i) => !c.items.some((x) => x.id === i.id)), ...c.items], has_more: r.has_more });
    });
    // The messages on screen stay where they were.
    if (el) el.scrollTop = el.scrollHeight - fromEnd;
  }

  const change = (id: number, to: Partial<Pending>) => setPending((l) => l.map((x) => (x.id === id ? { ...x, ...to } : x)));
  const drop = (id: number) => setPending((l) => l.filter((x) => x.id !== id));
  // A reply that went out: the thread shows it, and for a DM it closed every open DM of the conversation.
  function wentOut(p: Pending, r: Item) {
    drop(p.id);
    if (dm) setConvo((c) => c && { ...c, items: c.items.map((i) => (i.id === r.id ? r : i.state === "open" ? { ...i, state: "done" } : i)) });
    else setSent((d) => ({ text: "Reply sent.", n: (d?.n ?? 0) + 1 }));
    onChange(r);
  }

  // The reply is in the thread before brain answers. A refusal marks it Not sent with Retry. No clear answer
  // is not a refusal: brain may have sent it, so the thread is read again and only a confirmed Send again resends.
  async function send(p: Pending) {
    setSent(null);
    setConfirming(null);
    setPending((l) => (l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? { ...x, failed: undefined, unsure: false } : x)) : [...l, p]));
    const r = await replyToItem(latest.id, p.text, dm);
    if (!isFailure(r) && "id" in r) return wentOut(p, r);
    if (isFailure(r)) return change(p.id, { failed: problemText(r, replyMessages) });
    if ("code" in r) return change(p.id, { failed: sendMessages[r.code] ?? r.message });
    const again = dm ? await getConversation(item.id) : await getItem(item.id);
    const got = isFailure(again) ? [] : "items" in again ? again.items : [again];
    const there = sentAlready(got, p.text);
    if (!there) return change(p.id, { unsure: true });
    if (!isFailure(again) && "items" in again) setConvo((c) => mergeConversation(c, again));
    wentOut(p, there);
  }

  function onReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Ctrl+Enter submits even while the button is disabled.
    if (sending || !text.trim() || count > max) return;
    send({ id: ++lastId, thread: threadKey(item), itemId: item.id, name: authorName(item.author), text });
    setText("");
  }

  const reopen = () =>
    action.run("state", () => setItemState(item.id, "open", dm), (r) => {
      if (dm) setConvo((c) => c && { ...c, items: c.items.map((i) => ({ ...i, state: "open" })) });
      onChange(r);
      return "Reopened.";
    });

  const messages = row?.conversation?.count;
  return (
    // From lg up the card fills the reader: the thread scrolls and the reply box stays at the bottom.
    <article className="card grid grid-cols-[minmax(0,1fr)] gap-5 p-5 lg:h-full lg:grid-rows-[auto_minmax(6rem,1fr)] lg:gap-4">
      <header className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex items-start gap-3">
        <AuthorAvatar author={item.author} size="size-12" />
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} tabIndex={-1} className="truncate font-display text-lg font-extrabold tracking-tight focus:outline-none">
            {authorName(item.author)}
          </h2>
          <p className="truncate text-sm text-ink-soft">
            {item.author.handle && item.author.name ? `@${item.author.handle}, ` : ""}
            {dm ? "DMs with" : `${kindName[item.kind]} to`} {account ? accountName(account) : "your account"}
            {messages ? `, ${messageCount(messages)}` : ""}
          </p>
        </div>
        <KindBadge kind={item.kind} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {item.contact_id && (
            <>
              <TagEditor id="item-tags" tags={item.contact_tags ?? []} suggestions={tagOptions} disabled={meta.busy !== null} onChange={saveTags} />
              <Link href={`/contacts?contact=${encodeURIComponent(item.contact_id)}`} className="font-bold underline decoration-signal decoration-2 underline-offset-4">
                Open contact
              </Link>
            </>
          )}
          <label className="ml-auto flex items-center gap-2 font-bold">
            Assign
            <select className="field w-auto py-1 text-sm font-normal" value={who?.id ?? ""} disabled={meta.busy !== null} onChange={(e) => assign(e.target.value || null)}>
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {who?.id !== me.id && (
            <button id="assign-me" type="button" className="btn btn-quiet btn-sm" disabled={meta.busy !== null} onClick={() => assign(me.id)}>
              Assign to me
            </button>
          )}
        </div>
        <Status problem={meta.problem} done={meta.done} overrides={metaMessages} />
      </header>

      {/* A conversation scrolls in its own box on every screen, so it can open at the newest message. */}
      <ol
        ref={threadRef}
        aria-label={dm ? "Conversation" : "Thread"}
        className={`grid grid-cols-[minmax(0,1fr)] content-start gap-3 lg:-m-1 lg:overflow-y-auto lg:overscroll-contain lg:p-1 ${dm ? "max-lg:max-h-[55dvh] max-lg:overflow-y-auto" : ""}`}
      >
        {dm && !convo && !convoProblem && (
          <li role="status" className="h-24 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading the conversation...</span>
          </li>
        )}
        {dm && convoProblem && (
          <li className="grid justify-items-start gap-1">
            <p role="alert" className="waitlist-error">
              {convo ? "The conversation couldn't be read again." : "The conversation couldn't be loaded."} {problemText(convoProblem)}
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setConvoProblem(null);
                setReloads((n) => n + 1);
              }}
            >
              Retry
            </button>
          </li>
        )}
        {dm && convo?.has_more && (
          <li className="grid justify-items-center gap-1">
            <button type="button" className="btn btn-secondary btn-sm" disabled={earlier === "loading"} onClick={loadEarlier}>
              {earlier === "loading" ? "Loading..." : "Load earlier"}
            </button>
            {isFailure(earlier) && (
              <p role="alert" className="waitlist-error">
                Earlier messages couldn&apos;t be loaded. {problemText(earlier)}
              </p>
            )}
          </li>
        )}
        {rows.map((r) =>
          r.type === "day" ? (
            <li key={r.key} data-row="day" className="flex items-center gap-3 text-xs font-bold text-ink-soft before:h-px before:flex-1 before:bg-ink/10 after:h-px after:flex-1 after:bg-ink/10">
              {r.label}
            </li>
          ) : r.type === "them" ? (
            <li key={r.key} data-row="them" className="grid justify-items-start gap-1">
              {(r.text || !r.item.attachments?.length) && <p className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-canvas px-4 py-3">{r.text || "(no text)"}</p>}
              <Attachments items={r.item.attachments} />
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
                <time dateTime={r.at}>{when(r.at)}</time>
                {r.item.remote_url && (
                  <a href={r.item.remote_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold hover:text-ink">
                    View on {platform}
                    <Icon name="external" className="size-3.5" />
                  </a>
                )}
              </p>
            </li>
          ) : (
            <li key={r.key} data-row="us" className="grid justify-items-end gap-1">
              <p className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-ink px-4 py-3 text-paper">{r.text}</p>
              <p className="flex flex-wrap items-center justify-end gap-x-3 text-xs text-ink-soft">
                <span>
                  {r.reply.automation_id ? "Automation" : "Team"}, {r.reply.kind === "dm" ? "DM" : "public reply"}
                </span>
                <time dateTime={r.at}>{when(r.at)}</time>
                {r.reply.remote_url && (
                  <a href={r.reply.remote_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold hover:text-ink">
                    View
                    <Icon name="external" className="size-3.5" />
                    <span className="sr-only">reply on {platform}</span>
                  </a>
                )}
              </p>
            </li>
          ),
        )}
        {pending.map((p) => (
          <li key={p.id} data-row="us" className="grid justify-items-end gap-1">
            <p className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md px-4 py-3 ${settled(p) ? "bg-ink/10 text-ink" : "bg-ink/60 text-paper"}`}>{p.text}</p>
            {settled(p) ? (
              <div className="grid max-w-[90%] justify-items-end gap-1 text-right text-xs">
                <p role="alert" className="font-bold text-signal-deep">
                  {p.unsure ? "This may have been sent. Check the conversation before sending again." : <>Not sent. {p.failed}</>}
                </p>
                {confirming === p.id ? (
                  <p className="flex flex-wrap items-center justify-end gap-3">
                    <span id={`again-${p.id}`}>It may have been sent already. Send again?</span>
                    <button type="button" className={linkButton} aria-describedby={`again-${p.id}`} autoFocus disabled={sending} onClick={() => send(p)}>
                      Yes, send again
                    </button>
                    <button type="button" className="font-bold text-ink-soft hover:text-ink" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </p>
                ) : (
                  <p className="flex gap-3">
                    {/* Only a refusal gets a plain Retry. */}
                    <button type="button" className={linkButton} disabled={sending} onClick={() => (p.unsure ? setConfirming(p.id) : send(p))}>
                      {p.unsure ? "Send again" : "Retry"}
                    </button>
                    <button type="button" className="font-bold text-ink-soft hover:text-ink" onClick={() => drop(p.id)}>
                      Discard
                    </button>
                  </p>
                )}
              </div>
            ) : (
              <p role="status" className="text-xs text-ink-soft">
                Sending...
              </p>
            )}
          </li>
        ))}
      </ol>

      <XActions item={item} />
      {/* A follow has nothing to reply to. */}
      <form onSubmit={onReply} hidden={item.kind === "follow"} className="grid gap-2 border-t border-ink/10 pt-4 [&[hidden]]:hidden">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor="reply-text" className="label">
            {dm ? "Send DM" : "Reply publicly"}
          </label>
          <SnippetMenu target="reply-text" label="the reply" value={text} onChange={setText} replies />
        </div>
        <textarea
          id="reply-text"
          ref={boxRef}
          rows={2}
          className="field resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          aria-describedby="reply-count"
          aria-invalid={count > max || undefined}
          placeholder={dm ? `Message ${authorName(item.author)}` : `Reply to ${authorName(item.author)} on ${platform}`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={sending || !text.trim() || count > max}>
            <Icon name="send" className="size-4" />
            {dm ? "Send DM" : "Reply publicly"}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={!text.trim() || naming !== null}
            onClick={() => {
              setKept(null);
              flushSync(() => setNaming(""));
              document.getElementById("saved-reply-name")?.focus();
            }}
          >
            Save as saved reply
          </button>
          <p id="reply-count" className={`hint ml-auto ${count > max ? "font-bold text-signal-deep" : ""}`}>
            {count} of {max} characters
          </p>
        </div>
        {naming !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="saved-reply-name"
              aria-label="Saved reply name"
              placeholder="Name it, like Opening hours"
              maxLength={60}
              className="field min-w-40 flex-1 py-1.5"
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              // Enter saves the saved reply, not the form around it, which would send the reply.
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                keep();
              }}
            />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!naming.trim() || !text.trim()} onClick={keep}>
              Save saved reply
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setNaming(null)}>
              Cancel
            </button>
          </div>
        )}
        {kept === "saved" ? (
          <p role="status" className="waitlist-done">
            Saved. Find it under Insert saved reply and in the Library.
          </p>
        ) : (
          kept && (
            <p role="alert" className="waitlist-error">
              {libraryText(kept) ?? problemText(kept.code)}
            </p>
          )
        )}
        <Status problem={null} done={sent} />
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
        {isOpen ? (
          <button id="mark-done" type="button" className="btn btn-secondary btn-sm" onClick={() => onDone(item)}>
            Mark done
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={action.busy !== null} onClick={reopen}>
            {action.busy ? "Saving..." : "Reopen"}
          </button>
        )}
        <span className="text-sm text-ink-soft">{!isOpen ? "Done." : latest.replied_at ? `Answered ${relativeTime(latest.replied_at)}.` : "Not answered yet."}</span>
      </div>
      <Status problem={action.problem} done={action.done} overrides={inboxMessages} />
    </article>
  );
}
