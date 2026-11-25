"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { TeamLink as Link } from "@/components/team-link";
import { accountName, Avatar } from "@/components/connections";
import { platformName } from "@/components/platform-icons";
import { fileName, Preview } from "@/components/post-preview";
import { PostPagePanel } from "@/components/post-page-panel";
import { RefreshStats, TargetStats } from "@/components/post-analytics";
import { PlatformMark } from "@/components/posts";
import { Icon } from "@/components/ui";
import { hasStats } from "@/lib/analytics";
import type { Connection } from "@/lib/connections";
import { canRetry, charCount, charLimit, failureAdvice, isImageLink, limits, overallName, overallStatus, postRef, privacyName, timeline, youtubePrivacyName, youtubeText, type Overall, type Post, type Target, type TakedownResult, type ThreadPart } from "@/lib/posts";

const names = (list: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(list.map(platformName));
// A moment in the set's zone, with the zone's short name ("Nov 25, 2026, 7:11 PM GMT+6").
export const at = (iso: string, zone: string) => new Date(iso).toLocaleString("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" });
// Returns focus to the button that opened a confirmation, once it is back.
const focusAsk = (key: string) => document.querySelector<HTMLButtonElement>(`[data-ask="${key}"]`)?.focus();
const heading = "font-display text-lg font-extrabold tracking-tight";

export type DetailProps = {
  // The page's post, and every post made with it (a group), this one included.
  post: Post;
  members: Post[];
  zone: string;
  setName?: string;
  author?: string;
  accounts: Connection[];
  // The shared status lines (what an action answered) and the notes that belong under the header.
  messages: ReactNode;
  pollNote: string;
  statusRef: RefObject<HTMLParagraphElement | null>;
  busy: string | null;
  downs: TakedownResult[] | null;
  downsShown: number;
  onPost: (p: Post) => void;
  onRetry: (p: Pick<Post, "id" | "group_id">) => Promise<unknown>;
  onTakeDown: (p: Post) => Promise<boolean>;
  onTakeDownAll: () => Promise<boolean>;
};

// The page of a post that can no longer be edited (published, failed, publishing or taken down): what it is, where it
// went, what it said per network, and what to do next. A post made for several networks is one post with a tab each.
export function PostDetail({ statusRef, ...d }: DetailProps) {
  const { post, members, zone, accounts } = d;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const overall = overallStatus(members);
  const [openId, setOpenId] = useState(post.id);
  const shown = members.find((m) => m.id === openId) ?? post;
  const tabbed = members.length > 1;
  const groupId = post.group_id;
  const live = members.filter((m) => m.status === "published" && m.platform !== "tiktok");
  const tiktokUp = members.some((m) => m.status === "published" && m.platform === "tiktok");
  const failed = members.filter((m) => m.status !== "deleted" && (m.status === "failed" || m.targets.some((t) => t.status === "failed")));
  const retryable = members.filter((m) => m.targets.some((t) => canRetry(t, m)));
  const waiting = members.some((m) => m.targets.some((t) => t.retry_at));
  const [confirm, setConfirm] = useState<null | "all" | string>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [now] = useState(() => Date.now());
  const downsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelId = useId();

  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);
  useEffect(() => {
    if (d.downsShown) downsRef.current?.focus();
  }, [d.downsShown]);

  const label = (id: string | null) => {
    const a = id ? byId.get(id) : undefined;
    return a ? accountName(a) : "a disconnected account";
  };
  const events = timeline(members, { account: label, network: platformName as (p: string) => string }, d.author);
  const publishedAt = members.flatMap((m) => m.targets.map((t) => t.published_at)).filter((x): x is string => !!x).sort()[0] ?? post.published_at;
  const title = (() => {
    const text = shown.body.trim().split("\n")[0] ?? "";
    return text ? (text.length > 90 ? `${text.slice(0, 90)}...` : text) : "Post with no text";
  })();

  // The status line (announced when an action finishes) and, under it, the time the post was planned for.
  const line =
    overall === "queued"
      ? "Publishing. This page updates by itself."
      : (overall === "published" || overall === "partial") && publishedAt
        ? `${overall === "partial" ? "Partly published" : "Published"} on ${at(publishedAt, zone)}.`
        : `${overallName[overall]}.`;
  const planned = post.scheduled_at && overall !== "queued" ? `Planned for ${at(post.scheduled_at, zone)}.` : "";

  async function takeDown(p: Post) {
    const ok = await d.onTakeDown(p);
    const from = confirm;
    flushSync(() => setConfirm(null));
    if (!ok && from) focusAsk(from);
  }
  function cancel() {
    const from = confirm;
    flushSync(() => setConfirm(null));
    if (from) focusAsk(from);
  }
  function openTab(id: string) {
    setConfirm(null);
    setOpenId(id);
    tabRefs.current[id]?.focus();
  }
  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = members.findIndex((m) => m.id === shown.id);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? members.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    openTab(members[(next + members.length) % members.length]!.id);
  }
  const showTab = (m: Post) => {
    setConfirm(null);
    setOpenId(m.id);
    tabRefs.current[m.id]?.scrollIntoView({ inline: "nearest", block: "nearest" });
    // After the panel has taken the version, so a screen reader lands on what it announces.
    requestAnimationFrame(() => document.getElementById(`${panelId}-panel`)?.focus());
  };

  const confirmCard = (what: "all" | Post) => {
    const posts = what === "all" ? live : [what];
    const q = `${panelId}-q`;
    return (
      <div className="card grid gap-3 p-4" role="group" aria-labelledby={q}>
        <p id={q}>
          {what === "all" || posts.length > 1
            ? `Take ${posts.length === 1 ? "this post" : `these ${posts.length} posts`} down from ${names(posts.map((m) => m.platform))}? ${posts.length === 1 ? "It stays" : "They stay"} here as taken down.`
            : `Take this post down from ${platformName(what.platform)}? It stays here as taken down.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            ref={confirmRef}
            type="button"
            className="btn btn-primary btn-sm"
            aria-describedby={q}
            disabled={d.busy !== null}
            onClick={() => (what === "all" && groupId ? d.onTakeDownAll().then((ok) => {
                  flushSync(() => setConfirm(null));
                  if (!ok) focusAsk("all");
                }) : takeDown(what === "all" ? live[0]! : what))}
          >
            {d.busy === "takedown" || d.busy === "takedown-all" ? "Taking down..." : what === "all" && posts.length > 1 ? "Yes, take them all down" : "Yes, take it down"}
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={d.busy !== null} onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const left = (d.downs ?? []).filter((x) => x.state === "failed");
  const downNames = (d.downs ?? []).filter((x) => x.state === "taken_down").map((x) => x.platform);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <header className="card grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="grid min-w-0 flex-1 basis-72 gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <OverallBadge overall={overall} />
                <span className="text-sm text-ink-soft">Post {postRef(post)}</span>
              </div>
              <h2 className="break-words font-display text-xl font-extrabold leading-snug tracking-tight">{title}</h2>
              <p ref={statusRef} tabIndex={-1} role="status" className="text-sm font-bold outline-none">
                {line}
              </p>
              {planned && <p className="text-sm text-ink-soft">{planned}</p>}
              {d.pollNote && <p className="text-sm text-ink-soft">{d.pollNote}</p>}
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft" aria-label="Details">
                {d.setName && (
                  <li className="flex items-center gap-1.5">
                    <Icon name="sets" className="size-4" />
                    <span className="sr-only">Set: </span>
                    {d.setName}
                  </li>
                )}
                {d.author && (
                  <li className="flex items-center gap-1.5">
                    <Icon name="user" className="size-4" />
                    <span className="sr-only">Author: </span>
                    {d.author}
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <Icon name="clock" className="size-4" />
                  <span className="sr-only">Time zone: </span>
                  {zone.replaceAll("_", " ")}
                </li>
                {members.flatMap((m) => m.lists).filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i).map((l) => (
                  <li key={l.id}>
                    <Link href={`/lists/${l.id}`} className="inline-flex items-center gap-1.5 font-bold text-ink hover:underline">
                      <Icon name="lists" className="size-4" />
                      Part {l.position} · {l.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Actions">
              {retryable.length > 1 && !waiting && (
                <button type="button" className="btn btn-primary btn-sm" disabled={d.busy !== null} onClick={() => d.onRetry(post)}>
                  <Icon name="repeat" className="size-4" />
                  {d.busy === "retry" ? "Retrying..." : `Retry ${retryable.length} failed`}
                </button>
              )}
              <Link href={`/posts/new?from=${postRef(post)}`} className="btn btn-secondary btn-sm">
                <Icon name="copy" className="size-4" />
                Duplicate
              </Link>
              {live.length > 0 && confirm === null && (
                <button
                  data-ask="all"
                  type="button"
                  className="btn btn-quiet btn-danger btn-sm"
                  disabled={d.busy !== null}
                  onClick={() => setConfirm("all")}
                >
                  <Icon name="trash" className="size-4" />
                  {tabbed ? "Take down all" : "Take down"}
                </button>
              )}
            </div>
          </div>
          {failed.length > 0 && overall !== "queued" && (
            <div role="group" aria-label="Needs attention" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg alert-bad px-3 py-2 text-sm">
              <Icon name="warning" className="size-4 shrink-0" />
              <span className="font-bold">{failed.length === members.length && members.length === 1 ? "This post did not go out." : `Did not go out on ${names(failed.map((m) => m.platform))}.`}</span>
              {tabbed &&
                failed.map((m) => (
                  <button key={m.id} type="button" className="font-bold underline" onClick={() => showTab(m)}>
                    Show {platformName(m.platform)}
                  </button>
                ))}
            </div>
          )}
          {d.messages}
          {confirm === "all" && confirmCard("all")}
          {tiktokUp && <p className="hint">TikTok does not let other apps delete a post. Delete it in the TikTok app.</p>}
          {d.downs && (
            <div key={d.downsShown} ref={downsRef} tabIndex={-1} role={left.length ? "alert" : "status"} className="grid gap-3 rounded-lg bg-ink/[0.04] p-3">
              <p className="font-bold">
                {downNames.length > 0 && `Taken down from ${names(downNames)}. `}
                {left.length > 0 ? `Still to take down: ${names(left.map((x) => x.platform))}.` : downNames.length === 0 && "Those posts were already gone."}
              </p>
              <ul className="grid gap-1 text-sm">
                {d.downs.map((x) => (
                  <li key={x.post_id}>
                    <PlatformMark platform={x.platform} named />: {x.state === "taken_down" ? "taken down" : x.state === "already_gone" ? "already gone" : x.message || "could not be taken down"}
                  </li>
                ))}
              </ul>
              {left.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-primary btn-sm" disabled={d.busy !== null} onClick={() => d.onTakeDownAll()}>
                    {d.busy === "takedown-all" ? "Taking down..." : `Retry ${names(left.map((x) => x.platform))}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        <section aria-labelledby={`${panelId}-h`} className="card min-w-0 overflow-hidden">
          <h2 id={`${panelId}-h`} className="sr-only">
            What was posted
          </h2>
          {tabbed && (
            <div role="tablist" aria-label="Networks" aria-orientation="horizontal" onKeyDown={onTabKey} className="relative flex gap-1 overflow-x-auto border-b border-[var(--line)] px-2 pt-2">
              {members.map((m) => {
                const on = m.id === shown.id;
                const s = versionStatus(m);
                return (
                  <button
                    key={m.id}
                    ref={(el) => {
                      tabRefs.current[m.id] = el;
                    }}
                    id={`${panelId}-tab-${m.id}`}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={`${panelId}-panel`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => openTab(m.id)}
                    className={`flex min-h-11 shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 text-sm font-bold ${on ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
                  >
                    <PlatformMark platform={m.platform} className="size-4" named />
                    <span className="dot" data-status={s} aria-hidden="true" />
                    <span className={s === "published" ? "sr-only" : "text-xs font-normal"}>{overallName[s]}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div id={`${panelId}-panel`} role={tabbed ? "tabpanel" : "group"} aria-labelledby={tabbed ? `${panelId}-tab-${shown.id}` : `${panelId}-h`} tabIndex={tabbed ? -1 : undefined} className="grid gap-6 p-4 outline-none sm:p-5">
            <Version v={shown} d={d} byId={byId} onAskDown={() => setConfirm(shown.id)} confirming={confirm === shown.id} confirmCard={confirm === shown.id ? confirmCard(shown) : null} />
          </div>
        </section>
      </div>

      <aside className="grid min-w-0 gap-5" aria-label="History and sharing">
        <section aria-labelledby={`${panelId}-tl`} className="card grid gap-3 p-4 sm:p-5">
          <h2 id={`${panelId}-tl`} className={heading}>
            Timeline
          </h2>
          <ol className="grid gap-0">
            {events.map((e, i) => {
              const future = new Date(e.at).getTime() > now;
              return (
                <li key={i} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
                  <span aria-hidden="true" className={`relative z-10 mt-1.5 size-2.5 rounded-full ${e.tone === "ok" ? "bg-[#2f9e5b]" : e.tone === "bad" ? "bg-[#d63a2f]" : "bg-ink/30"} ${future ? "ring-2 ring-ink/20 ring-offset-2 ring-offset-paper !bg-transparent" : ""}`} />
                  {i < events.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[0.28rem] top-4 w-px bg-[var(--line)]" />}
                  <div className="min-w-0 text-sm">
                    <p className="break-words">{e.text}</p>
                    <p className="text-xs text-ink-soft">
                      <time dateTime={e.at}>{at(e.at, zone)}</time>
                      {future && " (upcoming)"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="hint text-xs">SocialReins keeps the times above. It does not log each step, so a post being picked up or a retry that failed again has no line of its own.</p>
        </section>
        <PostPagePanel id={post.id} />
      </aside>
    </div>
  );
}

// One status for a single version (a post of one network and its accounts).
function versionStatus(m: Post): Overall {
  return overallStatus([m]);
}

function OverallBadge({ overall }: { overall: Overall }) {
  return (
    <span className="badge tone" data-status={overall}>
      {overallName[overall]}
    </span>
  );
}

// One network's version: where it went (an account per row, with its link, numbers and what to do about a failure),
// then what it said (the text as it shows, its media with alt text, the thread, the first comment and settings).
function Version({ v, d, byId, onAskDown, confirming, confirmCard }: { v: Post; d: Omit<DetailProps, "statusRef">; byId: Map<string, Connection>; onAskDown: () => void; confirming: boolean; confirmCard: ReactNode }) {
  const first = v.targets[0]?.social_account_id ?? null;
  const account = first ? byId.get(first) : undefined;
  const canDown = v.status === "published" && v.platform !== "tiktok" && d.members.length > 1;
  const yt = v.platform === "youtube" ? youtubeText(v.body) : null;
  const n = yt ? charCount(v.platform, yt.title) : charCount(v.platform, v.body);
  const max = yt ? limits.youtube.chars : charLimit(v.platform);
  const retryHere = v.targets.some((t) => canRetry(t, v));
  return (
    <>
      <section aria-labelledby={`v-${v.id}-where`} className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`v-${v.id}-where`} className={`${heading} flex items-center gap-2`}>
            <PlatformMark platform={v.platform} className="size-5" named />
            <OverallBadge overall={versionStatus(v)} />
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {v.status === "published" && hasStats(v.platform) && <RefreshStats post={v} onPost={d.onPost} />}
            {canDown && !confirming && (
              <button type="button" data-ask={v.id} className="btn btn-quiet btn-danger btn-sm" disabled={d.busy !== null} onClick={onAskDown}>
                <Icon name="trash" className="size-4" />
                Take down {platformName(v.platform)}
              </button>
            )}
          </div>
        </div>
        {confirmCard}
        {v.status === "draft" || v.status === "scheduled" ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-ink/[0.04] p-3 text-sm">
            <span className="min-w-0 flex-1">
              {v.status === "draft" ? "This version is still a draft." : `This version is scheduled${v.scheduled_at ? ` for ${at(v.scheduled_at, d.zone)}` : ""}.`}
            </span>
            <Link href={`/posts/${postRef(v)}`} className="btn btn-secondary btn-sm">
              <Icon name="edit" className="size-4" />
              Edit {platformName(v.platform)}
            </Link>
          </p>
        ) : v.targets.length > 0 ? (
          <ul className="grid divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
            {v.targets.map((t) => (
              <TargetRow key={t.id} t={t} v={v} d={d} account={t.social_account_id ? byId.get(t.social_account_id) : undefined} retryHere={retryHere} />
            ))}
          </ul>
        ) : (
          <p className="hint">{v.status === "queued" ? "Waiting to go out." : "No account was posted to."}</p>
        )}
        {v.error && v.targets.length === 0 && <p className="waitlist-error">What went wrong: {v.error}</p>}
      </section>

      <section aria-labelledby={`v-${v.id}-content`} className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={`v-${v.id}-content`} className={heading}>
            What {platformName(v.platform)} got
          </h3>
          <p className="text-sm tabular-nums text-ink-soft">
            {yt ? "Title" : "Text"}: {n.toLocaleString("en")} of {max.toLocaleString("en")} characters
          </p>
        </div>
        {v.body.trim() && <Preview inline posts={[{ body: v.body, media: [], media_alt: [] }]} platform={v.platform} account={account} />}
        {v.media.length > 0 && <Gallery title="Media" media={v.media} alt={v.media_alt ?? []} />}
        {v.thread.length > 0 && <Thread v={v} />}
        {v.first_comment && (
          <div className="grid gap-1">
            <h4 className="font-bold">First comment</h4>
            <p className="whitespace-pre-wrap break-words text-sm">{v.first_comment}</p>
          </div>
        )}
        <Settings v={v} />
      </section>
    </>
  );
}

function TargetRow({ t, v, d, account, retryHere }: { t: Target; v: Post; d: Omit<DetailProps, "statusRef">; account?: Connection; retryHere: boolean }) {
  const who = account ? accountName(account) : "A disconnected account";
  const fail = t.status === "failed" || (t.status === "pending" && !!t.error);
  const can = canRetry(t, v);
  const advice = fail ? failureAdvice(t, can, d.zone) : null;
  const tone = t.status === "pending" || t.status === "publishing" ? "queued" : t.status;
  return (
    <li className="grid gap-2 p-3 text-sm sm:p-4">
      <div className="flex items-center gap-3">
        {account ? <Avatar connection={account} size="size-8" /> : <span aria-hidden="true" className="size-8 shrink-0 rounded-full bg-ink/10" />}
        <span className="min-w-0 flex-1">
          <strong className="break-words">{who}</strong>
          {account?.handle && account.display_name && <span className="ml-1.5 break-words text-ink-soft">@{account.handle}</span>}
        </span>
        <span className="badge tone shrink-0" data-status={tone}>
          {t.status === "pending" ? (t.retry_at ? "Retry waiting" : "Waiting") : t.status === "publishing" ? "Publishing" : t.status === "deleted" ? "Taken down" : t.status === "failed" ? "Failed" : "Published"}
        </span>
      </div>
      {((t.published_at && t.status === "published") || (t.remote_url && (t.status === "published" || t.status === "deleted"))) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-11">
          {t.published_at && t.status === "published" && (
            <time className="text-xs text-ink-soft" dateTime={t.published_at}>
              {at(t.published_at, d.zone)}
            </time>
          )}
          {t.remote_url && (t.status === "published" || t.status === "deleted") && (
            <a href={t.remote_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              {t.status === "deleted" ? "Taken-down link" : `View on ${platformName(v.platform)}`}
              <Icon name="external" className="size-4" />
            </a>
          )}
        </div>
      )}
      {fail && (
        <div className="grid gap-2 rounded-lg alert-bad p-3" role="group" aria-label={`What went wrong for ${who}`}>
          <p className="break-words font-bold">{t.error || v.error || "No reason was given."}</p>
          {advice && (
            <p className="break-words">
              <span className="font-bold">What to do: </span>
              {advice.text}
              {advice.link === "accounts" && (
                <>
                  {" "}
                  <Link href="/connections" className="font-bold underline">
                    Open Accounts
                  </Link>
                </>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {can && !t.retry_at && retryHere && (
              <button type="button" className="btn btn-primary btn-sm" disabled={d.busy !== null} onClick={() => d.onRetry({ id: v.id, group_id: null })} aria-label={`Retry ${platformName(v.platform)}`}>
                <Icon name="repeat" className="size-4" />
                {v.targets.filter((x) => canRetry(x, v)).length > 1 ? "Retry failed accounts" : "Retry"}
              </button>
            )}
            <Link href={`/posts/new?from=${postRef(v)}`} className="btn btn-secondary btn-sm">
              <Icon name="copy" className="size-4" />
              Duplicate
            </Link>
          </div>
        </div>
      )}
      {t.status === "published" && <TargetStats platform={v.platform} metrics={t.metrics} />}
      {t.alt_error && (
        <span className="text-ink-soft" data-alt-error>
          Alt text: {t.alt_error} The post went out without it.
        </span>
      )}
      {t.cover_error && (
        <span className="text-ink-soft" data-cover-error>
          Cover image: {t.cover_error} It is not tried again: set the cover on the platform yourself.
        </span>
      )}
      {v.first_comment && (
        <span className="text-ink-soft" data-comment-status={t.comment_status ?? "none"}>
          First comment: {commentStatus(t)}
        </span>
      )}
      {v.thread.length > 0 && (
        <span className="text-ink-soft">
          Thread: {(t.parts ?? []).length} of {v.thread.length} follow-up posts out.
          {(t.parts ?? []).map((p, i) =>
            p.remote_url ? (
              <a key={p.remote_id} href={p.remote_url} target="_blank" rel="noopener noreferrer" className="ml-2 font-bold underline" aria-label={`Post ${i + 2} on ${who}`}>
                Post {i + 2}
              </a>
            ) : null,
          )}
        </span>
      )}
    </li>
  );
}

// Where a target's first comment stands. A failed one is never retried, so it says what to do instead.
function commentStatus(t: Target): string {
  if (t.comment_status === "posted") return "posted.";
  if (t.comment_status === "posting") return "being posted.";
  if (t.comment_status === "failed") return `not posted. ${t.comment_error ?? ""} It is not tried again: add the comment on the platform yourself.`.replace(/\s+/g, " ");
  return t.status === "published" ? "not sent." : t.status === "failed" || t.status === "deleted" ? "not posted." : "waits for the post.";
}

// The follow-up posts of a thread, each with its text and media.
function Thread({ v }: { v: Post }) {
  return (
    <div className="grid gap-3">
      <h4 className="font-bold">Thread, {v.thread.length} follow-up {v.thread.length === 1 ? "post" : "posts"}</h4>
      <ol className="grid gap-3">
        {v.thread.map((p: ThreadPart, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-[var(--line)] p-3 text-sm">
            <p className="font-bold">Post {i + 2}</p>
            {p.body.trim() && <p className="whitespace-pre-wrap break-words">{p.body}</p>}
            {p.media.length > 0 && <Gallery title={`Media of post ${i + 2}`} media={p.media} alt={p.media_alt ?? []} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

// The images and videos with their alt text. An image that cannot be shown here (a Drive link, a link that has gone)
// falls back to its file name; the link always opens the original.
function Gallery({ title, media, alt }: { title: string; media: string[]; alt: string[] }) {
  return (
    <div className="grid gap-2">
      <h4 className="font-bold">{title}</h4>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {media.map((m, i) => (
          <li key={`${m}-${i}`} className="grid content-start gap-1.5">
            <Tile url={m} alt={alt[i]?.trim() ?? ""} />
            {isImageLink(m) &&
              (alt[i]?.trim() ? (
                <p className="flex items-start gap-1.5 text-xs">
                  <span className="mt-0.5 rounded bg-ink/70 px-1 text-[0.65rem] font-bold text-paper">ALT</span>
                  <span className="min-w-0 break-words">{alt[i]}</span>
                </p>
              ) : (
                <p className="text-xs text-ink-soft">No alt text</p>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({ url, alt }: { url: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  const image = isImageLink(url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group relative grid aspect-square place-items-center overflow-hidden rounded-lg bg-ink/[0.06] text-center text-xs text-ink-soft" aria-label={`Open ${fileName(url)} in a new tab`}>
      {image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- links of any host; the CSP allows https images on team pages
        <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-full object-cover" />
      ) : (
        <span className="grid justify-items-center gap-1 p-2">
          <Icon name={image ? "image" : "monitor"} className="size-6" />
          <span className="max-w-full truncate">{fileName(url)}</span>
          {!image && <span>Video or file</span>}
        </span>
      )}
    </a>
  );
}

// What the post was set to on networks that take settings: TikTok's visibility, YouTube's, a pin's board, a cover.
function Settings({ v }: { v: Post }) {
  const rows: [string, ReactNode][] = [];
  if (v.tiktok) {
    const t = v.tiktok;
    rows.push([
      "TikTok settings",
      <>
        Visible to: {privacyName[t.privacy_level ?? ""] ?? "not chosen"}. Allowed: {[t.allow_comment && "comments", t.allow_duet && "duets", t.allow_stitch && "stitches"].filter(Boolean).join(", ") || "no interactions"}.
        {t.commercial_content ? ` Disclosed as ${t.branded_content ? "a paid partnership" : "promotional content"}.` : ""}
        {t.ai_generated ? " Marked as AI-generated." : ""}
      </>,
    ]);
  }
  if (v.platform === "youtube") rows.push(["YouTube visibility", youtubePrivacyName[v.youtube?.privacy ?? "private"]]);
  if (v.platform === "pinterest")
    rows.push([
      "Pinterest settings",
      <>
        {v.pinterest?.board_id ? `Board ${v.pinterest.board_id}` : "The account's default board"}.{v.pinterest?.title ? ` Title: ${v.pinterest.title}.` : ""}
        {v.pinterest?.link ? ` Link: ${v.pinterest.link}` : ""}
      </>,
    ]);
  if (v.cover) rows.push(["Cover image", <span key="c" className="break-all">{v.cover}</span>]);
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map(([k, val]) => (
        <section key={k} aria-labelledby={`${v.id}-${k.replaceAll(" ", "-")}`} className="grid gap-0.5">
          <h4 id={`${v.id}-${k.replaceAll(" ", "-")}`} className="font-bold">
            {k}
          </h4>
          <p className="text-sm">{val}</p>
        </section>
      ))}
    </>
  );
}

// What a draft or scheduled post says about itself above its form: status, number, when it goes out (in the set's zone),
// the set, who made it and what it repeats as.
export function PostSummary({ post, zone, setName, author, repeat }: { post: Post; zone: string; setName?: string; author?: string; repeat?: string }) {
  return (
    <div className="grid gap-1.5" aria-label="About this post" role="group">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <OverallBadge overall={post.status} />
        <span className="text-sm text-ink-soft">Post {postRef(post)}</span>
        <p className="font-bold">{post.scheduled_at ? `${post.status === "scheduled" ? "Scheduled for" : "Planned for"} ${at(post.scheduled_at, zone)}.` : "Not scheduled."}</p>
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        {repeat && <li>{repeat}.</li>}
        {setName && (
          <li className="flex items-center gap-1.5">
            <Icon name="sets" className="size-4" />
            <span className="sr-only">Set: </span>
            {setName}
          </li>
        )}
        {author && (
          <li className="flex items-center gap-1.5">
            <Icon name="user" className="size-4" />
            <span className="sr-only">Author: </span>
            {author}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <Icon name="clock" className="size-4" />
          <span className="sr-only">Time zone: </span>
          {zone.replaceAll("_", " ")}
        </li>
      </ul>
    </div>
  );
}
