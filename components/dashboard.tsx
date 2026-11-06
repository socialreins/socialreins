"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Failure } from "@/lib/auth";
import { listAutomations, type Automation } from "@/lib/automations";
import { listConnections, needingReconnect, type Connection } from "@/lib/connections";
import { manages } from "@/lib/teams";
import { authorName, kindName, listInboxes, listItems, relativeTime, type Item } from "@/lib/inbox";
import { listPosts, type Post } from "@/lib/posts";
import { useCurrentSet, useSession } from "@/components/app-shell";
import { ReconnectNotice } from "@/components/connections";
import { AccountNote, PlatformMark, snippet, StatusBadge } from "@/components/posts";
import { isFailure, problemText } from "@/components/team-ui";

const DAY = 86_400_000;
type Load<T> = T | Failure | null;
type InboxSummary = { inboxId: string; items: Item[]; more: boolean };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const postTime = (p: Post) => p.published_at ?? p.scheduled_at ?? p.created_at;

// The app's home: a summary of the current set's posts, the inbox, automations and accounts, each linking to its page.
export function Dashboard() {
  const [setId] = useCurrentSet();
  const { user } = useSession();
  // Fixed per visit, so the windows below don't shift while the page is open.
  const [now] = useState(() => Date.now());
  const [posts, setPosts] = useState<Load<Post[]>>(null);
  const [drafts, setDrafts] = useState<Load<Post[]>>(null);
  const [inbox, setInbox] = useState<Load<InboxSummary>>(null);
  const [automations, setAutomations] = useState<Load<Automation[]>>(null);
  const [accounts, setAccounts] = useState<Load<Connection[]>>(null);

  useEffect(() => {
    let live = true;
    const from = new Date(now - 30 * DAY).toISOString();
    const to = new Date(now + 30 * DAY).toISOString();
    listPosts({ social_set_id: setId, from, to }).then((r) => live && setPosts(r));
    listPosts({ social_set_id: setId, status: "draft" }).then((r) => live && setDrafts(r));
    return () => {
      live = false;
    };
  }, [setId, now]);

  useEffect(() => {
    listConnections().then(setAccounts);
    listAutomations().then(setAutomations);
    listInboxes().then(async (r) => {
      if (isFailure(r)) return setInbox(r);
      const all = r.find((i) => i.is_all) ?? r[0];
      if (!all) return setInbox({ inboxId: "", items: [], more: false });
      const page = await listItems(all.id, "open");
      setInbox(isFailure(page) ? page : { inboxId: all.id, items: page.items, more: page.next_cursor !== null });
    });
  }, []);

  const list = Array.isArray(posts) ? posts : [];
  const upcoming = list.filter((p) => (p.status === "scheduled" || p.status === "queued") && p.scheduled_at).sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
  const failed = list.filter((p) => p.status === "failed").sort((a, b) => Date.parse(postTime(b)) - Date.parse(postTime(a)));
  const published = list.filter((p) => p.status === "published").sort((a, b) => Date.parse(postTime(b)) - Date.parse(postTime(a)));
  const nextWeek = upcoming.filter((p) => Date.parse(p.scheduled_at!) < now + 7 * DAY).length;
  const lastWeek = published.filter((p) => Date.parse(postTime(p)) > now - 7 * DAY).length;
  const active = Array.isArray(automations) ? automations.filter((a) => a.active) : [];
  const runs = active.reduce((n, a) => n + (a.runs?.count ?? 0), 0);
  const count = <T,>(v: Load<T[]>, n?: number) => (v === null ? null : isFailure(v) ? "-" : (n ?? v.length).toLocaleString());

  return (
    <div className="grid gap-6">
      <AccountNote />
      <ReconnectNotice
        accounts={Array.isArray(accounts) ? needingReconnect(accounts) : []}
        canManage={manages(user.current_team.role)}
        title="Accounts need reconnecting"
        lead="A sign-in that has ended, or ends within a week, stops posts to that account. Reconnect it to keep posting."
      />
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile href="/app/posts" label="Scheduled, next 7 days" value={count(posts, nextWeek)} />
          <Tile href="/app/posts" label="Published, last 7 days" value={count(posts, lastWeek)} />
          <Tile href="#needs-attention" label="Failed, last 30 days" value={count(posts, failed.length)} alert={failed.length > 0} />
          <Tile href="/app/posts" label="Drafts" value={count(drafts)} />
          <Tile
            href="/app/inbox"
            label="Open in inbox"
            value={inbox === null ? null : isFailure(inbox) ? "-" : `${inbox.items.length}${inbox.more ? "+" : ""}`}
          />
          <Tile href="/app/connections" label="Connected accounts" value={count(accounts)} />
        </ul>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <Panel id="up-next" title="Up next" link={{ href: "/app/posts", label: "Open calendar" }} load={posts}>
            {upcoming.length === 0 ? (
              <Empty>
                Nothing is scheduled.{" "}
                <Link href="/app/posts/new" className="font-bold underline">
                  Write a post
                </Link>
              </Empty>
            ) : (
              <PostRows posts={upcoming.slice(0, 6)} at={(p) => p.scheduled_at!} />
            )}
          </Panel>
          <Panel id="needs-attention" title="Needs attention" load={posts}>
            {failed.length === 0 ? (
              <Empty>Nothing failed in the last 30 days.</Empty>
            ) : (
              <PostRows posts={failed.slice(0, 6)} at={postTime} detail={(p) => p.error} />
            )}
          </Panel>
          <Panel id="recent" title="Recently published" load={posts}>
            {published.length === 0 ? <Empty>Nothing published in the last 30 days.</Empty> : <PostRows posts={published.slice(0, 6)} at={postTime} />}
          </Panel>
        </div>
        <div className="grid gap-6">
          <Panel id="inbox" title="Inbox" link={{ href: "/app/inbox", label: "Open inbox" }} load={inbox}>
            {inbox && !isFailure(inbox) && inbox.items.length === 0 ? (
              <Empty>No open comments, mentions or DMs.</Empty>
            ) : (
              inbox &&
              !isFailure(inbox) && (
                <ul className="divide-y divide-[var(--line-soft)]">
                  {inbox.items.slice(0, 6).map((i) => (
                    <li key={i.id}>
                      <Link
                        href={`/app/inbox/${encodeURIComponent(inbox.inboxId)}?item=${encodeURIComponent(i.id)}`}
                        className="grid gap-0.5 px-4 py-2.5 hover:bg-ink/[0.025]"
                      >
                        <span className="flex items-center gap-2">
                          <strong className="min-w-0 truncate">{authorName(i.author)}</strong>
                          <span className="badge tone" data-kind={i.kind}>
                            {kindName[i.kind]}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-ink-soft">{relativeTime(i.received_at, now)}</span>
                        </span>
                        <span className="truncate text-ink-soft">{i.text || "(no text)"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}
          </Panel>
          <Panel id="automations" title="Automations" link={{ href: "/app/automations", label: "Manage" }} load={automations}>
            <p className="px-4 py-3">
              {active.length === 0 ? (
                <span className="text-ink-soft">No automation is on. Reply to comments automatically, or send a DM when someone comments a keyword.</span>
              ) : (
                <>
                  <strong>{active.length.toLocaleString()}</strong> on, with <strong>{runs.toLocaleString()}</strong> {runs === 1 ? "run" : "runs"} so far.
                </>
              )}
            </p>
          </Panel>
          <Panel id="accounts" title="Accounts" link={{ href: "/app/connections", label: "Manage" }} load={accounts}>
            {Array.isArray(accounts) && accounts.length === 0 ? (
              <Empty>No account is connected yet.</Empty>
            ) : (
              Array.isArray(accounts) && (
                <ul className="divide-y divide-[var(--line-soft)]">
                  {accounts.slice(0, 6).map((a) => (
                    <li key={a.id} className="flex items-center gap-2 px-4 py-2.5">
                      <span className="min-w-0 truncate font-bold">{a.display_name || a.handle}</span>
                      <span className="min-w-0 truncate text-ink-soft">@{a.handle}</span>
                      <span className="ml-auto shrink-0 text-xs text-ink-soft capitalize">{a.provider}</span>
                    </li>
                  ))}
                </ul>
              )
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Tile({ href, label, value, alert }: { href: string; label: string; value: string | null; alert?: boolean }) {
  return (
    <li>
      <Link href={href} className="card grid gap-1 px-4 py-3 hover:shadow-[0_0_0_1px_#cfcac4,0_1px_2px_rgb(0_0_0/0.04)]">
        <span className="text-sm text-ink-soft">{label}</span>
        {value === null ? (
          <>
            <span className="sr-only">Loading</span>
            <span aria-hidden="true" className="h-7 w-10 rounded bg-ink/5 motion-safe:animate-pulse" />
          </>
        ) : (
          <span className={`text-2xl font-bold tabular-nums ${alert ? "text-signal-deep" : ""}`}>{value}</span>
        )}
      </Link>
    </li>
  );
}

function Panel({ id, title, link, load, children }: { id: string; title: string; link?: { href: string; label: string }; load: unknown; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="card scroll-mt-16 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5">
        <h2 id={`${id}-heading`} className="font-bold">
          {title}
        </h2>
        {link && (
          <Link href={link.href} className="text-sm font-bold text-signal-deep hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      {load === null ? (
        <div role="status" className="grid gap-2 p-4">
          <span className="sr-only">Loading {title.toLowerCase()}...</span>
          <div className="h-4 w-2/3 rounded bg-ink/5 motion-safe:animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-ink/5 motion-safe:animate-pulse" />
        </div>
      ) : isFailure(load as Failure) ? (
        <p role="alert" className="waitlist-error px-4 py-3">
          This couldn&apos;t be loaded. {problemText(load as Failure)}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function PostRows({ posts, at, detail }: { posts: Post[]; at: (p: Post) => string; detail?: (p: Post) => string | null }) {
  return (
    <ul className="divide-y divide-[var(--line-soft)]">
      {posts.map((p) => (
        <li key={p.id}>
          <Link href={`/app/posts/${p.id}`} className="grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-ink/[0.025]">
            <span className="text-sm text-ink-soft tabular-nums">{when(at(p))}</span>
            <span className="min-w-0">
              <span className="block truncate"><PlatformMark platform={p.platform} /> {snippet(p)}</span>
              {detail?.(p) && <span className="block truncate text-sm text-signal-deep">{detail(p)}</span>}
            </span>
            <StatusBadge status={p.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="px-4 py-3 text-ink-soft">{children}</p>;
