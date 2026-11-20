"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TeamLink as Link } from "@/components/team-link";
import type { Failure } from "@/lib/auth";
import { compact, engagement, getAnalytics, hasStats, parseRange, postTotals, RANGES, REFRESH_NOTE, refreshMetrics, STAT_NETWORKS, STATS, statWords, type Analytics, type Stat } from "@/lib/analytics";
import { relativeTime } from "@/lib/inbox";
import { publishing, type Metrics, type Post } from "@/lib/posts";
import { useCurrentSet } from "@/components/app-shell";
import { platformName } from "@/components/platform-icons";
import { PlatformMark, postMessages, snippet } from "@/components/posts";
import { isFailure, problemText } from "@/components/team-ui";

const statName: Record<Stat | "posts", string> = { posts: "Posts", likes: "Likes", comments: "Comments", shares: "Shares", views: "Views" };
const names = (ids: string[]) => new Intl.ListFormat("en-GB").format(ids.map(platformName));
const dayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const cell = "px-4 py-2 text-right tabular-nums";
const head = "px-4 py-2 font-semibold";
const title = "border-b border-[var(--line)] px-4 py-2.5 font-semibold";

// A number in a table: the full figure, or a dash when the network does not give it.
const Num = ({ n }: { n: number | null }) => (n === null ? <span title="Not given by this network">-<span className="sr-only"> (not given)</span></span> : <>{n.toLocaleString()}</>);

// The Analytics page: what the picked set's published posts got in the last 7, 30 or 90 days (?range=).
export function PostAnalytics() {
  const [setId] = useCurrentSet();
  const range = parseRange(useSearchParams().get("range"));
  const key = `${setId} ${range}`;
  // Kept with what was asked, so an older answer never shows under a newer range or set.
  const [got, setGot] = useState<{ key: string; data: Analytics | Failure } | null>(null);
  useEffect(() => {
    let live = true;
    getAnalytics(setId, range).then((data) => live && setGot({ key, data }));
    return () => {
      live = false;
    };
  }, [setId, range, key]);
  const data = got?.key === key ? got.data : null;
  const supported = data && !isFailure(data) ? data.supported : STAT_NETWORKS;
  const missing = publishing.filter((p) => !supported.includes(p));

  return (
    // minmax(0,1fr): the wide network table scrolls inside its card instead of widening the page.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <ul aria-label="Range" className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <li key={r}>
            <Link
              href={`/analytics?range=${r}`}
              aria-current={r === range ? "true" : undefined}
              className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${r === range ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"}`}
            >
              {r} days
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-soft" data-stats-note>
        Stats come from {names(supported)}.{missing.length > 0 && ` ${names(missing)} ${missing.length === 1 ? "is" : "are"} not available yet.`} {REFRESH_NOTE}
      </p>
      {data === null ? (
        <p role="status" className="text-ink-soft">
          Loading the analytics...
        </p>
      ) : isFailure(data) ? (
        <p role="alert" className="waitlist-error">
          The analytics couldn&apos;t be loaded. {problemText(data, { invalid_range: "That range isn't valid. Pick 7, 30 or 90 days." })}
        </p>
      ) : data.totals.posts === 0 ? (
        <p className="card p-5 text-ink-soft">
          No posts were published in the last {range} days.{" "}
          <Link href="/posts/new" className="font-bold underline">
            Write a post
          </Link>
        </p>
      ) : (
        <Report data={data} range={range} />
      )}
    </div>
  );
}

function Report({ data, range }: { data: Analytics; range: number }) {
  return (
    <>
      <dl aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["posts", ...STATS] as const).map((k) => (
          <div key={k} className="card grid gap-1 px-4 py-3">
            <dt className="text-sm text-ink-soft">{statName[k]}</dt>
            <dd className="text-2xl font-semibold tabular-nums" title={data.totals[k]?.toLocaleString()}>
              {data.totals[k] === null ? "-" : compact(data.totals[k])}
            </dd>
          </div>
        ))}
      </dl>
      <DayChart days={data.by_day} range={range} />
      {/* relative: the screen-reader text of a dash is absolutely placed, and must scroll with the table, not widen the page. */}
      <section aria-labelledby="networks-heading" className="card relative overflow-x-auto">
        <h2 id="networks-heading" className={title}>
          By network
        </h2>
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-soft">
              <th scope="col" className={head}>Network</th>
              {(["posts", ...STATS] as const).map((k) => (
                <th key={k} scope="col" className={`${head} text-right`}>{statName[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {data.by_platform.map((p) => (
              <tr key={p.platform}>
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformMark platform={p.platform} named />
                  </span>
                </th>
                <td className={cell}>{p.posts.toLocaleString()}</td>
                {p.supported ? (
                  STATS.map((k) => (
                    <td key={k} className={cell}><Num n={p[k]} /></td>
                  ))
                ) : (
                  <td colSpan={STATS.length} className="px-4 py-2 text-left text-ink-soft sm:text-right">
                    Not available yet
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-labelledby="top-heading" className="card overflow-hidden">
        <h2 id="top-heading" className={title}>
          Top posts
        </h2>
        {data.top_posts.length === 0 ? (
          <p className="px-4 py-3 text-ink-soft">No numbers have been read yet.</p>
        ) : (
          <ol className="divide-y divide-[var(--line-soft)]">
            {data.top_posts.map((p) => {
              const n = postTotals([p]);
              return (
                <li key={p.id}>
                  <Link href={`/posts/${p.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-ink/[0.025]">
                    <span className="min-w-0 truncate">
                      <PlatformMark platform={p.platform} /> {snippet(p)}
                    </span>
                    <span className="text-sm text-ink-soft tabular-nums">{(n && statWords(n)) || "No numbers yet"}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}

// Likes, comments and shares on the posts of each day, as bars, with the same numbers in a table.
function DayChart({ days, range }: { days: Analytics["by_day"]; range: number }) {
  const top = Math.max(1, ...days.map(engagement));
  return (
    <section aria-labelledby="days-heading" className="card">
      <h2 id="days-heading" className={title}>
        Engagement by day
      </h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-4">
        <p className="text-sm text-ink-soft">Likes, comments and shares on the posts published each day. The tallest bar is {top.toLocaleString()}.</p>
        {/* Stretched to the card's width: only filled bars, so nothing distorts. */}
        <svg role="img" aria-label={`Engagement by day, last ${range} days. The same numbers are in the table below.`} viewBox={`0 0 ${Math.max(1, days.length)} 100`} preserveAspectRatio="none" className="h-40 w-full border-b border-[var(--line)]">
          {days.map((d, i) => (
            <rect key={d.date} x={i + 0.15} width={0.7} y={100 - (engagement(d) / top) * 100} height={(engagement(d) / top) * 100} className="fill-signal">
              <title>{`${dayName(d.date)}: ${engagement(d).toLocaleString()}`}</title>
            </rect>
          ))}
        </svg>
        {days.length > 0 && (
          <p aria-hidden="true" className="flex justify-between text-xs text-ink-soft">
            <span>{dayName(days[0]!.date)}</span>
            <span>{dayName(days.at(-1)!.date)}</span>
          </p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Show as a table</summary>
          <div className="relative mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse">
              <caption className="sr-only">Engagement by day</caption>
              <thead>
                <tr className="text-left text-xs text-ink-soft">
                  <th scope="col" className="py-1 pr-4 font-semibold">Day</th>
                  {(["posts", "likes", "comments", "shares"] as const).map((k) => (
                    <th key={k} scope="col" className="px-4 py-1 text-right font-semibold">{statName[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-soft)]">
                {days.map((d) => (
                  <tr key={d.date}>
                    <th scope="row" className="py-1 pr-4 text-left font-normal">{dayName(d.date)}</th>
                    <td className="px-4 py-1 text-right tabular-nums">{d.posts.toLocaleString()}</td>
                    {(["likes", "comments", "shares"] as const).map((k) => (
                      <td key={k} className="px-4 py-1 text-right tabular-nums"><Num n={d[k]} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

// One account's numbers on a published post's page: only the ones its network gives.
export function TargetStats({ platform, metrics }: { platform: string; metrics?: Metrics | null }) {
  return (
    <span className="basis-full text-ink-soft" data-stats>
      {!hasStats(platform)
        ? `Stats are not available for ${platformName(platform)} yet.`
        : metrics
          ? `${statWords(metrics) || "No numbers"}, as of ${relativeTime(metrics.fetched_at)}.`
          : "No stats read yet."}
    </span>
  );
}

// Asks brain to read a published post's numbers now; brain allows it once a minute.
export function RefreshStats({ post, onPost }: { post: Post; onPost: (p: Post) => void }) {
  const [state, setState] = useState<"busy" | "done" | Failure | null>(null);
  async function refresh() {
    setState("busy");
    const r = await refreshMetrics(post.id);
    if (isFailure(r)) return setState(r);
    onPost(r);
    setState("done");
  }
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" disabled={state === "busy"} onClick={refresh}>
        {state === "busy" ? "Refreshing..." : "Refresh stats"}
      </button>
      {state === "done" && <p role="status" className="basis-full text-sm text-ink-soft">The stats are up to date.</p>}
      {state && state !== "busy" && state !== "done" && (
        <p role="alert" className="waitlist-error basis-full text-sm">
          {problemText(state, postMessages)}
        </p>
      )}
    </>
  );
}
