"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { TeamLink as Link } from "@/components/team-link";
import type { Failure } from "@/lib/auth";
import { compact, engagement, getAnalytics, postTotals, statWords } from "@/lib/analytics";
import { listConnections, needingReconnect } from "@/lib/connections";
import { address } from "@/lib/ref";
import { manages } from "@/lib/teams";
import { authorName, itemSummary, kindName, listInboxes, listItems, relativeTime, type Item } from "@/lib/inbox";
import { approvalState, listPosts, postRef, rows, toZoneInput, type Post } from "@/lib/posts";
import { getQueue, loadZones, zoneFor, zoneTag, type Queue } from "@/lib/queue";
import { useCurrentSet, useSession } from "@/components/app-shell";
import { ReconnectNotice } from "@/components/connections";
import { platformName } from "@/components/platform-icons";
import { AccountNote, ApprovalBadge, PlatformMark, snippet, StatusBadge } from "@/components/posts";
import { isFailure, problemText } from "@/components/team-ui";
import { Icon, Skeleton } from "@/components/ui";

const DAY = 86_400_000;
// null while loading.
type Load<T> = T | Failure | null;
// inboxId is what the inbox's address holds (its number).
type InboxSummary = { inboxId: string; items: Item[]; open: string };

// Times and days of a post are those of its set's time zone, tagged with the zone ("GMT+6") when it is not the browser's.
const clock = (iso: string, zone: string) => {
  const text = new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone });
  const tag = zoneTag(zone, new Date(iso));
  return tag ? `${text} ${tag}` : text;
};
const dayName = (t: number | string, zone: string) => new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: zone });
const shortDay = (iso: string, zone: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: zone });
const postTime = (p: Post) => p.published_at ?? p.scheduled_at ?? p.created_at;
// The calendar day of an instant in `zone`, as a number of days (the same count for the same date anywhere).
const dayNumber = (t: number | string, zone: string) => Date.parse(`${toZoneInput(new Date(t).toISOString(), zone).slice(0, 10)}T00:00:00Z`) / DAY;
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
// Map.groupBy, which Safari has only since 17.4.
function groupBy<T>(items: T[], key: (item: T) => string) {
  const out = new Map<string, T[]>();
  for (const i of items) out.set(key(i), [...(out.get(key(i)) ?? []), i]);
  return out;
}
const STATS_NOTE = "Stats cover Bluesky, Facebook, Instagram and YouTube";

// One call to brain per section, so a slow or failed one never holds the others back. A new `key` or a retry loads again.
function useLoad<T>(fn: () => Promise<T | Failure>, key: string): [Load<T>, () => void] {
  const [got, setGot] = useState<{ key: string; value: T | Failure } | null>(null);
  const [tries, setTries] = useState(0);
  const run = useEffectEvent(fn);
  const k = `${key} ${tries}`;
  useEffect(() => {
    let live = true;
    run().then((value) => live && setGot({ key: k, value }));
    return () => {
      live = false;
    };
  }, [k]);
  return [got?.key === k ? got.value : null, () => setTries((t) => t + 1)];
}

async function loadInbox(): Promise<InboxSummary | Failure> {
  const r = await listInboxes();
  if (isFailure(r)) return r;
  const all = r.find((i) => i.is_all) ?? r[0];
  if (!all) return { inboxId: "", items: [], open: "0" };
  const page = await listItems(all.id, "open");
  if (isFailure(page)) return page;
  // An older brain sends no count: say how many are on the first page instead.
  const open = all.open_count?.toLocaleString() ?? `${page.items.length}${page.next_cursor === null ? "" : "+"}`;
  return { inboxId: address(all), items: page.items, open };
}

// The app's home: a greeting, four numbers, what needs a person (grouped, or one calm line),
// today and tomorrow, then the inbox, the week's best post and what went out.
export function Dashboard() {
  const [setId] = useCurrentSet();
  const { user } = useSession();
  // Fixed per visit, so the windows below don't shift while the page is open.
  const [now] = useState(() => Date.now());
  const canManage = manages(user.current_team.role);

  // Each post's set zone is read with the posts, so no time or day shifts once they show.
  const [posts, retryPosts] = useLoad(async () => {
    const r = await listPosts({ social_set_id: setId, from: new Date(now - 30 * DAY).toISOString(), to: new Date(now + 30 * DAY).toISOString() });
    if (Array.isArray(r)) await loadZones(r.map((p) => p.social_set_id));
    return r;
  }, `posts ${setId}`);
  const [stats, retryStats] = useLoad(() => getAnalytics(setId, 7, now), `stats ${setId}`);
  const [queue] = useLoad<Queue>(() => (setId ? getQueue(setId) : Promise.resolve({ time_zone: "UTC", slots: [], next: [] })), `queue ${setId}`);
  const [inbox, retryInbox] = useLoad(loadInbox, "inbox");
  const [accounts] = useLoad(listConnections, "accounts");

  const list = Array.isArray(posts) ? posts : [];
  const newest = (a: Post, b: Post) => Date.parse(postTime(b)) - Date.parse(postTime(a));
  // One row per post: the versions of a group that go out together count once.
  const upcoming = rows(
    list.filter((p) => (p.status === "scheduled" || p.status === "queued") && p.scheduled_at).sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!)),
    (p) => p.scheduled_at!,
  );
  const published = rows(list.filter((p) => p.status === "published").sort(newest), () => "");
  // Only this week's failures: failed posts cannot be deleted, so older ones would sit here forever.
  // The same reason on the same network is one row, however many posts it stopped.
  const failures = [
    ...groupBy(list.filter((p) => p.status === "failed" && Date.parse(postTime(p)) > now - 7 * DAY).sort(newest), (p) => `${p.platform}\n${p.error ?? ""}`).values(),
  ];
  const waiting = canManage ? upcoming.filter((r) => approvalState(r[0]!) === "pending").length : 0;
  // Like the posts: only the picked set's accounts. The default set holds them all.
  const reconnect = Array.isArray(accounts) ? needingReconnect(setId ? accounts.filter((c) => c.set_ids.includes(setId)) : accounts) : [];

  // Today (with anything overdue) and tomorrow, by the calendar of each post's own set zone; when both are empty,
  // the next few posts under their own days.
  const zoneOf = (p: Post) => zoneFor(p.social_set_id);
  const daysAhead = (r: Post[]) => dayNumber(r[0]!.scheduled_at!, zoneOf(r[0]!)) - dayNumber(now, zoneOf(r[0]!));
  const soon = upcoming.filter((r) => daysAhead(r) <= 1);
  // Days of different zones can fall in either order of time, so the day groups are put in day order (a stable sort).
  const days = groupBy([...(soon.length > 0 ? soon : upcoming.slice(0, 3))].sort((x, y) => daysAhead(x) - daysAhead(y)), (r) => {
    const d = daysAhead(r);
    return d <= 0 ? "Today" : d === 1 ? "Tomorrow" : dayName(r[0]!.scheduled_at!, zoneOf(r[0]!));
  });

  const number = (n: number) => (posts === null ? null : isFailure(posts) ? "-" : n.toLocaleString());
  const analytics = stats !== null && !isFailure(stats) ? stats : null;
  const top = analytics?.top_posts?.[0];
  const topNumbers = top && postTotals([top]);
  const slot = queue !== null && !isFailure(queue) && queue.slots?.length > 0 && queue.next?.[0] ? { at: queue.next[0], zone: queue.time_zone } : undefined;
  const hour = new Date(now).getHours();
  const firstName = user.name.trim().split(/\s+/)[0];
  const calm = Array.isArray(posts) && Array.isArray(accounts) && failures.length === 0 && waiting === 0 && reconnect.length === 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}
            {firstName && `, ${firstName}`}
          </h2>
          <p className="text-ink-soft">{new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/posts/bulk" className="text-sm font-semibold text-ink-soft hover:text-ink hover:underline">
            Upload CSV
          </Link>
          <Link href="/posts/new" className="btn btn-primary">
            <Icon name="plus" className="size-4" />
            New post
          </Link>
        </div>
      </div>

      <AccountNote />

      <ul aria-label="This week" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard href="/calendar" label="Scheduled" sub="next 7 days" value={number(upcoming.filter((r) => Date.parse(r[0]!.scheduled_at!) < now + 7 * DAY).length)} />
        <StatCard href="/posts?status=published" label="Published" sub="last 7 days" value={number(published.filter((r) => Date.parse(postTime(r[0]!)) > now - 7 * DAY).length)} />
        <StatCard
          href="/analytics?range=7"
          label="Engagement"
          sub="last 7 days"
          title={STATS_NOTE}
          value={stats === null ? null : isFailure(stats) ? "-" : compact(stats.totals ? engagement(stats.totals) : 0)}
        >
          <Sparkline values={(analytics?.by_day ?? []).map(engagement)} />
        </StatCard>
        <StatCard href="/inbox" label="Open" sub="in the inbox" value={inbox === null ? null : isFailure(inbox) ? "-" : inbox.open} />
      </ul>

      {calm ? (
        <p className="enter flex items-center gap-2 text-ink-soft">
          <Icon name="check" className="size-4 text-[#2f9e5b]" />
          All clear. Nothing needs your attention.
        </p>
      ) : posts === null || accounts === null ? (
        <Skeleton className="my-0.5 h-4 w-64 max-w-full" />
      ) : (
        (failures.length > 0 || waiting > 0 || reconnect.length > 0) && (
          <div className="enter grid gap-3">
            {(failures.length > 0 || waiting > 0) && (
              <section id="needs-attention" aria-labelledby="needs-attention-heading" className="card scroll-mt-16 overflow-hidden">
                <h2 id="needs-attention-heading" className="border-b border-[var(--line)] px-4 py-2.5 font-semibold">
                  Needs attention
                </h2>
                <ul className="divide-y divide-[var(--line-soft)]">
                  {failures.map((group) => (
                    <FailureGroup key={`${group[0]!.platform} ${group[0]!.error}`} posts={group} />
                  ))}
                  {waiting > 0 && (
                    <li>
                      <Link href="/posts?approval=pending" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink/[0.025]">
                        <span className="flex items-center gap-2 font-semibold">
                          <span aria-hidden="true" className="dot" data-approval="pending" />
                          {waiting === 1 ? "1 post needs approval" : `${waiting} posts need approval`}
                        </span>
                        <span className="text-sm font-semibold text-signal-deep">Review</span>
                      </Link>
                    </li>
                  )}
                </ul>
              </section>
            )}
            <ReconnectNotice
              accounts={reconnect}
              canManage={canManage}
              title="Accounts need reconnecting"
              lead="A sign-in that has ended, or ends within a week, stops posts to that account. Reconnect it to keep posting."
            />
          </div>
        )
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-6">
          <Panel id="today" title="Today and next" link={{ href: "/calendar", label: "Open calendar" }} load={posts} retry={retryPosts} skeleton={4}>
            {soon.length === 0 && (
              <Empty>
                Nothing is scheduled for today or tomorrow.{" "}
                <Link href="/posts/new" className="font-bold underline">
                  Schedule a post
                </Link>
              </Empty>
            )}
            {[...days].map(([label, group]) => (
              <div key={label} className="border-t border-[var(--line-soft)] first:border-t-0">
                <h3 className="flex items-baseline gap-2 px-4 pt-3 pb-1 text-sm font-semibold">
                  {label}
                  <span className="font-normal text-[var(--faint)]">{plural(group.length, "post", "posts")}</span>
                </h3>
                <ul>
                  {group.slice(0, 8).map((r) => (
                    <li key={r[0]!.id}>
                      <Link href={`/posts/${postRef(r[0]!)}`} className="grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 hover:bg-ink/[0.025]">
                        <span className="text-sm font-medium tabular-nums">{clock(r[0]!.scheduled_at!, zoneOf(r[0]!))}</span>
                        <span className="min-w-0 truncate">
                          {r.map((v) => (
                            <PlatformMark key={v.id} platform={v.platform} />
                          ))}{" "}
                          {snippet(r[0]!)}
                        </span>
                        {approvalState(r[0]!) ? <ApprovalBadge post={r[0]!} /> : r[0]!.status === "queued" && <StatusBadge status="queued" />}
                      </Link>
                    </li>
                  ))}
                </ul>
                {group.length > 8 && (
                  <Link href="/calendar" className="block px-4 py-2 text-sm text-ink-soft hover:underline">
                    {group.length - 8} more on the calendar
                  </Link>
                )}
              </div>
            ))}
            {slot && (
              <p className="flex items-center gap-2 border-t border-[var(--line-soft)] px-4 py-2.5 text-sm text-ink-soft">
                <Icon name="clock" className="size-4" />
                <span>
                  Next queue slot:{" "}
                  <Link href="/queue" className="font-semibold text-ink hover:underline">
                    {dayName(slot.at, slot.zone)}, {clock(slot.at, slot.zone)}
                  </Link>
                </span>
              </p>
            )}
          </Panel>

          <Panel id="recent" title="Recently published" link={{ href: "/posts?status=published", label: "All published" }} load={posts} retry={retryPosts} skeleton={5}>
            {published.length === 0 ? (
              <Empty>Nothing published in the last 30 days.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--line-soft)]">
                {published.slice(0, 5).map((r) => {
                  const n = postTotals(r);
                  return (
                    <li key={r[0]!.id}>
                      <Link href={`/posts/${postRef(r[0]!)}`} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-3 px-4 py-2.5 hover:bg-ink/[0.025] sm:grid-cols-[3.25rem_minmax(0,1fr)_auto]">
                        <span className="text-sm text-ink-soft tabular-nums">{shortDay(postTime(r[0]!), zoneOf(r[0]!))}</span>
                        <span className="min-w-0 truncate">
                          {r.map((v) => (
                            <PlatformMark key={v.id} platform={v.platform} />
                          ))}{" "}
                          {snippet(r[0]!)}
                        </span>
                        {/* Under the text on a phone, beside it from sm up. */}
                        {n && <span className="col-start-2 text-sm text-ink-soft tabular-nums sm:col-start-3">{statWords(n, ["likes", "comments"])}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 gap-6">
          <Panel id="inbox" title="Inbox" note={inbox && !isFailure(inbox) ? `${inbox.open} open` : undefined} link={{ href: "/inbox", label: "Open inbox" }} load={inbox} retry={retryInbox} skeleton={4} tall>
            {inbox && !isFailure(inbox) && inbox.items.length === 0 ? (
              <Empty>No open comments, mentions or DMs.</Empty>
            ) : (
              inbox &&
              !isFailure(inbox) && (
                <ul className="divide-y divide-[var(--line-soft)]">
                  {inbox.items.slice(0, 4).map((i) => (
                    <li key={i.id}>
                      <Link href={`/inbox/${inbox.inboxId}?item=${address(i)}`} className="grid gap-0.5 px-4 py-2.5 hover:bg-ink/[0.025]">
                        <span className="flex items-center gap-2">
                          <strong className="min-w-0 truncate font-semibold">{authorName(i.author)}</strong>
                          <span className="badge tone" data-kind={i.kind}>
                            {kindName[i.kind]}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-ink-soft">{relativeTime(i.received_at, now)}</span>
                        </span>
                        <span className="truncate text-ink-soft">{itemSummary(i)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}
          </Panel>

          <Panel id="top-post" title="Top post this week" link={{ href: "/analytics?range=7", label: "Open analytics" }} load={stats} retry={retryStats} skeleton={1} tall>
            {top ? (
              <Link href={`/posts/${postRef(top)}`} className="grid gap-0.5 px-4 py-2.5 hover:bg-ink/[0.025]">
                <span className="truncate">
                  <PlatformMark platform={top.platform} /> {snippet(top)}
                </span>
                <span className="truncate text-ink-soft tabular-nums">{(topNumbers && statWords(topNumbers)) || "No numbers yet"}</span>
              </Link>
            ) : (
              <Empty>No stats yet. Numbers show up after a post goes out on Bluesky, Facebook, Instagram or YouTube.</Empty>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// One number of the strip. The height is fixed, so the number arriving moves nothing.
function StatCard({ href, label, sub, value, title, children }: { href: string; label: string; sub: string; value: string | null; title?: string; children?: ReactNode }) {
  return (
    <li>
      <Link href={href} title={title} className="card lift flex h-full items-end justify-between gap-2 px-4 py-3">
        <span className="grid min-w-0">
          <span className="text-sm font-medium text-ink-soft">{label}</span>
          <span className="flex h-9 items-center text-2xl font-semibold tabular-nums">
            {value === null ? (
              <>
                <span className="sr-only">Loading</span>
                <Skeleton className="h-6 w-10" />
              </>
            ) : (
              <span className="enter">{value}</span>
            )}
          </span>
          <span className="text-xs text-[var(--faint)]">{sub}</span>
        </span>
        {children}
      </Link>
    </li>
  );
}

// Engagement by day as one line. Decorative: the card says the total, and Analytics has the table.
function Sparkline({ values }: { values: number[] }) {
  const top = Math.max(1, ...values);
  return (
    <svg viewBox="0 0 64 24" aria-hidden="true" className="mb-1 h-6 w-16 shrink-0 text-signal-deep">
      {values.length > 1 && (
        <polyline
          className="enter"
          points={values.map((v, i) => `${1 + (i / (values.length - 1)) * 62},${22 - (v / top) * 20}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

// The posts one reason stopped on one network: the count, the reason once, the posts in a fold and a link to the list.
function FailureGroup({ posts }: { posts: Post[] }) {
  const { platform, error } = posts[0]!;
  const name = platformName(platform);
  return (
    <li className="grid gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true" className="dot" data-status="failed" />
          <span aria-hidden="true">
            <PlatformMark platform={platform} />
          </span>
          {plural(posts.length, "post", "posts")} failed on {name}
        </p>
        <Link href={`/posts?status=failed&network=${encodeURIComponent(platform)}`} className="text-sm font-semibold text-signal-deep hover:underline">
          View failed posts<span className="sr-only"> on {name}</span>
        </Link>
      </div>
      <p className="text-ink-soft">{error ?? "The network gave no reason."}</p>
      <details>
        <summary className="w-fit cursor-pointer rounded text-sm text-ink-soft hover:text-ink">{posts.length === 1 ? "Show the post" : `Show the ${posts.length} posts`}</summary>
        <ul className="mt-1 grid gap-0.5">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/posts/${postRef(p)}`} className="flex gap-3 rounded py-0.5 hover:underline">
                <span className="shrink-0 text-sm text-ink-soft tabular-nums">
                  {dayName(postTime(p), zoneFor(p.social_set_id))}, {clock(postTime(p), zoneFor(p.social_set_id))}
                </span>
                <span className="min-w-0 truncate">{snippet(p)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

// A titled card. While it loads it holds `skeleton` rows the size of its real ones (`tall`: two lines each).
function Panel({
  id, title, note, link, load, retry, skeleton, tall, children,
}: {
  id: string; title: string; note?: string; link: { href: string; label: string }; load: unknown; retry: () => void; skeleton: number; tall?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="card scroll-mt-16 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 id={`${id}-heading`} className="font-semibold">
            {title}
          </h2>
          {note && <span className="text-xs text-ink-soft tabular-nums">{note}</span>}
        </div>
        <Link href={link.href} className="text-sm font-semibold text-signal-deep hover:underline">
          {link.label}
        </Link>
      </div>
      {load === null ? (
        <div role="status" className="divide-y divide-[var(--line-soft)]">
          <span className="sr-only">Loading {title.toLowerCase()}...</span>
          {Array.from({ length: skeleton }, (_, i) => (
            <div key={i} className={`grid content-center gap-2 px-4 ${tall ? "h-16" : "h-[2.5625rem]"}`}>
              <Skeleton className={`h-3.5 ${i % 2 ? "w-1/2" : "w-2/3"}`} />
              {tall && <Skeleton className="h-3.5 w-4/5" />}
            </div>
          ))}
        </div>
      ) : isFailure(load) ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <p className="waitlist-error">This couldn&apos;t be loaded. {problemText(load)}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
            Retry<span className="sr-only"> {title.toLowerCase()}</span>
          </button>
        </div>
      ) : (
        <div className="enter">{children}</div>
      )}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="px-4 py-3 text-ink-soft">{children}</p>;
