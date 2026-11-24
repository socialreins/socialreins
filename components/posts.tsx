"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { TeamLink as Link, useTeamPath } from "@/components/team-link";
import type { Failure } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { partLabel } from "@/lib/lists";
import {
  approvalName,
  approvalState,
  decidePost,
  editInput,
  filterQuery,
  isPlatform,
  listPosts,
  matchesFilters,
  monthRange,
  monthWeeks,
  inZone,
  moveToZoneDay,
  NOTE_MAX,
  parseFilters,
  postDay,
  repeatSummary,
  rows,
  sameDay,
  toZoneInput,
  updatePost,
  type Platform,
  type Post,
  type PostFilters,
  type PostStatus,
} from "@/lib/posts";
import { listSets, type SocialSet } from "@/lib/sets";
import { zoneOf } from "@/lib/queue";
import { PlatformIcon, platformName, platformOf } from "@/components/platform-icons";
import { manages } from "@/lib/teams";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { useCurrentSet, useSession } from "@/components/app-shell";
import { EmptyState, Icon, LoadFailed, Skeleton, SkeletonRows } from "@/components/ui";
import { postTotals, statWords } from "@/lib/analytics";

export const postMessages: Partial<Record<Failure, ReactNode>> = {
  too_long:
    "The post is too long: at most 300 characters (and 3000 bytes) on Bluesky, 500 on Threads, 3000 on LinkedIn, 2200 on Instagram, 280 on X (a link counts as 23, an emoji as 2), 2200 on TikTok. On YouTube the first line is the title, at most 100 characters, and the rest the description, at most 5000 bytes.",
  too_many_images: "Too many images: at most 4 on Bluesky and X, 20 on Threads, Instagram and LinkedIn (or one PDF), 10 on Facebook, one video on YouTube, one video or 35 photos on TikTok.",
  media_required: "Instagram needs at least one image or video, and YouTube and TikTok need a video (TikTok also takes photos).",
  invalid_text: "YouTube doesn't allow < or > in a title or description.",
  thread_not_supported: "LinkedIn, Facebook, Instagram, YouTube and TikTok can't post threads.",
  first_comment_not_supported: "Only Facebook, Instagram, LinkedIn and YouTube can post a first comment.",
  first_comment_too_long: "The first comment is too long: at most 8000 characters on Facebook, 2200 on Instagram, 1250 on LinkedIn, 10000 on YouTube.",
  cover_not_supported: "Only Instagram, Facebook and YouTube take a cover image. TikTok can only pick a frame of the video.",
  invalid_cover: "The cover image needs a public https link.",
  cover_needs_one_video: "A cover image goes with exactly one video: add one link to the video.",
  media_type_not_supported: "A media file is a type this platform doesn't take. Bluesky and X take JPEG, PNG, WebP or GIF images or an MP4 or MOV video, Instagram JPEG, PNG or WebP images or videos, TikTok a video or JPEG, PNG or WebP photos, YouTube one MP4 or MOV video, and only LinkedIn takes a PDF.",
  mixed_media: "A video goes on its own on Bluesky, Facebook, LinkedIn, X and TikTok (a PDF on LinkedIn and a GIF on X too): post it without the other images.",
  media_too_large: "A media file is too large: images of at most 1 MB on Bluesky, 5 MB on X (a GIF 15 MB), and no file over 100 MB.",
  invalid_cover_type: "The cover image must be a JPEG or PNG (Instagram also takes WebP).",
  cover_too_large: "The cover image is too large: at most 8 MB on Instagram, 10 MB on Facebook, 2 MB on YouTube.",
  tiktok_privacy_not_offered: "TikTok doesn't offer that visibility to this account now. Pick one of the choices shown and save again.",
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
  invalid_media: "Images must be public https links to JPEG, PNG, WebP or GIF files, or Google Drive or Dropbox share links. LinkedIn also takes one PDF.",
  empty_post: "Write something or add an image first. YouTube also needs a title: the first line.",
  invalid_set: "That set no longer exists. Pick another one.",
  invalid_accounts: "Pick at least one account of each platform in this set; an account you picked may have left the set.",
  invalid_upload: "An uploaded file is no longer kept, or belongs to another team. Upload it again.",
  too_many_uploads: "Your team keeps too many uploads (200 files or 10 GB, an upload in progress counting 1 GB). An upload clears a day after it was made, once every post that names it has gone out.",
  upload_interrupted: "The upload stopped before the whole file arrived. Try again.",
  uploads_in_progress: "Your team has 3 uploads running already. Wait for one to finish, then try again.",
  unsupported_platform: "That platform can't publish yet.",
  too_many_posts: "This team has 2000 posts, the most allowed. Delete some first.",
  not_editable: "This post is publishing or already went out, so it can't change. Reload to see it.",
  not_deletable: "A post that is publishing or failed can't be deleted.",
  publish_quota: "The team reached its limit of 100 published posts today. Schedule this one for tomorrow.",
  rate_limited: "Too many publish or take down actions. Wait a minute, then try again.",
  not_found: "This post no longer exists.",
  queue_empty: "This set's queue has no times yet. Add some on the Queue page, or pick a time to schedule.",
  queue_with_scheduled_at: "A post goes in the queue or at a time you pick, not both.",
  queue_not_supported: "A saved post can't move to the queue. Pick a time to schedule it.",
  approval_required: "This team's posts need an owner or admin to approve them before they go out. Schedule the post to ask for approval.",
  not_awaiting_approval: "This post is no longer waiting for approval. Reload to see it.",
  not_scheduled: "Only a scheduled post can repeat. Schedule it first.",
  repeat_not_supported: "TikTok posts can't repeat: TikTok needs a person to confirm each post.",
  invalid_repeat: "That repeat isn't valid. Repeat every 1 to 12 days, weeks or months, and end it never, after 1 to 100 more posts or on a date after the post's own.",
  refreshed_recently: "The stats were refreshed less than a minute ago. Wait a minute, then try again.",
  too_many_repeats: "Too many repeating posts. Turn the repeat off on another post first.",
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

// The calendar's one rule for days: a post sits on, and moves between, days of its own set's time zone
// (its queue zone), and the grid's dates (today, the month) are those of the set picked in the top bar,
// or the browser's for all sets. `at` gives a post's wall time there as a local Date for the date maths.
// shortcut: filled once per page load by `Posts`; a zone changed on /queue shows after a reload.
const setZones = new Map<string, string>();
const at = (p: Post) => {
  const d = postDay(p);
  return d && inZone(d, setZones.get(p.social_set_id));
};
const zoneFor = (setId: string) => setZones.get(setId) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
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

// "Needs approval" or "Changes requested"; nothing for a post with neither.
export function ApprovalBadge({ post }: { post: Post }) {
  const a = approvalState(post);
  return a && (
    <span className="badge tone" data-approval={a}>
      {approvalName[a]}
    </span>
  );
}
// "Repeats" on a post that goes out again, with the rule in plain words as its title.
export function RepeatBadge({ post }: { post: Post }) {
  return post.repeat ? (
    <span className="badge tone" title={repeatSummary(post.repeat)}>
      <Icon name="repeat" className="size-3" />
      Repeats
      <span className="sr-only">: {repeatSummary(post.repeat)}</span>
    </span>
  ) : null;
}
// A post's status for screen readers, with its approval state: "Scheduled, needs approval".
const stateName = (p: Post) => statusName[p.status] + (approvalState(p) ? `, ${approvalName[approvalState(p)!].toLowerCase()}` : "");

// "Request changes": an optional note for the author, sent with the rejection.
export function ChangesDialog({ posts, onClose, onSend }: { posts: Post[]; onClose: () => void; onSend: (posts: Post[], note: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [note, setNote] = useState("");
  useEffect(() => ref.current?.showModal(), []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ref.current?.close();
    onSend(posts, note);
  };
  return (
    <dialog ref={ref} aria-labelledby={id} onClose={onClose} className="m-auto w-[min(26rem,calc(100vw-1rem))] rounded-lg bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/20">
      <form onSubmit={submit} className="grid gap-3 p-4">
        <h3 id={id} className="text-sm font-bold">
          Request changes: {snippet(posts[0]!)}
        </h3>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-note`} className="label">
            Note for the author (optional)
          </label>
          <textarea id={`${id}-note`} className="field min-h-24" maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${id}-hint`} />
          <p id={`${id}-hint`} className="hint">
            The post is not published{posts.length > 1 ? ` on any of its ${posts.length} networks` : ""} until the author edits it and it is approved.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary btn-sm">
            Request changes
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => ref.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
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

// The versions of one post on a day's line: the same status and time, so both show once.
const chips = (posts: Post[]) => rows(posts, (p) => `${p.status} ${approvalState(p)} ${at(p)?.toDateString()} ${at(p) && time(at(p)!)}`);

function PostChip({ posts }: { posts: Post[] }) {
  const p = posts[0]!;
  const remote = posts.flatMap((v) => v.targets.filter((t) => t.remote_url && t.status === "published").map((t) => ({ ...t, platform: v.platform })));
  return (
    <li className="flex min-w-0 items-center rounded text-xs hover:bg-ink/[0.045]">
      <span aria-hidden="true" className="dot ml-1.5 shrink-0" data-status={p.status} data-approval={approvalState(p) ?? undefined} />
      <Link href={`/posts/${p.id}`} className="min-w-0 flex-1 truncate px-1.5 py-1 hover:underline">
        {p.lists.length > 0 && <span className="block truncate font-bold">{p.lists.map(partLabel).join(", ")}</span>}
        {posts.map((v) => (
          <PlatformMark key={v.id} platform={v.platform} />
        ))}{" "}
        <span className="text-ink-soft tabular-nums">{time(at(p)!)}</span> {snippet(p)}
      </Link>
      <span className="sr-only">{stateName(p)}</span>
      {remote.map((t) => (
        <a
          key={t.id}
          href={t.remote_url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View on ${platformName(t.platform)}`}
          className="shrink-0 rounded-md p-1 hover:bg-ink/10"
        >
          <Icon name="external" className="size-3.5" />
        </a>
      ))}
    </li>
  );
}

// Only a scheduled post has a time that can change; brain refuses an edit once it is publishing or out.
const movable = (posts: Post[]) => posts.every((p) => p.status === "scheduled" && p.scheduled_at);

// A post in a calendar cell: time and networks on the first line, the text on the second; the "+N more" list has the links out.
// A scheduled one drags to another day, or moves with its "Move to..." button.
function GridChip({ posts, onDrag, onMove }: { posts: Post[]; onDrag: (posts: Post[] | null) => void; onMove: (posts: Post[]) => void }) {
  const p = posts[0]!;
  const can = movable(posts);
  return (
    <li
      className={`group relative min-w-0 rounded text-xs hover:bg-ink/[0.045] ${can ? "cursor-grab" : ""}`}
      draggable={can || undefined}
      data-movable={can || undefined}
      onDragStart={(e) => {
        if (!can) return;
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
        onDrag(posts);
      }}
      onDragEnd={() => onDrag(null)}
    >
      {can && (
        <button
          type="button"
          aria-label={`Move to... ${snippet(p)}`}
          title="Move to..."
          onClick={() => onMove(posts)}
          className="absolute right-0.5 top-0.5 z-10 rounded bg-paper p-0.5 text-ink-soft opacity-0 shadow-sm hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Icon name="clock" className="size-3" />
        </button>
      )}
      <Link href={`/posts/${p.id}`} className="grid min-w-0 px-1.5 py-0.5 leading-4 hover:underline">
        <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-ink-soft">
          <span aria-hidden="true" className="dot shrink-0" data-status={p.status} data-approval={approvalState(p) ?? undefined} />
          <span className="sr-only">{stateName(p)}: </span>
          <span className="tabular-nums">{time(at(p)!)}</span>
          {posts.map((v) => (
            <PlatformMark key={v.id} platform={v.platform} className="size-3" />
          ))}
          {p.repeat && (
            <span title={repeatSummary(p.repeat)} data-repeat>
              <Icon name="repeat" className="size-3" />
              <span className="sr-only">{repeatSummary(p.repeat)}</span>
            </span>
          )}
          {p.lists.length > 0 && <span className="min-w-0 truncate font-bold text-ink">{p.lists.map(partLabel).join(", ")}</span>}
        </span>
        <span className="truncate">{p.body.trim().slice(0, 200) || "(images only)"}</span>
      </Link>
    </li>
  );
}

// "+N more" in a calendar cell: a dialog next to the button with every post of the day as a full row.
function DayMore({ day, list, hidden, onMove }: { day: Date; list: Post[][]; hidden: number; onMove: (posts: Post[]) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const date = day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const open = (e: MouseEvent<HTMLButtonElement>) => {
    const d = ref.current!;
    d.showModal();
    const b = e.currentTarget.getBoundingClientRect();
    const { width, height } = d.getBoundingClientRect();
    // Beside the day, so its three chips stay in view; under or over the button when neither side has room.
    const cell = e.currentTarget.closest("td")?.getBoundingClientRect();
    const side = cell && (cell.right + 4 + width <= innerWidth - 8 ? cell.right + 4 : cell.left - width - 4 >= 8 ? cell.left - width - 4 : null);
    d.style.left = `${side ?? Math.max(8, Math.min(b.left, innerWidth - width - 8))}px`;
    d.style.top = `${side != null ? Math.max(8, Math.min(cell!.top, innerHeight - height - 8)) : b.bottom + height + 12 < innerHeight ? b.bottom + 4 : Math.max(8, b.top - height - 4)}px`;
  };
  return (
    <>
      <button
        type="button"
        aria-label={`Show all ${list.length} posts on ${date}`}
        aria-haspopup="dialog"
        onClick={open}
        className="rounded px-1.5 text-left text-xs font-bold leading-5 text-ink-soft hover:bg-ink/[0.045] hover:text-ink"
      >
        +{hidden} more
      </button>
      <dialog
        ref={ref}
        aria-labelledby={id}
        onClick={(e) => e.target === ref.current && ref.current.close()}
        className="fixed m-0 max-h-[calc(100vh-1rem)] w-[min(30rem,calc(100vw-1rem))] overflow-auto rounded-lg bg-paper p-0 text-ink shadow-2xl backdrop:bg-transparent"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line-soft)] bg-[var(--side)] py-1.5 pl-3 pr-1.5 sm:pl-4">
          <h3 id={id} className="text-xs font-bold">
            {date} <span className="font-normal text-ink-soft">{list.length} posts</span>
          </h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <ul className="divide-y divide-[var(--line-soft)]">
          {list.map((v) => (
            <PostRow key={v[0]!.id} posts={v} onMove={movable(v) ? onMove : undefined} />
          ))}
        </ul>
      </dialog>
    </>
  );
}

// "Move to...": a date picker that moves the posts to that day at the same time, the keyboard way to drag a chip.
function MoveDialog({ posts, onClose, onMove }: { posts: Post[]; onClose: () => void; onMove: (posts: Post[], day: Date) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const when = postDay(posts[0]!)!;
  const setId = posts[0]!.social_set_id;
  // The post keeps its time of day in its set's time zone, and the dates are that zone's days, as `move` reads them.
  const [zone, setZone] = useState<string | null>(setZones.get(setId) ?? null);
  const [value, setValue] = useState(zone ? toZoneInput(when.toISOString(), zone).slice(0, 10) : "");
  const day = value ? new Date(`${value}T00:00`) : null;
  const ok = day !== null && zone !== null && moveToZoneDay(when, day, zone) !== null;
  useEffect(() => ref.current?.showModal(), []);
  const iso = when.toISOString();
  useEffect(() => {
    if (zone) return;
    let live = true;
    zoneOf(setId).then((z) => {
      if (!live) return;
      setZone(z);
      setValue((v) => v || toZoneInput(iso, z).slice(0, 10));
    });
    return () => {
      live = false;
    };
  }, [setId, zone, iso]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    ref.current?.close();
    onMove(posts, day);
  };
  return (
    <dialog ref={ref} aria-labelledby={id} onClose={onClose} className="m-auto w-[min(22rem,calc(100vw-1rem))] rounded-lg bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/20">
      <form onSubmit={submit} className="grid gap-3 p-4">
        <h3 id={id} className="text-sm font-bold">
          Move {snippet(posts[0]!)}
        </h3>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-date`} className="label">
            New date
          </label>
          <input
            id={`${id}-date`}
            type="date"
            className="field"
            required
            min={toZoneInput(new Date().toISOString(), zoneFor(setId)).slice(0, 10)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby={`${id}-hint`}
          />
          <p id={`${id}-hint`} className="hint">
            {zone === null ? "Loading time zone..." : `It keeps its time, ${when.toLocaleTimeString(undefined, { timeStyle: "short", timeZone: zone })} in ${zone}${posts.length > 1 ? `, on all ${posts.length} networks` : ""}.`}
          </p>
          {value && zone !== null && !ok && <p className="waitlist-error">That is in the past. Pick a later day.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={!ok}>
            Move
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => ref.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

// The month's days that have posts, in order, for screens too narrow for the grid.
function MonthList({ posts, y, m, title }: { posts: Post[]; y: number; m: number; title: string }) {
  const days = new Map<number, Post[]>();
  for (const p of posts.filter(postDay).sort((a, b) => postDay(a)!.getTime() - postDay(b)!.getTime())) {
    const d = at(p)!;
    if (d.getFullYear() === y && d.getMonth() === m) days.set(d.getDate(), [...(days.get(d.getDate()) ?? []), p]);
  }
  if (days.size === 0) return <EmptyState title={`Nothing scheduled or published in ${title}.`} />;
  return (
    <ol aria-label={`Posts in ${title}`} className="enter card divide-y divide-ink/10">
      {[...days].map(([date, list]) => (
        <li key={date} className="grid gap-2 p-3">
          <p className="text-xs font-bold text-ink-soft">
            {new Date(y, m, date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <ul className="grid gap-1">
            {chips(list).map((v) => (
              <PostChip key={v[0]!.id} posts={v} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// The Posts list's choices, in the order the chips show them.
const statusChips: PostStatus[] = ["scheduled", "queued", "published", "failed", "deleted", "draft"];
const noFilters: PostFilters = { q: "", status: "all", network: "all", approval: "all" };
// What an owner or admin can do with a row that waits for approval.
type Review = { busy: boolean; approve: (posts: Post[]) => void; reject: (posts: Post[]) => void };
const failText = (posts: Post[]) => posts.map((p) => p.error ?? p.targets.find((t) => t.error)?.error).find(Boolean);

// One line of the Posts list: time, networks, text and status; the whole line opens the post.
function PostRow({ posts, onMove, review }: { posts: Post[]; onMove?: (posts: Post[]) => void; review?: Review }) {
  const p = posts[0]!;
  const approval = approvalState(p);
  const remote = posts.flatMap((v) => v.targets.filter((t) => t.remote_url && t.status === "published").map((t) => ({ ...t, platform: v.platform })));
  const error = p.status === "failed" ? failText(posts) : undefined;
  // A published row's likes and comments over all its networks, once brain has read any.
  const totals = p.status === "published" ? postTotals(posts) : null;
  const stats = totals && statWords(totals, ["likes", "comments"]);
  return (
    <li className="relative flex flex-wrap items-start gap-x-3 gap-y-0.5 px-3 py-2.5 hover:bg-ink/[0.03] sm:items-center sm:px-4">
      <Link href={`/posts/${p.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm after:absolute after:inset-0 sm:flex-nowrap">
        <span className="w-[4.5rem] shrink-0 text-ink-soft tabular-nums">{time(at(p)!)}</span>
        <span className="flex min-w-9 shrink-0 items-center gap-1">
          {posts.map((v) => (
            <PlatformMark key={v.id} platform={v.platform} className="size-4" />
          ))}
        </span>
        <span className="min-w-0 basis-full truncate sm:flex-1 sm:basis-auto">
          {p.lists.length > 0 && <span className="font-bold">{p.lists.map(partLabel).join(", ")}: </span>}
          {p.body.trim().slice(0, 200) || "(images only)"}
        </span>
      </Link>
      {stats && (
        <span className="text-xs text-ink-soft tabular-nums" data-row-stats>
          {stats}
        </span>
      )}
      <StatusBadge status={p.status} />
      <ApprovalBadge post={p} />
      <RepeatBadge post={p} />
      {review && approval === "pending" && (
        <>
          <button type="button" className="btn btn-primary btn-sm relative z-10" disabled={review.busy} aria-label={`Approve ${snippet(p)}`} onClick={() => review.approve(posts)}>
            Approve
          </button>
          <button type="button" className="btn btn-quiet btn-sm relative z-10" disabled={review.busy} aria-label={`Request changes: ${snippet(p)}`} onClick={() => review.reject(posts)}>
            Request changes
          </button>
        </>
      )}
      {onMove && (
        <button type="button" className="btn btn-quiet btn-sm relative z-10" aria-label={`Move to... ${snippet(p)}`} onClick={() => onMove(posts)}>
          <Icon name="clock" className="size-3.5" />
          Move to...
        </button>
      )}
      <Link
        href={`/posts/new?from=${encodeURIComponent(p.id)}`}
        aria-label={`Duplicate ${snippet(p)}`}
        title="Duplicate"
        className="relative z-10 shrink-0 rounded-md p-1 text-ink-soft hover:bg-ink/10 hover:text-ink"
      >
        <Icon name="copy" className="size-3.5" />
      </Link>
      {remote.map((t) => (
        <a
          key={t.id}
          href={t.remote_url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View on ${platformName(t.platform)}`}
          className="relative z-10 shrink-0 rounded-md p-1 text-ink-soft hover:bg-ink/10 hover:text-ink"
        >
          <Icon name="external" className="size-3.5" />
        </a>
      ))}
      {error && (
        <p className="basis-full truncate text-xs sm:pl-[5.25rem] text-signal-deep" title={error}>
          {error}
        </p>
      )}
      {approval === "rejected" && p.approval_note && (
        <p className="basis-full truncate text-xs sm:pl-[5.25rem] text-signal-deep" title={p.approval_note}>
          {p.approval_note}
        </p>
      )}
    </li>
  );
}

function DayGroup({ date, list, today, review }: { date: Date; list: Post[][]; today: boolean; review?: Review }) {
  return (
    <li aria-current={today ? "date" : undefined}>
      <h3 className={`flex items-baseline gap-2 border-b border-[var(--line-soft)] bg-[var(--side)] px-3 py-1.5 text-xs sm:px-4 ${today ? "text-ink" : "text-ink-soft"}`}>
        {today && <span className="font-bold text-signal-deep">Today</span>}
        <span className="font-bold">{date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
        <span className="ml-auto tabular-nums">{list.length === 1 ? "1 post" : `${list.length} posts`}</span>
      </h3>
      <ul className="divide-y divide-[var(--line-soft)]">
        {list.map((v) => (
          <PostRow key={v[0]!.id} posts={v} review={review} />
        ))}
      </ul>
    </li>
  );
}

// A row of toggle chips; `counts` is filled once the posts are in.
function Chips<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; name: ReactNode; count?: number }[]; onPick: (v: T) => void }) {
  return (
    <ul aria-label={label} className="flex gap-1.5 max-sm:-m-0.5 max-sm:overflow-x-auto max-sm:p-0.5 sm:flex-wrap">
      {options.map((o) => (
        <li key={o.id} className="shrink-0">
          <button
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onPick(o.id)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-bold ${
              value === o.id ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {o.name}
            {o.count !== undefined && <span className={`tabular-nums ${value === o.id ? "opacity-75" : "font-normal"}`}>{o.count}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// The month's posts by day under the filters: from today on first, earlier days of the current month folded.
function PostList({ rows: all, y, m, title, filters, onClear, review, now }: { rows: Post[][]; y: number; m: number; title: string; filters: PostFilters; onClear: () => void; review?: Review; now: Date }) {
  const days = new Map<number, Post[][]>();
  for (const r of all.filter((r) => matchesFilters(r, filters))) {
    const d = at(r[0]!)!;
    days.set(d.getDate(), [...(days.get(d.getDate()) ?? []), r]);
  }
  if (all.length === 0)
    return (
      <EmptyState
        title={`Nothing scheduled or published in ${title}.`}
        action={
          <Link href="/posts/new" className="btn btn-primary btn-sm">
            Write a post
          </Link>
        }
      >
        Posts you schedule for this month show up here by day.
      </EmptyState>
    );
  if (days.size === 0)
    return (
      <div className="card grid justify-items-start gap-3 p-5">
        <p className="text-ink-soft">
          {filters.status === "draft" ? "Drafts have no day, so they are listed under Drafts." : `No posts in ${title} match these filters.`}
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
          Clear filters
        </button>
      </div>
    );
  const thisMonth = now.getFullYear() === y && now.getMonth() === m;
  const entries = [...days].sort(([a], [b]) => a - b);
  const earlier = thisMonth ? entries.filter(([d]) => d < now.getDate()) : [];
  const upcoming = thisMonth ? entries.filter(([d]) => d >= now.getDate()) : entries;
  const group = ([d, list]: [number, Post[][]]) => <DayGroup key={d} date={new Date(y, m, d)} list={list} today={thisMonth && d === now.getDate()} review={review} />;
  const count = earlier.reduce((n, [, l]) => n + l.length, 0);
  return (
    <div className="enter grid gap-4">
      {upcoming.length > 0 ? (
        <ol aria-label={`Posts in ${title}`} className="card overflow-hidden">
          {upcoming.map(group)}
        </ol>
      ) : (
        <p className="card p-5 text-ink-soft">Nothing else planned in {title}.</p>
      )}
      {earlier.length > 0 && (
        <details className="card group overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-bold sm:px-4 [&::-webkit-details-marker]:hidden">
            <Icon name="right" className="size-4 transition-transform group-open:rotate-90" />
            Earlier this month ({count === 1 ? "1 post" : `${count} posts`})
          </summary>
          <ol aria-label={`Earlier posts in ${title}`} className="border-t border-[var(--line-soft)]">
            {earlier.map(group)}
          </ol>
        </details>
      )}
    </div>
  );
}

// /posts lists the month's posts by day with the drafts below; /calendar shows the month as a grid (a list of days on narrow screens).
export function Posts({ view }: { view: "list" | "calendar" }) {
  // The set picked in the top bar filters the calendar and drafts, and its zone dates the grid.
  const [setId] = useCurrentSet();
  const now = inZone(new Date(), setId ? setZones.get(setId) : undefined);
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [posts, setPosts] = useState<Post[] | Failure | null>(null);
  const [drafts, setDrafts] = useState<Post[] | Failure | null>(null);
  // Unique ids: Next can keep /posts and /calendar both mounted, one hidden.
  const ids = useId();
  // Rescheduling: the chip being dragged, the day under it, the posts the "Move to..." picker is open for,
  // what the last move did, and a counter that reloads the month after one.
  const [dragging, setDragging] = useState<Post[] | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [picking, setPicking] = useState<Post[] | null>(null);
  const [moved, setMoved] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const [reload, setReload] = useState(0);
  const [draftsReload, setDraftsReload] = useState(0);
  // Approvals: owners and admins approve a waiting row or ask for changes (the dialog is open for `rejecting`).
  const team = useSession().user.current_team;
  const requires = !!team.require_approval;
  const decision = useAction();
  const [rejecting, setRejecting] = useState<Post[] | null>(null);
  async function decide(group: Post[], what: "approve" | "reject", note = "") {
    const name = snippet(group[0]!);
    await decision.run(what, () => decidePost(group[0]!, what, note), (out) => {
      const on = out.length > 1 ? ` on ${out.length} networks` : "";
      return what === "approve" ? `Approved ${name}${on}. It goes out at its scheduled time.` : `Asked for changes to ${name}${on}. It stays unpublished until then.`;
    });
    // Also after a refusal: the row was stale.
    setReload((n) => n + 1);
  }
  const review: Review | undefined = manages(team.role) ? { busy: decision.busy !== null, approve: (g) => decide(g, "approve"), reject: setRejecting } : undefined;

  // Each set's zone is read before the month's posts show, so none jumps a day.
  const [zonesRead, setZonesRead] = useState(false);
  useEffect(() => {
    listSets().then(async (r) => {
      setSets(r);
      if (Array.isArray(r)) await Promise.all(r.map((s) => zoneOf(s.id).then((z) => setZones.set(s.id, z))));
      setZonesRead(true);
    });
  }, []);

  useEffect(() => {
    if (!zonesRead) return;
    let live = true;
    // A day either side: a post's day in its set's zone can be a day off the browser's month.
    const { from, to } = monthRange(month.y, month.m);
    const pad = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
    listPosts({ social_set_id: setId, from: pad(from, -1), to: pad(to, 1) }).then((r) => live && setPosts(r));
    return () => {
      live = false;
    };
  }, [month, setId, reload, zonesRead]);

  // Moves the versions of one post to `day` at the same time: shown there at once, then one PUT each with
  // the post as it is and the new time. A version brain refuses goes back to its day, named with brain's reason.
  async function move(group: Post[], day: Date) {
    setDragging(null);
    setOver(null);
    // The same wall time in the set's time zone, as the composer schedules it.
    const zone = setZones.get(group[0]!.social_set_id) ?? (await zoneOf(group[0]!.social_set_id));
    const to = moveToZoneDay(postDay(group[0]!)!, day, zone);
    if (!to) return setMoved({ ok: false, text: "A post can't move to a time that has passed." });
    const iso = to.toISOString();
    const label = to.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone });
    const ids = new Set(group.map((p) => p.id));
    setMoved({ ok: true, text: `Moving to ${label}...` });
    setPosts((old) => (Array.isArray(old) ? old.map((p) => (ids.has(p.id) ? { ...p, scheduled_at: iso } : p)) : old));
    const saved: Post[] = [];
    const failed: { platform: Platform; failure: Failure }[] = [];
    for (const p of group) {
      const r = await updatePost(p.id, editInput(p, iso));
      if (isFailure(r)) failed.push({ platform: p.platform, failure: r });
      else saved.push(r);
    }
    setPosts((old) => (Array.isArray(old) ? old.map((p) => saved.find((v) => v.id === p.id) ?? (ids.has(p.id) ? group.find((g) => g.id === p.id)! : p)) : old));
    setMoved({
      ok: failed.length === 0,
      text: (
        <>
          {saved.length > 0 && `Moved ${failed.length ? `${saved.map((v) => platformName(v.platform)).join(", ")} ` : ""}to ${label}. `}
          {failed.map((f) => (
            <span key={f.platform}>
              Not moved on {platformName(f.platform)}: {problemText(f.failure, postMessages)}{" "}
            </span>
          ))}
        </>
      ),
    });
    setReload((n) => n + 1);
  }

  useEffect(() => {
    if (view !== "list") return;
    let live = true;
    listPosts({ social_set_id: setId, status: "draft" }).then((r) => live && setDrafts(r));
    return () => {
      live = false;
    };
  }, [setId, view, draftsReload]);

  // Another month starts from the placeholders, not from "Nothing scheduled".
  const step = (by: number) => {
    setPosts(null);
    setMonth(({ y, m }) => ({ y: m + by < 0 ? y - 1 : m + by > 11 ? y + 1 : y, m: (m + by + 12) % 12 }));
  };
  const title = new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  // 1 January 2024 was a Monday, so these are Monday to Sunday in the browser's language.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }));
  const calendarPosts = Array.isArray(posts) ? posts.filter((p) => p.status !== "draft") : [];
  const setName = (id: string) => (Array.isArray(sets) ? sets.find((s) => s.id === id)?.name : undefined);

  // The list's filters live in the URL, written with replaceState so typing doesn't add history or reload.
  // The approval filter only counts while the team requires approval, since its chips are hidden otherwise.
  const parsed = parseFilters(useSearchParams());
  const filters: PostFilters = requires ? parsed : { ...parsed, approval: "all" };
  const teamPath = useTeamPath();
  const search = useRef<HTMLInputElement>(null);
  const setFilters = (f: PostFilters) => window.history.replaceState(null, "", teamPath(`/posts${filterQuery(f)}`));
  const clear = () => {
    if (search.current) search.current.value = "";
    setFilters(noFilters);
  };
  const monthRows = chips(
    calendarPosts
      .filter((p) => at(p)?.getFullYear() === month.y && at(p)?.getMonth() === month.m)
      .sort((a, b) => postDay(a)!.getTime() - postDay(b)!.getTime()),
  );
  const draftRows = Array.isArray(drafts) ? rows(drafts, () => "") : [];
  const shownDrafts = draftRows.filter((r) => matchesFilters(r, filters));
  const loaded = Array.isArray(posts);
  const counted = (skip: "status" | "network" | "approval") => [...monthRows, ...draftRows].filter((r) => matchesFilters(r, filters, skip));
  const byStatus = counted("status");
  const byNetwork = counted("network");
  const byApproval = counted("approval");
  const networks = [...new Set([...monthRows, ...draftRows].flat().map((p) => p.platform))];
  if (filters.network !== "all" && !networks.includes(filters.network)) networks.push(filters.network);
  const filtered = filters.q !== "" || filters.status !== "all" || filters.network !== "all" || filters.approval !== "all";

  return (
    <div className="grid gap-10">
      <AccountNote />
      <section aria-labelledby={`${ids}-month`} className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => step(-1)}>
              <Icon name="left" />
            </button>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => step(1)}>
              <Icon name="right" />
            </button>
            <h2 id={`${ids}-month`} className="ml-2 font-display text-xl font-extrabold tracking-tight" aria-live="polite">
              {title}
            </h2>
          </div>
        </div>
        {view === "list" && (
          <div className="grid gap-3">
            <div role="search" className="flex w-full max-w-md items-center gap-2">
              <input
                ref={search}
                type="search"
                aria-label="Search posts"
                placeholder="Search posts"
                defaultValue={filters.q}
                maxLength={200}
                className="field min-w-0 flex-1"
                onChange={(e) => setFilters({ ...filters, q: e.target.value.trim() })}
              />
            </div>
            <Chips
              label="Status"
              value={filters.status}
              onPick={(status) => setFilters({ ...filters, status })}
              options={[
                { id: "all" as const, name: "All", count: loaded ? byStatus.length : undefined },
                ...statusChips.map((s) => ({ id: s, name: statusName[s], count: loaded ? byStatus.filter((r) => r[0]!.status === s).length : undefined })),
              ]}
            />
            {networks.length > 1 || filters.network !== "all" ? (
              <Chips
                label="Network"
                value={filters.network}
                onPick={(network) => setFilters({ ...filters, network })}
                options={[
                  { id: "all" as Platform | "all", name: "All networks", count: loaded ? byNetwork.length : undefined },
                  ...networks.map((n) => ({
                    id: n,
                    name: <PlatformMark platform={n} named className="size-3.5" />,
                    count: loaded ? byNetwork.filter((r) => r.some((p) => p.platform === n)).length : undefined,
                  })),
                ]}
              />
            ) : null}
            {requires && (
              <Chips
                label="Approval"
                value={filters.approval}
                onPick={(approval) => setFilters({ ...filters, approval })}
                options={[
                  { id: "all" as PostFilters["approval"], name: "All", count: loaded ? byApproval.length : undefined },
                  ...(["pending", "rejected"] as const).map((a) => ({ id: a, name: approvalName[a], count: loaded ? byApproval.filter((r) => approvalState(r[0]!) === a).length : undefined })),
                ]}
              />
            )}
            <Status problem={decision.problem} done={decision.done} overrides={postMessages} />
          </div>
        )}
        {rejecting && <ChangesDialog key={rejecting[0]!.id} posts={rejecting} onClose={() => setRejecting(null)} onSend={(g, note) => decide(g, "reject", note)} />}
        {view === "calendar" && moved && (
          <p role={moved.ok ? "status" : "alert"} className={moved.ok ? "waitlist-done" : "waitlist-error"}>
            {moved.text}
          </p>
        )}
        {picking && <MoveDialog key={picking[0]!.id} posts={picking} onClose={() => setPicking(null)} onMove={move} />}
        {isFailure(posts) ? (
          <LoadFailed
            what="posts"
            retry={() => {
              setPosts(null);
              setReload((n) => n + 1);
            }}
          >
            Posts couldn&apos;t be loaded. {problemText(posts, postMessages)}
          </LoadFailed>
        ) : posts === null && view === "list" ? (
          <SkeletonRows label="Loading posts..." rows={6} />
        ) : (
          <>
            {/* The calendar keeps its grid while the month loads, so nothing jumps when the posts arrive. */}
            {posts === null && (
              <p role="status" className="sr-only max-lg:hidden">
                Loading posts...
              </p>
            )}
            {view === "list" && <PostList rows={monthRows} y={month.y} m={month.m} title={title} filters={filters} onClear={clear} review={review} now={now} />}
            {/* Narrow screens get the month as a list of days; the grid needs about 46rem. */}
            {view === "calendar" && (
            <div className="lg:hidden">
              {posts === null ? <SkeletonRows label="Loading posts..." rows={5} /> : <MonthList posts={calendarPosts} y={month.y} m={month.m} title={title} />}
            </div>
            )}
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
                      const list = day ? monthRows.filter((r) => sameDay(at(r[0]!)!, day)) : [];
                      const today = day && sameDay(day, now);
                      // While a chip is dragged, each day says whether it can take it: not its own day, not the past.
                      const from = dragging && at(dragging[0]!);
                      const real = dragging && postDay(dragging[0]!);
                      const drop = day && from && real ? (!sameDay(day, from) && moveToZoneDay(real, day, zoneFor(dragging[0]!.social_set_id)) ? "ok" : "no") : undefined;
                      const key = day?.toDateString() ?? "";
                      return (
                        <td
                          key={j}
                          aria-current={today ? "date" : undefined}
                          data-drop={drop}
                          title={drop === "no" ? "Can't move here" : undefined}
                          onDragOver={(e) => {
                            if (drop !== "ok") return void (e.dataTransfer.dropEffect = "none");
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setOver(key);
                          }}
                          onDragLeave={() => setOver((o) => (o === key ? null : o))}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (drop === "ok" && dragging && day) move(dragging, day);
                          }}
                          className={`border-[var(--line-soft)] p-0 align-top [&:not(:last-child)]:border-r ${i > 0 ? "border-t" : ""} ${
                            day ? (today ? "bg-signal/[0.05] shadow-[inset_0_2px_0_var(--color-signal-deep)]" : "") : "bg-[var(--side)]"
                          } ${drop === "no" ? "cursor-not-allowed opacity-45" : ""} ${drop === "ok" && over === key ? "outline-2 -outline-offset-2 outline-dashed outline-signal-deep bg-signal/10" : ""}`}
                        >
                          {/* Every week is as tall as three two-line chips and "+N more", however busy the days. */}
                          <div className="flex h-[10.5rem] flex-col gap-0.5 overflow-hidden p-1">
                            {day && (
                              <>
                                <p
                                  className={`ml-0.5 inline-grid h-5 min-w-5 place-items-center self-start rounded px-1 text-xs tabular-nums ${
                                    today ? "bg-signal-deep font-bold text-paper" : "text-ink-soft"
                                  }`}
                                >
                                  {day.getDate()}
                                </p>
                                {posts === null && (i + j) % 2 === 0 && <Skeleton className="mx-1.5 mt-1 h-3 w-3/4" />}
                                {list.length > 0 && (
                                  <ul className="enter grid gap-0.5">
                                    {list.slice(0, 3).map((v) => (
                                      <GridChip key={v[0]!.id} posts={v} onDrag={setDragging} onMove={setPicking} />
                                    ))}
                                  </ul>
                                )}
                                {list.length > 3 && <DayMore day={day} list={list} hidden={list.length - 3} onMove={setPicking} />}
                              </>
                            )}
                          </div>
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
        {/* The list names each post's status; the calendar's dots need the key. */}
        {view === "calendar" && (
        <ul aria-label="Colors" className="flex flex-wrap gap-2">
          {legend.map((s) => (
            <li key={s}>
              <StatusBadge status={s} />
            </li>
          ))}
          {requires && (
            <li>
              <span className="badge tone" data-approval="pending">
                <span aria-hidden="true" className="dot" data-approval="pending" />
                {approvalName.pending}
              </span>
            </li>
          )}
        </ul>
        )}
      </section>
      {view === "list" && (
      <section aria-labelledby={`${ids}-drafts`} className="grid gap-4">
        <h2 id={`${ids}-drafts`} className="font-display text-xl font-extrabold tracking-tight">
          Drafts
        </h2>
        {drafts === null ? (
          <div role="status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <span className="sr-only">Loading drafts...</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="tone grid h-[5.5rem] content-start gap-2.5 rounded-2xl p-4" data-status="draft">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            ))}
          </div>
        ) : isFailure(drafts) ? (
          <LoadFailed
            what="drafts"
            retry={() => {
              setDrafts(null);
              setDraftsReload((n) => n + 1);
            }}
          >
            Drafts couldn&apos;t be loaded. {problemText(drafts, postMessages)}
          </LoadFailed>
        ) : drafts.length === 0 ? (
          <p className="text-ink-soft">No drafts. Posts you save without scheduling show up here.</p>
        ) : shownDrafts.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-ink-soft">No drafts match these filters.</p>
            {filtered && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="enter grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shownDrafts.map((v) => {
              const p = v[0]!;
              return (
              <li key={p.id} className="tone relative grid content-start gap-2 rounded-2xl bg-paper p-4 hover:bg-ink/[0.02]" data-status="draft">
                <Link href={`/posts/${p.id}`} className="font-bold text-ink after:absolute after:inset-0 after:rounded-2xl">
                  {v.map((v) => (
                    <PlatformMark key={v.id} platform={v.platform} className="size-4" />
                  ))}{" "}
                  {snippet(p)}
                </Link>
                {p.lists.length > 0 && <p className="text-sm font-bold">{p.lists.map(partLabel).join(", ")}</p>}
                {approvalState(p) && (
                  <p className="text-sm text-signal-deep">
                    <ApprovalBadge post={p} /> {p.approval_note}
                  </p>
                )}
                <p className="text-sm text-ink-soft">
                  {setName(p.social_set_id) ? `${setName(p.social_set_id)}. ` : ""}Saved{" "}
                  {new Date(p.updated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
                </p>
              </li>
              );
            })}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
