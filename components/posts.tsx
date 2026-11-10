"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Failure } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { partLabel } from "@/lib/lists";
import { isPlatform, listPosts, monthRange, monthWeeks, postDay, sameDay, type Post, type PostStatus } from "@/lib/posts";
import { listSets, type SocialSet } from "@/lib/sets";
import { PlatformIcon, platformName, platformOf } from "@/components/platform-icons";
import { isFailure, problemText } from "@/components/team-ui";
import { useCurrentSet } from "@/components/app-shell";
import { Icon } from "@/components/ui";

export const postMessages: Partial<Record<Failure, ReactNode>> = {
  too_long:
    "The post is too long: at most 300 characters (and 3000 bytes) on Bluesky, 500 on Threads, 3000 on LinkedIn, 2200 on Instagram, 280 on X (a link counts as 23, an emoji as 2), 2200 on TikTok. On YouTube the first line is the title, at most 100 characters, and the rest the description, at most 5000 bytes.",
  too_many_images: "Too many images: at most 4 on Bluesky and X, 20 on Threads and LinkedIn (or one PDF), 10 on Facebook and Instagram, one video on YouTube, one video or 35 photos on TikTok.",
  media_required: "Instagram needs at least one image or video, and YouTube and TikTok need a video (TikTok also takes photos).",
  invalid_text: "YouTube doesn't allow < or > in a title or description.",
  thread_not_supported: "LinkedIn, Facebook, Instagram, YouTube and TikTok can't post threads.",
  first_comment_not_supported: "Only Facebook, Instagram, LinkedIn and YouTube can post a first comment.",
  first_comment_too_long: "The first comment is too long: at most 8000 characters on Facebook, 2200 on Instagram, 1250 on LinkedIn, 10000 on YouTube.",
  cover_not_supported: "Only Instagram, Facebook and YouTube take a cover image. TikTok can only pick a frame of the video.",
  invalid_cover: "The cover image needs a public https link.",
  cover_needs_one_video: "A cover image goes with exactly one video: add one link to the video.",
  tiktok_privacy_required: "Choose who can see the TikTok post.",
  invalid_tiktok_privacy: "That TikTok visibility isn't one TikTok knows.",
  invalid_tiktok_disclosure: "Turn on the content disclosure before choosing Your brand or Branded content.",
  tiktok_disclosure_incomplete: "You need to indicate if your content promotes yourself, a third party, or both.",
  tiktok_branded_content_private: "Branded content visibility cannot be set to private.",
  tiktok_not_supported: "Only a TikTok post takes TikTok settings.",
  reconnect_required: "TikTok refused the account's access. Reconnect it under Connections.",
  tiktok_failed: "TikTok could not be reached. Try again in a moment.",
  invalid_override: "A customized platform isn't one the post goes to.",
  no_accounts: "This set has no connected account to post to.",
  too_many_parts: "A thread can have at most 25 follow-up posts.",
  invalid_media: "Images must be public https links to JPEG, PNG, WebP or GIF files of 1 MB or less, or Google Drive share links. LinkedIn also takes one PDF.",
  empty_post: "Write something or add an image first. YouTube also needs a title: the first line.",
  invalid_set: "That set no longer exists. Pick another one.",
  unsupported_platform: "That platform can't publish yet.",
  too_many_posts: "This team has 2000 posts, the most allowed. Delete some first.",
  not_editable: "This post is publishing or already went out, so it can't change. Reload to see it.",
  not_deletable: "A post that is publishing or failed can't be deleted.",
  publish_quota: "The team reached its limit of 100 published posts today. Schedule this one for tomorrow.",
  rate_limited: "Too many publish or take down actions. Wait a minute, then try again.",
  not_found: "This post no longer exists.",
};

export const statusName: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  queued: "Publishing",
  published: "Published",
  failed: "Failed",
  deleted: "Taken down",
};

const time = (d: Date) => d.toLocaleTimeString(undefined, { timeStyle: "short" });
export const snippet = (p: Post) => (p.body.trim() ? p.body.trim().slice(0, 60) + (p.body.trim().length > 60 ? "..." : "") : "(images only)");
const bluesky = platformOf("bluesky")!;
const legend: PostStatus[] = ["scheduled", "queued", "published", "failed", "deleted"];

export function StatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className="badge tone" data-status={status}>
      {statusName[status]}
    </span>
  );
}

// Shown when the team has no account brain publishes to, since posts go to the accounts of their set.
export function AccountNote() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    listConnections().then((r) => setMissing(Array.isArray(r) && !r.some((c) => isPlatform(c.provider))));
  }, []);
  if (!missing) return null;
  return (
    <div className="card flex flex-wrap items-center gap-4 border-signal/40 p-5">
      <span className="grid size-11 place-items-center rounded-xl bg-[#1185FE]/10" style={{ color: bluesky.color }}>
        <PlatformIcon platform={bluesky} className="size-6" />
      </span>
      <p className="min-w-0 flex-1 basis-60">
        <strong className="block">Connect an account first</strong>
        <span className="text-ink-soft">No Bluesky, Threads, LinkedIn, X, TikTok, YouTube, Facebook or Instagram account is connected to this team yet, so posts have nowhere to go.</span>
      </p>
      <Link href="/connections" className="btn btn-primary">
        Connect an account
      </Link>
    </div>
  );
}

// A platform's icon, named for screen readers, or beside its name with `named`.
export function PlatformMark({ platform, className = "size-3.5", named }: { platform: string; className?: string; named?: boolean }) {
  const p = platformOf(platform);
  return (
    <>
      <span className="inline-flex shrink-0 align-[-0.15em]" style={{ color: p?.color }} title={named ? undefined : platformName(platform)}>
        {p && <PlatformIcon platform={p} className={className} />}
      </span>
      {named ? <span className="font-bold">{platformName(platform)}</span> : <span className="sr-only">{platformName(platform)}: </span>}
    </>
  );
}

function PostChip({ post: p }: { post: Post }) {
  const remote = p.targets.filter((t) => t.remote_url && t.status === "published");
  return (
    <li className="flex min-w-0 items-center rounded text-xs hover:bg-ink/[0.045]">
      <span aria-hidden="true" className="dot ml-1.5 shrink-0" data-status={p.status} />
      <Link href={`/posts/${p.id}`} className="min-w-0 flex-1 truncate px-1.5 py-1 hover:underline">
        {p.lists.length > 0 && <span className="block truncate font-bold">{p.lists.map(partLabel).join(", ")}</span>}
        <PlatformMark platform={p.platform} /> <span className="text-ink-soft tabular-nums">{time(postDay(p)!)}</span> {snippet(p)}
      </Link>
      <span className="sr-only">{statusName[p.status]}</span>
      {remote.map((t) => (
        <a
          key={t.id}
          href={t.remote_url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View on ${platformName(p.platform)}`}
          className="shrink-0 rounded-md p-1 hover:bg-ink/10"
        >
          <Icon name="external" className="size-3.5" />
        </a>
      ))}
    </li>
  );
}

// The month's days that have posts, in order, for screens too narrow for the grid.
function MonthList({ posts, y, m, title }: { posts: Post[]; y: number; m: number; title: string }) {
  const days = new Map<number, Post[]>();
  for (const p of posts.filter(postDay).sort((a, b) => postDay(a)!.getTime() - postDay(b)!.getTime())) {
    const d = postDay(p)!;
    if (d.getFullYear() === y && d.getMonth() === m) days.set(d.getDate(), [...(days.get(d.getDate()) ?? []), p]);
  }
  if (days.size === 0) return <p className="card p-5 text-ink-soft">Nothing scheduled or published in {title}.</p>;
  return (
    <ol aria-label={`Posts in ${title}`} className="card divide-y divide-ink/10">
      {[...days].map(([date, list]) => (
        <li key={date} className="grid gap-2 p-3">
          <p className="text-xs font-bold text-ink-soft">
            {new Date(y, m, date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <ul className="grid gap-1">
            {list.map((p) => (
              <PostChip key={p.id} post={p} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// /posts lists the month's posts by day with the drafts below; /calendar shows the month as a grid (a list of days on narrow screens).
export function Posts({ view }: { view: "list" | "calendar" }) {
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  // The set picked in the top bar filters the calendar and drafts.
  const [setId] = useCurrentSet();
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [posts, setPosts] = useState<Post[] | Failure | null>(null);
  const [drafts, setDrafts] = useState<Post[] | Failure | null>(null);

  useEffect(() => {
    listSets().then(setSets);
  }, []);

  useEffect(() => {
    let live = true;
    listPosts({ social_set_id: setId, ...monthRange(month.y, month.m) }).then((r) => live && setPosts(r));
    return () => {
      live = false;
    };
  }, [month, setId]);

  useEffect(() => {
    if (view !== "list") return;
    let live = true;
    listPosts({ social_set_id: setId, status: "draft" }).then((r) => live && setDrafts(r));
    return () => {
      live = false;
    };
  }, [setId, view]);

  const step = (by: number) => setMonth(({ y, m }) => ({ y: m + by < 0 ? y - 1 : m + by > 11 ? y + 1 : y, m: (m + by + 12) % 12 }));
  const title = new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  // 1 January 2024 was a Monday, so these are Monday to Sunday in the browser's language.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }));
  const calendarPosts = Array.isArray(posts) ? posts.filter((p) => p.status !== "draft") : [];
  const setName = (id: string) => (Array.isArray(sets) ? sets.find((s) => s.id === id)?.name : undefined);

  return (
    <div className="grid gap-10">
      <AccountNote />
      <section aria-labelledby="month-heading" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => step(-1)}>
              <Icon name="left" />
            </button>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => step(1)}>
              <Icon name="right" />
            </button>
            <h2 id="month-heading" className="ml-2 font-display text-xl font-extrabold tracking-tight" aria-live="polite">
              {title}
            </h2>
          </div>
        </div>
        {posts === null ? (
          <div className="h-96 rounded-2xl bg-ink/5 motion-safe:animate-pulse" role="status">
            <span className="sr-only">Loading posts...</span>
          </div>
        ) : isFailure(posts) ? (
          <p role="alert" className="waitlist-error">
            Posts couldn&apos;t be loaded. {problemText(posts, postMessages)}
          </p>
        ) : (
          <>
            {/* Narrow screens get the month as a list of days; the grid needs about 46rem. */}
            <div className={view === "calendar" ? "lg:hidden" : ""}>
              <MonthList posts={calendarPosts} y={month.y} m={month.m} title={title} />
            </div>
            {view === "calendar" && (
            <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[46rem] table-fixed border-collapse text-sm">
              <caption className="sr-only">Posts in {title}</caption>
              <thead>
                <tr>
                  {weekdays.map((w) => (
                    <th key={w} scope="col" className="border-b border-[var(--line)] bg-[var(--side)] px-2.5 py-2 text-left text-xs font-normal text-ink-soft">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthWeeks(month.y, month.m).map((week, i) => (
                  <tr key={i}>
                    {week.map((day, j) => {
                      const items = day ? calendarPosts.filter((p) => sameDay(postDay(p) ?? new Date(0), day)) : [];
                      const today = day && sameDay(day, now);
                      return (
                        <td
                          key={j}
                          aria-current={today ? "date" : undefined}
                          className={`h-28 border-[var(--line-soft)] p-1.5 align-top [&:not(:last-child)]:border-r ${i > 0 ? "border-t" : ""} ${
                            day ? (today ? "bg-signal/[0.04]" : "") : "bg-[var(--side)]"
                          }`}
                        >
                          {day && (
                            <>
                              <p
                                className={`mb-1 inline-grid h-5 min-w-5 place-items-center rounded px-1 text-xs tabular-nums ${
                                  today ? "bg-signal-deep font-bold text-paper" : "text-ink-soft"
                                }`}
                              >
                                {day.getDate()}
                              </p>
                              {items.length > 0 && (
                                <ul className="grid gap-1">
                                  {items.map((p) => (
                                    <PostChip key={p.id} post={p} />
                                  ))}
                                </ul>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            )}
          </>
        )}
        <ul aria-label="Colors" className="flex flex-wrap gap-2">
          {legend.map((s) => (
            <li key={s}>
              <StatusBadge status={s} />
            </li>
          ))}
        </ul>
      </section>
      {view === "list" && (
      <section aria-labelledby="drafts-heading" className="grid gap-4">
        <h2 id="drafts-heading" className="font-display text-xl font-extrabold tracking-tight">
          Drafts
        </h2>
        {drafts === null ? (
          <p className="text-ink-soft">Loading drafts...</p>
        ) : isFailure(drafts) ? (
          <p role="alert" className="waitlist-error">
            Drafts couldn&apos;t be loaded. {problemText(drafts, postMessages)}
          </p>
        ) : drafts.length === 0 ? (
          <p className="text-ink-soft">No drafts. Posts you save without scheduling show up here.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.map((p) => (
              <li key={p.id} className="tone relative grid content-start gap-2 rounded-2xl bg-paper p-4 hover:bg-ink/[0.02]" data-status="draft">
                <Link href={`/posts/${p.id}`} className="font-bold text-ink after:absolute after:inset-0 after:rounded-2xl">
                  <PlatformMark platform={p.platform} className="size-4" /> {snippet(p)}
                </Link>
                {p.lists.length > 0 && <p className="text-sm font-bold">{p.lists.map(partLabel).join(", ")}</p>}
                <p className="text-sm text-ink-soft">
                  {setName(p.social_set_id) ? `${setName(p.social_set_id)}. ` : ""}Saved{" "}
                  {new Date(p.updated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
