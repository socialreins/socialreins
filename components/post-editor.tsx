"use client";

import { PostPagePanel } from "@/components/post-page-panel";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { TeamLink as Link } from "@/components/team-link";
import { useTeamPath, useTeamRouter as useRouter } from "@/components/team-link";
import type { Failure } from "@/lib/auth";
import { listConnections, needingReconnect, xLongPosts, type Connection } from "@/lib/connections";
import {
  charCount,
  checkComment,
  checkCover,
  checkMediaTypes,
  coverTypeHint,
  mediaTypes,
  sizeHint,
  coverTypes,
  approvalState,
  charLimit,
  checkThread,
  checkTikTok,
  createPost,
  createPostGroup,
  decidePost,
  deletePost,
  fromLocalInput,
  getPost,
  getTikTokCreator,
  limits,
  listPosts,
  MAX_PARTS,
  mergeCreators,
  noTikTok,
  overLimit,
  privacyName,
  publishing,
  publishPost,
  noRepeat,
  repeatForm,
  repeatRule,
  repeatSummary,
  saveRepeat,
  type RepeatForm,
  takeDownAll,
  toLocalInput,
  updatePost,
  utf8Bytes,
  YOUTUBE_DESCRIPTION_BYTES,
  youtubeText,
  type Platform,
  type Post,
  type PostGroupInput,
  type PostInput,
  type Takedown,
  type Target,
  type ThreadPart,
  type TikTokCreator,
  type TikTokSettings,
  type YouTubePrivacy,
  youtubePrivacyName,
} from "@/lib/posts";
import { fitsList, listLists, partLabel, type PostList } from "@/lib/lists";
import { listSets, type SocialSet } from "@/lib/sets";
import { getQueue, type Queue } from "@/lib/queue";
import { accountName, Avatar } from "@/components/connections";
import { platformName } from "@/components/platform-icons";
import { AccountNote, ApprovalBadge, ChangesDialog, PlatformMark, postMessages, snippet, StatusBadge, statusName } from "@/components/posts";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { RefreshStats, TargetStats } from "@/components/post-analytics";
import { hasStats } from "@/lib/analytics";
import { useCurrentSet, useSession } from "@/components/app-shell";
import { ReconnectNotice } from "@/components/connections";
import { TikTokConsent, TikTokPanel } from "@/components/tiktok-settings";
import { manages } from "@/lib/teams";
import { Icon } from "@/components/ui";
import { RepeatControl } from "@/components/repeat";
import { LibraryPicker, SaveToLibrary, SnippetMenu } from "@/components/library";

const POLL_MS = 2000;
const POLL_FOR_MS = 60_000;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const canEdit = (p: Post) => p.status === "draft" || p.status === "scheduled";
// Where the editor's tab strip stands: the shared post, or one platform's own version and settings.
type Tab = "all" | Platform;
// A problem the editor sees before saving, and where to fix it: `tab` and `field` (an element id). `inline`
// problems also show beside their field; the rest already have their own message there (a count, a TikTok alert).
type Issue = { platform: Platform; text: ReactNode; tab: Tab; field: string; inline: boolean };
const names = (list: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(list.map(platformName));

// What a check failure means for one platform, naming its own limit.
function platformProblem(platform: Platform, failure: Failure, xLong = false): ReactNode {
  const name = platformName(platform);
  if (failure === "too_long" && platform === "youtube")
    return `YouTube takes a title (the first line) of at most ${limits.youtube.chars} characters and a description (the rest) of at most ${YOUTUBE_DESCRIPTION_BYTES.toLocaleString("en")} bytes.`;
  if (failure === "too_long" && platform === "x") return `X takes at most ${charLimit("x", xLong).toLocaleString("en")} characters, where a link counts as 23 and an emoji or a Chinese, Japanese or Korean character as 2.`;
  if (failure === "too_many_images" && platform === "tiktok") return "TikTok takes one video, or up to 35 photos.";
  if (failure === "too_long") return `${name} takes at most ${limits[platform].chars.toLocaleString("en")} characters.`;
  if (failure === "too_many_images" && platform === "x") return "X takes at most 4 images, or one GIF or video.";
  if (failure === "too_many_images") return platform === "youtube" ? "YouTube takes exactly one video." : `${name} takes at most ${limits[platform].media} images.`;
  if (failure === "media_required") return platform === "youtube" ? "YouTube needs one MP4 or MOV video: add its link." : platform === "tiktok" ? "TikTok needs one MP4 or MOV video, or JPEG, PNG or WebP photos: add their links." : `${name} needs at least one image or video.`;
  if (failure === "thread_not_supported") return `${name} can't post threads.`;
  if (failure === "first_comment_not_supported") return `${name} can't post a first comment.`;
  if (failure === "cover_not_supported") return `${name} can't take a cover image.`;
  if (failure === "tiktok_privacy_required") return "Choose who can view the TikTok post.";
  if (failure === "media_type_not_supported") return `${name} takes ${mediaTypes[platform].text}.`;
  if (failure === "mixed_media")
    return platform === "linkedin" ? "LinkedIn takes one video or one PDF on its own, or images." : platform === "x" ? "X takes up to 4 images, or one GIF, or one video, not a mix." : platform === "tiktok" ? "TikTok takes one MP4 or MOV video, or photos, not both." : `${name} takes a video on its own, not with other media.`;
  if (failure === "invalid_cover_type") return `${name} takes ${coverTypes[platform] ?? "a JPEG or PNG"} cover image.`;
  if (failure === "first_comment_too_long") return `${name} takes a first comment of at most ${(limits[platform].comment ?? 0).toLocaleString("en")} characters.`;
  return postMessages[failure] ?? failure;
}

// `id` opens a saved post; `from` starts a new one as a copy of that post (Duplicate).
export function PostEditor({ id, from }: { id?: string; from?: string }) {
  const { user } = useSession();
  const router = useRouter();
  const to = useTeamPath();
  const [post, setPost] = useState<Post | Failure | null>(null);
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [setId, setSetId] = useState("");
  // Read once: the set picked in the top bar when the editor opened.
  const startSet = useRef(useCurrentSet()[0]);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [thread, setThread] = useState<ThreadPart[]>([]);
  // The first comment, and per-platform text that replaces it on that platform.
  const [comment, setComment] = useState("");
  const [commentCustom, setCommentCustom] = useState<Partial<Record<Platform, string>>>({});
  // The cover image link of the post's one video.
  const [cover, setCover] = useState("");
  // The TikTok settings, and the creator info of the set's TikTok accounts (read live, keyed by what was asked).
  const [tiktok, setTikTok] = useState<TikTokSettings>(noTikTok);
  const [creatorRead, setCreatorRead] = useState<{ key: string; value: TikTokCreator | Failure } | null>(null);
  const [creatorTry, setCreatorTry] = useState(0);
  // The picked set's queue, for Add to queue on a new post (keyed by the set it was read for).
  const [queueRead, setQueueRead] = useState<{ key: string; value: Queue | Failure } | null>(null);
  // The YouTube video's visibility: private unless chosen.
  const [ytPrivacy, setYtPrivacy] = useState<YouTubePrivacy>("private");
  // The open tab, and whether the action bar lists the issues.
  const [tab, setTab] = useState<Tab>("all");
  const [issuesOpen, setIssuesOpen] = useState(false);
  // On phones the Publish at row hides behind a Schedule button until asked for.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // The platforms ticked for a new post; null means every platform with an account in the set.
  const [chosen, setChosen] = useState<Platform[] | null>(null);
  // Per-platform text that replaces the main post on that platform.
  const [custom, setCustom] = useState<Partial<Record<Platform, string>>>({});
  // A platform's own files in place of the shared ones; an empty list posts it without any.
  const [mediaCustom, setMediaCustom] = useState<Partial<Record<Platform, string[]>>>({});
  // Every post of this post's group, this one included; empty for a single post.
  const [group, setGroup] = useState<Post[]>([]);
  // The form holds every version of the group that can still change, not only this page's post.
  const [whole, setWhole] = useState(false);
  // Group posts still to publish after Publish now stopped partway, in order.
  const [unsent, setUnsent] = useState<string[]>([]);
  const [at, setAt] = useState("");
  // The Repeat control: what a new post is scheduled with, or a saved scheduled post's rule.
  const [repeat, setRepeat] = useState<RepeatForm>(noRepeat);
  const [lists, setLists] = useState<PostList[]>([]);
  const [listId, setListId] = useState("");
  const [local, setLocal] = useState<ReactNode>(null);
  const [confirming, setConfirming] = useState(false);
  const [pollNote, setPollNote] = useState("");
  // Take down all: the one confirmation, and what happened to each post (kept across a retry).
  const [askingAll, setAskingAll] = useState(false);
  const [downs, setDowns] = useState<(Takedown & { platform: Platform })[] | null>(null);
  const [downsShown, setDownsShown] = useState(0);
  // Bumped after Publish now, to move focus onto the status line that follows the post.
  const [sent, setSent] = useState(0);
  // The post a duplicate was copied from, for the note above the form.
  const [copied, setCopied] = useState<Post | Failure | null>(null);
  // The "Request changes" dialog is open.
  const [rejecting, setRejecting] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const addPartRef = useRef<HTMLButtonElement>(null);
  const partRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const { busy, problem, done, run } = useAction();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const askAllRef = useRef<HTMLButtonElement>(null);
  const confirmAllRef = useRef<HTMLButtonElement>(null);
  const downsRef = useRef<HTMLDivElement>(null);

  function load(p: Post) {
    setPost(p);
    setSetId(p.social_set_id);
    setBody(p.body);
    setMedia(p.media);
    setThread(p.thread ?? []);
    setComment(p.first_comment ?? "");
    setCommentCustom({});
    setCover(p.cover ?? "");
    setTikTok(p.tiktok ?? noTikTok);
    setYtPrivacy(p.youtube?.privacy ?? "private");
    setCustom({});
    setMediaCustom({});
    setAt(toLocalInput(p.status === "scheduled" ? p.scheduled_at : null));
    setRepeat(repeatForm(p.repeat));
    setListId("");
    setWhole(false);
  }

  // Fills the form with every version in `all`: this page's post is the shared one, and a version that
  // differs from it gets its own text, media or first comment.
  function loadTogether(mine: Post, all: Post[]) {
    load(mine);
    fillGroup(mine, all);
    setWhole(true);
  }

  // The group's per-platform text, media, comment, thread, cover and settings, `mine` being the shared one.
  function fillGroup(mine: Post, all: Post[]) {
    const rest = all.filter((g) => g.id !== mine.id);
    setCustom(Object.fromEntries(rest.filter((g) => g.body !== mine.body).map((g) => [g.platform, g.body])));
    setMediaCustom(Object.fromEntries(rest.filter((g) => !same(g.media, mine.media)).map((g) => [g.platform, g.media])));
    const commented = all.filter((g) => limits[g.platform].comment !== null);
    const base = commented[0]?.first_comment ?? "";
    setComment(base);
    setCommentCustom(Object.fromEntries(commented.filter((g) => (g.first_comment ?? "") !== base).map((g) => [g.platform, g.first_comment ?? ""])));
    setThread(all.find((g) => limits[g.platform].thread)?.thread ?? []);
    setCover(all.find((g) => g.cover)?.cover ?? "");
    const tk = all.find((g) => g.platform === "tiktok");
    if (tk) setTikTok(tk.tiktok ?? noTikTok);
    const yt = all.find((g) => g.platform === "youtube");
    if (yt) setYtPrivacy(yt.youtube?.privacy ?? "private");
  }

  // Duplicate: a new post with the content and platforms of `mine` and its group, but no time, and TikTok's
  // privacy left unset, since TikTok has it chosen anew for every post.
  function copy(mine: Post, all: Post[]) {
    load(mine);
    fillGroup(mine, all);
    setPost(null);
    setAt("");
    // A copy goes out once unless asked to repeat again.
    setRepeat(noRepeat);
    setChosen(all.map((g) => g.platform));
    setTikTok((t) => ({ ...t, privacy_level: null }));
    setCopied(mine);
  }

  useEffect(() => {
    listSets().then((r) => {
      setSets(r);
      // A new post starts in the set picked in the top bar.
      if (Array.isArray(r) && r[0]) setSetId((v) => v || (r.some((s) => s.id === startSet.current) ? startSet.current : (r.find((s) => s.is_default) ?? r[0]!).id));
    });
    listConnections().then((r) => {
      if (Array.isArray(r)) setAccounts(r);
      setAccountsLoaded(true);
    });
    listLists().then((r) => Array.isArray(r) && setLists(r));
    if (id)
      getPost(id).then((r) => {
        if (isFailure(r)) return setPost(r);
        load(r);
        if (r.group_id) listPosts({ group_id: r.group_id }).then((g) => Array.isArray(g) && setGroup(g));
      });
    else if (from)
      getPost(from).then(async (r) => {
        if (isFailure(r)) return setCopied(r);
        const g = r.group_id ? await listPosts({ group_id: r.group_id }) : null;
        // A group that can't be read still copies the post itself.
        copy(r, Array.isArray(g) && g.some((v) => v.id === r.id) ? [r, ...g.filter((v) => v.id !== r.id)] : [r]);
      });
    // copy only calls state setters, so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, from]);

  const postId = post && !isFailure(post) ? post.id : undefined;
  const status = post && !isFailure(post) ? post.status : undefined;
  // TikTok's guidelines have the editor show the account's live creator info while a TikTok post is edited.
  // X takes 25,000 characters when every X account of the picked set is on a paid plan, else 280.
  const xLong = xLongPosts(accounts, setId);
  const ttIds = accounts.filter((a) => a.provider === "tiktok" && a.set_ids.includes(setId)).map((a) => a.id).join(",");
  const ttPlatform = post && !isFailure(post) ? post.platform === "tiktok" || (whole && group.some((g) => g.platform === "tiktok")) : chosen === null || chosen.includes("tiktok");
  const ttEditable = !status || status === "draft" || status === "scheduled";
  const ttKey = ttIds && ttPlatform && ttEditable ? `${ttIds}:${creatorTry}` : "";
  const groupId = post && !isFailure(post) ? post.group_id : null;
  const pending = status === "queued" || group.some((g) => g.status === "queued");

  // After Publish now brain answers "queued"; ask again every 2s, for up to a minute.
  useEffect(() => {
    if (!pending || !postId) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_FOR_MS) {
        clearInterval(timer);
        setPollNote("Still publishing. Reload in a minute to see how it went.");
        return;
      }
      if (!groupId) {
        const r = await getPost(postId);
        if (!isFailure(r)) setPost(r);
        return;
      }
      const g = await listPosts({ group_id: groupId });
      if (isFailure(g)) return;
      setGroup(g);
      const mine = g.find((p) => p.id === postId);
      if (mine) setPost(mine);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, postId, groupId]);

  useEffect(() => {
    if (!ttKey) return;
    let live = true;
    Promise.all(ttKey.split(":")[0]!.split(",").map(getTikTokCreator)).then((rs) => {
      if (live) setCreatorRead({ key: ttKey, value: rs.find(isFailure) ?? mergeCreators(rs as TikTokCreator[]) });
    });
    return () => {
      live = false;
    };
  }, [ttKey]);

  const queueKey = !id && !postId ? setId : "";
  useEffect(() => {
    if (!queueKey) return;
    let live = true;
    getQueue(queueKey).then((value) => live && setQueueRead({ key: queueKey, value }));
    return () => {
      live = false;
    };
  }, [queueKey]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (askingAll) confirmAllRef.current?.focus();
  }, [askingAll]);

  useEffect(() => {
    if (downsShown) downsRef.current?.focus();
  }, [downsShown]);

  useEffect(() => {
    if (sent) statusRef.current?.focus();
  }, [sent]);

  if (id && post === null) return <p className="text-ink-soft">Loading the post...</p>;
  if (isFailure(post))
    return (
      <p role="alert" className="waitlist-error">
        The post couldn&apos;t be loaded. {problemText(post, postMessages)}
      </p>
    );

  async function save(mode: "draft" | "schedule" | "publish" | "queue") {
    flushSync(() => setLocal(null));
    if (selected.length === 0) return setLocal("Pick at least one platform to post to.");
    for (const p of selected) {
      const e = entry(p);
      const invalid = checkThread(e.body, e.media, e.thread, p, xLong);
      if (invalid) return setLocal(<>{invalid.part ? `Post ${invalid.part + 1} of the thread: ` : ""}{platformProblem(p, invalid.failure, xLong)}</>);
      const bad = checkComment(commentText(p), p) ?? checkCover(coverFor(p) ?? "", p, mediaFor(p).length);
      if (bad) return setLocal(platformProblem(p, bad));
    }
    if (selected.includes("tiktok")) {
      const problem = tiktokProblem();
      if (problem) return setLocal(problem);
    }
    if (mode === "schedule" && !at) return setLocal("Pick a date and time to schedule the post.");
    const shared = {
      social_set_id: setId,
      // brain picks the time for a queued post and refuses one sent with scheduled_at.
      ...(mode === "queue" ? { queue: true as const } : { scheduled_at: mode === "schedule" ? fromLocalInput(at) : null }),
      list_id: listChoices.some((l) => l.id === listId) ? listId : undefined,
    };
    const input: PostInput = { ...shared, platform: selected[0]!, ...entry(selected[0]!) };
    // Customized text, and an empty thread where the platform can't post one, so brain takes the rest.
    // The same for the first comment: "" where the platform can't post one, its own text where customized.
    const overrides: NonNullable<PostGroupInput["overrides"]> = {};
    for (const p of selected) {
      const o = {
        body: customFor(p),
        media: mediaCustomFor(p) && mediaFor(p),
        thread: limits[p].thread || parts.length === 0 ? undefined : [],
        first_comment: limits[p].comment === null ? (comment.trim() ? "" : undefined) : commentCustomFor(p),
        // The cover goes only to the platforms that take one, so none needs an empty override.
        cover: coverFor(p),
      };
      if (o.body !== undefined || o.media || o.thread || o.first_comment !== undefined || o.cover !== undefined) overrides[p] = o;
    }
    let made = 1;
    let all: Post[] | null = null;
    // A new post scheduled or queued with a repeat: one call on the first post covers its group. A refusal
    // leaves the post scheduled and is said beside the success.
    const rule = !postId && (mode === "schedule" || mode === "queue") && !hasTikTok ? repeatRule(repeat) : null;
    let unrepeated: Failure | null = null;
    const repeating = async (p: Post) => {
      if (!rule) return p;
      const r = await saveRepeat(p.id, rule);
      if (!isFailure(r) && r !== "ok") return r;
      unrepeated = isFailure(r) ? r : "error";
      return p;
    };
    await run(mode, async () => {
      if (together.length > 1) {
        // Each version is saved on its own; one that is refused is named and the rest wait for the next save.
        const saved: Post[] = [];
        for (const g of together) {
          const r = await updatePost(g.id, { ...shared, platform: g.platform, ...entry(g.platform) });
          setGroup((old) => old.map((x) => saved.find((v) => v.id === x.id) ?? x));
          if (isFailure(r)) {
            // The form keeps what was typed; this page's post is the saved one, so leaving the form shows it.
            const mine = saved.find((v) => v.id === postId);
            if (mine) setPost(mine);
            setLocal(<>{saved.length > 0 ? `Saved ${names(saved.map((v) => v.platform))}. ` : ""}{platformProblem(g.platform, r)} Fix it and save again, so every version is saved the same way.</>);
            return r;
          }
          saved.push(r);
        }
        setGroup((old) => old.map((x) => saved.find((v) => v.id === x.id) ?? x));
        all = saved;
        made = saved.length;
        if (mode !== "publish") return saved[0]!;
        const r = await publishAll(saved.map((v) => v.id));
        return isFailure(r) ? r : r[0]!;
      }
      if (postId || selected.length === 1) {
        const saved = postId ? await updatePost(postId, input) : await createPost(input);
        if (isFailure(saved)) return saved;
        // Keep this editor mounted on the new post's own address.
        if (!postId) window.history.replaceState(null, "", to(`/posts/${saved.id}`));
        load(saved);
        if (mode !== "publish") return repeating(saved);
        // Group posts a failed Publish now left behind go out with this one.
        const r = await publishAll([saved.id, ...unsent.filter((u) => u !== saved.id)]);
        return isFailure(r) ? r : r[0]!;
      }
      const g = await createPostGroup({ ...shared, platforms: selected, body, media: images, thread: parts, first_comment: comment.trim() ? comment : undefined, tiktok: selected.includes("tiktok") ? tiktokOut : undefined, youtube: selected.includes("youtube") ? { privacy: ytPrivacy } : undefined, overrides });
      if (isFailure(g)) return g;
      const posts = g.posts;
      made = posts.length;
      // The editor carries on as the first post; the others are listed below it.
      window.history.replaceState(null, "", to(`/posts/${posts[0]!.id}`));
      load(posts[0]!);
      setGroup(posts);
      if (mode !== "publish") return repeating(posts[0]!);
      const r = await publishAll(posts.map((p) => p.id));
      return isFailure(r) ? r : r[0]!;
    }, (p) => {
      if (all && mode !== "publish") loadTogether(p, all);
      else load(p);
      if (unrepeated) setLocal(<>The post is scheduled, but the repeat was not saved. {problemText(unrepeated, postMessages)}</>);
      // The status line says Publishing and updates itself; a separate message would go stale.
      if (mode === "publish") return void setSent((n) => n + 1);
      if (p.status === "scheduled" && mode === "queue") return `${made > 1 ? `Added ${made} posts, one per platform, to the queue for` : "Added to the queue for"} ${when(p.scheduled_at!)}.`;
      if (p.status === "scheduled") return `${made > 1 ? `Scheduled ${made} posts, one per platform, for` : "Scheduled for"} ${when(p.scheduled_at!)}.`;
      return made > 1 ? `Saved ${made} drafts, one per platform.` : "Draft saved.";
    });
  }

  // Publishes `ids` in order. On a failure the rest stay in `unsent`, so a retry carries on from there.
  async function publishAll(ids: string[]): Promise<Post[] | Failure> {
    const queued: Post[] = [];
    for (const [i, id] of ids.entries()) {
      const r = await publishPost(id);
      if (isFailure(r)) {
        setUnsent(ids.slice(i));
        return r;
      }
      queued.push(r);
      setGroup((g) => g.map((x) => (x.id === r.id ? r : x)));
    }
    setUnsent([]);
    return queued;
  }

  // Approves this post, or asks for changes, with the rest of its group. The form keeps what was typed.
  async function decide(what: "approve" | "reject", note = "") {
    if (!post || isFailure(post)) return;
    await run(what, () => decidePost(post, what, note), (out) => {
      const mine = out.find((p) => p.id === post.id);
      if (mine) setPost(mine);
      setGroup((g) => g.map((x) => out.find((o) => o.id === x.id) ?? x));
      const on = out.length > 1 ? ` on ${out.length} networks` : "";
      return what === "approve" ? `Approved${on}. It goes out at its scheduled time.` : `Asked for changes${on}. It stays unpublished until then.`;
    });
  }

  // A saved scheduled post: each change of the Repeat control is saved at once; a refusal puts the control back.
  async function changeRepeat(f: RepeatForm) {
    if (!post || isFailure(post)) return;
    flushSync(() => setLocal(null));
    const rule = repeatRule(f);
    // Leaving a box unchanged saves nothing.
    if (same(rule, post.repeat ?? null)) return;
    const ok = await run("repeat", () => saveRepeat(post.id, rule), (r) => {
      const p = r === "ok" ? { ...post, repeat: null } : r;
      setPost(p);
      setRepeat(repeatForm(p.repeat));
      return p.repeat ? `${repeatSummary(p.repeat)}.` : "This post no longer repeats.";
    });
    if (!ok) setRepeat(repeatForm(post.repeat));
  }

  async function publishRest() {
    await run("publish", () => publishAll(unsent), (queued) => {
      const mine = queued.find((p) => p.id === postId);
      if (mine) load(mine);
      setSent((n) => n + 1);
    });
  }

  async function remove() {
    flushSync(() => setLocal(null));
    let takedown: string | null = null;
    const ok = await run(status === "published" ? "takedown" : "delete", async () => {
      const r = await deletePost(postId!);
      if (typeof r === "object" && "takedownFailed" in r) {
        takedown = r.takedownFailed;
        return "error" as const;
      }
      return r;
    }, (r) => {
      if (r === "ok") return;
      load(r);
      return `Taken down from ${platformName(r.platform)}.`;
    });
    flushSync(() => setConfirming(false));
    if (takedown !== null) {
      // brain's message says what to do, e.g. which account still has the post.
      flushSync(() => setLocal(takedown || postMessages.not_deletable));
      askRef.current?.focus();
    } else if (ok && status !== "published") router.push("/posts");
    else if (!ok) askRef.current?.focus();
  }

  // Takes `items` down one by one, then reads the group again so the list and this page show the result.
  async function takeDownGroup(items: { id: string; platform: Platform }[]) {
    flushSync(() => setAskingAll(false));
    await run("takedown-all", async () => {
      const r = await takeDownAll(items.map((i) => i.id));
      const g = await listPosts({ group_id: groupId! });
      if (Array.isArray(g)) {
        setGroup(g);
        const mine = g.find((p) => p.id === postId);
        if (mine) setPost(mine);
      }
      return r;
    }, (r) => {
      const platform = (id: string) => items.find((i) => i.id === id)!.platform;
      const fresh = r.map((t) => ({ ...t, platform: platform(t.id) }));
      setDowns((old) => (old ? old.map((o) => fresh.find((f) => f.id === o.id) ?? o) : fresh));
      setDownsShown((n) => n + 1);
    });
  }

  const inLists = post && !isFailure(post) ? post.lists : [];
  // Lists this set's post can join; one it is already in is left out, since sending it would move the post to the end.
  // With every version open, a list any of them is in is left out too.
  const listed = whole ? [...inLists, ...group.flatMap((g) => g.lists)] : inLists;
  const listChoices = lists.filter((l) => fitsList(l, setId) && !listed.some((x) => x.id === l.id));
  const editable = !status || status === "draft" || status === "scheduled";
  const mayReview = manages(user.current_team.role);
  // A member's post can't go out before an owner or admin approved it: brain answers approval_required.
  const needsApproval = !!user.current_team.require_approval && !mayReview && !(post && !isFailure(post) && post.approval === "approved");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const queue = queueRead?.key === queueKey && queueKey && !isFailure(queueRead.value) ? queueRead.value : null;
  // A queue that couldn't be read leaves the button on: brain answers queue_empty if need be.
  const queueEmpty = queue?.slots.length === 0;
  const queueNext = queue?.next[0];
  const setName = Array.isArray(sets) ? sets.find((s) => s.id === (post as Post | null)?.social_set_id)?.name : undefined;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const shownProblem = local ? null : problem;
  const inSet = (p: Platform) => accounts.filter((a) => a.provider === p && a.set_ids.includes(setId));
  // A saved post keeps its platform; a new one offers each platform with an account in the set.
  // The versions the form changes together, this page's post first; fewer than two means only this post.
  const open = whole && post ? [post, ...group.filter((g) => g.id !== post.id && canEdit(g))] : [];
  const together = open.length > 1 && canEdit(open[0]!) ? open : [];
  const available: Platform[] = together.length > 1 ? together.map((g) => g.platform) : post ? [post.platform] : publishing.filter((p) => inSet(p).length > 0);
  const selected = post ? available : (chosen ?? available).filter((p) => available.includes(p));
  // TikTok has a person confirm every post, so a post with a TikTok version can't repeat.
  const hasTikTok = selected.includes("tiktok") || group.some((g) => g.platform === "tiktok");
  const threadable = selected.filter((p) => limits[p].thread);
  const noThread = selected.filter((p) => !limits[p].thread);
  // Custom text counts only while its box shows: two or more platforms, this one ticked.
  const customFor = (p: Platform) => (selected.length > 1 && selected.includes(p) ? custom[p] : undefined);
  const mainPlatforms = selected.filter((p) => customFor(p) === undefined);
  const images = links(media);
  // Own files count only while their box shows: two or more platforms, this one ticked.
  const mediaCustomFor = (p: Platform) => (selected.length > 1 && selected.includes(p) ? mediaCustom[p] : undefined);
  const mediaFor = (p: Platform) => (mediaCustomFor(p) ? links(mediaCustomFor(p)!) : images);
  const mediaMain = selected.filter((p) => mediaCustomFor(p) === undefined);
  const parts = thread.map((p) => ({ ...p, media: links(p.media) }));
  // One platform's post: its own text if customized, and the thread only where it can post one.
  const entry = (p: Platform) => ({
    body: customFor(p) ?? body,
    media: mediaFor(p),
    thread: limits[p].thread ? parts : [],
    first_comment: commentText(p).trim() ? commentText(p) : undefined,
    cover: coverFor(p),
    tiktok: p === "tiktok" ? tiktokOut : undefined,
    youtube: p === "youtube" ? { privacy: ytPrivacy } : undefined,
  });
  // TikTok: the account's creator info (null while it loads), and the settings as sent. A photo post has no duet or
  // stitch, and an interaction the creator turned off in TikTok stays off.
  const creator = creatorRead?.key === ttKey && ttKey ? creatorRead.value : null;
  const tt = creator && !isFailure(creator) ? creator : null;
  const ttMedia = mediaFor("tiktok");
  const photosOnly = ttMedia.length > 0 && ttMedia.every((m) => /\.(jpe?g|png|gif|webp)([?#]|$)/i.test(m));
  const tiktokOut: TikTokSettings = {
    ...tiktok,
    privacy_level: tt?.privacy_level_options.includes(tiktok.privacy_level ?? "") ? tiktok.privacy_level : null,
    allow_comment: tiktok.allow_comment && !tt?.comment_disabled,
    allow_duet: tiktok.allow_duet && !photosOnly && !tt?.duet_disabled,
    allow_stitch: tiktok.allow_stitch && !photosOnly && !tt?.stitch_disabled,
    your_brand: tiktok.commercial_content && tiktok.your_brand,
    branded_content: tiktok.commercial_content && tiktok.branded_content,
  };
  // What stops a TikTok post from being saved: the account is not read or cannot post now, or TikTok's rules.
  function tiktokProblem(): ReactNode {
    if (creator === null) return "The TikTok account is still loading. Try again in a moment.";
    if (!tt) return `The TikTok account couldn't be read. ${problemText(creator as Failure, postMessages)}`;
    if (!tt.can_post) return `${tt.reason ?? "TikTok does not let this account post right now."} Try again later.`;
    const bad = checkTikTok(tiktokOut);
    return bad ? platformProblem("tiktok", bad) : null;
  }
  // The cover is offered while exactly one link is attached (a cover belongs to one video) that is not
  // plainly an image, and a ticked platform takes one. brain checks the file once it downloads it.
  const coverable = selected.filter((p) => limits[p].cover);
  const noCover = selected.filter((p) => !limits[p].cover);
  const oneVideo = (list: string[]) => list.length === 1 && !/\.(jpe?g|png|gif|webp)([?#]|$)/i.test(list[0]!);
  // A platform with its own media gets the cover only if that media is one video.
  const covered = coverable.filter((p) => oneVideo(mediaFor(p)));
  const noVideo = coverable.filter((p) => !covered.includes(p));
  const coverShown = covered.length > 0;
  const coverFor = (p: Platform) => (cover.trim() && limits[p].cover && oneVideo(mediaFor(p)) ? cover.trim() : undefined);
  // The first comment goes where the platform can post one; customized text counts only while its box shows.
  const commentable = selected.filter((p) => limits[p].comment !== null);
  const noComment = selected.filter((p) => limits[p].comment === null);
  const commentCustomFor = (p: Platform) => (commentable.length > 1 && commentable.includes(p) ? commentCustom[p] : undefined);
  const commentText = (p: Platform) => (limits[p].comment === null ? "" : (commentCustomFor(p) ?? comment));
  const commentMain = commentable.filter((p) => commentCustomFor(p) === undefined);
  // Shared images must fit every chosen platform.
  const cap = (list: Platform[]) => (list.length ? Math.min(...list.map((p) => limits[p].media)) : limits.bluesky.media);
  // Tabs show with two or more platforms; with one, its settings sit on the one form.
  const tabbed = selected.length > 1;
  const active: Tab = tabbed && tab !== "all" && selected.includes(tab) ? tab : "all";
  const place = (p: Platform, own: boolean, ownField: string, sharedField: string) => (own ? { tab: p, field: ownField } : { tab: "all" as const, field: sharedField });
  const mediaProblems: Issue[] = selected.flatMap((p) => {
    const files = mediaFor(p);
    const where = { platform: p, inline: true, ...place(p, mediaCustomFor(p) !== undefined, `media-${p}`, "media-shared") };
    if ((p === "instagram" || p === "youtube") && files.length === 0) return [{ ...where, text: platformProblem(p, "media_required") }];
    if (files.length > limits[p].media) return [{ ...where, text: platformProblem(p, "too_many_images") }];
    // Hints only: brain reads the files when the post is saved and has the last word.
    const bad = checkMediaTypes(files, p) ?? (coverFor(p) ? coverTypeHint(coverFor(p)!, p) : null);
    return bad ? [{ ...where, text: platformProblem(p, bad) }] : [];
  });
  // YouTube's title is the first line of its text, which brain refuses to leave out or to hold < or >.
  const ytBody = selected.includes("youtube") ? (customFor("youtube") ?? body) : null;
  const ytWhere = { platform: "youtube" as const, inline: true, ...place("youtube", customFor("youtube") !== undefined, "post-body-youtube", "post-body") };
  const textProblems: Issue[] =
    ytBody === null
      ? []
      : [
          ...(youtubeText(ytBody).title ? [] : [{ ...ytWhere, text: "YouTube needs a title: write it as the first line of the post." }]),
          ...(/[<>]/.test(ytBody) ? [{ ...ytWhere, text: platformProblem("youtube", "invalid_text") }] : []),
        ];
  const tooLong: Issue[] = selected.flatMap((p) =>
    overLimit(p, customFor(p) ?? body, xLong) ? [{ platform: p, inline: false, text: platformProblem(p, "too_long", xLong), ...place(p, customFor(p) !== undefined, `post-body-${p}`, "post-body") }] : [],
  );
  const commentLong: Issue[] = commentable.flatMap((p) =>
    commentOver(p, commentText(p)) ? [{ platform: p, inline: false, text: platformProblem(p, "first_comment_too_long"), ...place(p, commentCustomFor(p) !== undefined, `post-comment-${p}`, "post-comment") }] : [],
  );
  // TikTok's own blockers, once its account is read (tiktokProblem says the same on save).
  const ttBad = !selected.includes("tiktok") || creator === null ? null : !tt ? "The TikTok account couldn't be read." : !tt.can_post ? `${tt.reason ?? "TikTok does not let this account post right now."} Try again later.` : checkTikTok(tiktokOut) && platformProblem("tiktok", checkTikTok(tiktokOut)!);
  const ttIssues: Issue[] = ttBad ? [{ platform: "tiktok", inline: false, text: ttBad, tab: tabbed ? "tiktok" : "all", field: "tiktok-privacy" }] : [];
  const issues = [...textProblems, ...mediaProblems, ...tooLong, ...commentLong, ...ttIssues];
  const shown = active !== "all" ? active : selected[0];
  const others = group.filter((g) => g.id !== postId);
  // The group with this page's own post as it now stands, and the posts still up.
  const members = group.map((g) => (post && g.id === post.id ? post : g));
  const live = members.filter((g) => g.status === "published");
  const left = (downs ?? []).filter((d) => d.state === "failed" || d.state === "waiting");
  const downNames = (downs ?? []).filter((d) => d.state === "down").map((d) => d.platform);

  const preview = (
    <Preview
      posts={shown ? [{ body: entry(shown).body, media: entry(shown).media }, ...entry(shown).thread] : [{ body, media: images }]}
      platform={shown ?? "bluesky"}
      account={shown ? inSet(shown)[0] : undefined}
    />
  );

  // The versions that can still change fit one form when they are in one set, saved for the same time, and share
  // what the form has only one of: the thread and the cover.
  const changeable = members.filter(canEdit);
  const threaded = changeable.filter((g) => limits[g.platform].thread);
  const fits =
    !!post &&
    canEdit(post) &&
    changeable.length > 1 &&
    changeable.every((g) => g.status === post.status && g.scheduled_at === post.scheduled_at && g.social_set_id === post.social_set_id) &&
    threaded.every((g) => same(g.thread ?? [], threaded[0]!.thread ?? [])) &&
    new Set(changeable.filter((g) => limits[g.platform].cover && oneVideo(g.media)).map((g) => g.cover ?? "")).size <= 1;
  // Every version of a post made for several platforms, so the whole post is one click apart.
  const versions = others.length > 0 && (
    <nav aria-label="Versions of this post" className="grid gap-2">
      <p className="text-sm text-ink-soft">This post has {members.length} versions, one for each platform. Pick one to see or change it.</p>
      <ul className="flex flex-wrap gap-2">
        {members.map((g) => {
          const mark = (
            <>
              <PlatformMark platform={g.platform} className="size-4" named />
              <StatusBadge status={g.status} />
            </>
          );
          const box = "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold";
          return (
            <li key={g.id}>
              {/* The open version is not a link: following it would reload the page and drop unsaved changes. */}
              {g.id === postId ? (
                <span aria-current="page" className={`${box} border-ink`}>
                  {mark}
                </span>
              ) : (
                <Link href={`/posts/${g.id}`} className={`${box} border-ink/10 hover:bg-ink/5`}>
                  {mark}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {together.length > 1 ? (
        <button type="button" className="btn btn-secondary btn-sm justify-self-start" disabled={busy !== null} onClick={() => load(post!)}>
          Change only the {platformName(post!.platform)} version
        </button>
      ) : (
        fits && (
          <button type="button" className="btn btn-secondary btn-sm justify-self-start" disabled={busy !== null} onClick={() => loadTogether(post!, changeable)}>
            Change all {changeable.length} versions together
          </button>
        )
      )}
    </nav>
  );

  const siblings = others.length > 0 && (
    <section aria-labelledby="group-heading" className="grid gap-3">
      <h2 id="group-heading" className="font-display text-lg font-extrabold tracking-tight">
        Same post on other platforms
      </h2>
      <ul className="card divide-y divide-ink/10">
        {others.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <PlatformMark platform={g.platform} className="size-5" />
            <Link href={`/posts/${g.id}`} className="min-w-0 flex-1 font-bold hover:underline">
              {platformName(g.platform)} post
            </Link>
            <StatusBadge status={g.status} />
            {g.targets
              .filter((t) => t.remote_url && t.status === "published")
              .map((t) => (
                <a key={t.id} href={t.remote_url!} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                  View on {platformName(g.platform)}
                  <Icon name="external" className="size-4" />
                </a>
              ))}
          </li>
        ))}
      </ul>
      {live.length > 0 &&
        (askingAll ? (
          <div className="card grid gap-3 p-4">
            <p id="remove-all-q">
              Take {live.length === 1 ? "this post" : `these ${live.length} posts`} down from {names(live.map((g) => g.platform))}? {live.length === 1 ? "It stays" : "They stay"} here as taken down.
            </p>
            <div className="flex flex-wrap gap-2">
              <button ref={confirmAllRef} type="button" className="btn btn-primary btn-sm" aria-describedby="remove-all-q" disabled={busy !== null} onClick={() => takeDownGroup(live)}>
                Yes, take {live.length === 1 ? "it" : "them all"} down
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  flushSync(() => setAskingAll(false));
                  askAllRef.current?.focus();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button ref={askAllRef} type="button" className="btn btn-quiet btn-danger btn-sm justify-self-start" disabled={busy !== null} onClick={() => setAskingAll(true)}>
            <Icon name="trash" className="size-4" />
            {busy === "takedown-all" ? "Taking down..." : "Take down all"}
          </button>
        ))}
      {downs && (
        <div key={downsShown} ref={downsRef} tabIndex={-1} role={left.length ? "alert" : "status"} className="card grid gap-3 p-4">
          <p className="font-bold">
            {downNames.length > 0 && `Taken down from ${names(downNames)}. `}
            {left.length > 0 ? `Still to take down: ${names(left.map((d) => d.platform))}.` : downNames.length === 0 && "Those posts were already gone."}
          </p>
          <ul className="grid gap-1 text-sm">
            {downs.map((d) => (
              <li key={d.id}>
                <PlatformMark platform={d.platform} named />:{" "}
                {d.state === "down" ? "taken down" : d.state === "gone" ? "already gone" : d.state === "failed" ? (d.message || problemText(d.failure ?? "error", postMessages)) : "not tried yet"}
              </li>
            ))}
          </ul>
          {left.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {left.some((d) => d.state === "waiting") && <p className="min-w-0 flex-1">{postMessages.rate_limited}</p>}
              <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => takeDownGroup(left)}>
                {busy === "takedown-all" ? "Taking down..." : `Retry ${names(left.map((d) => d.platform))}`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );

  // TikTok gives apps no way to delete a post, so there is nothing to confirm: say where to do it.
  const noTakedown = status === "published" && post?.platform === "tiktok";
  const confirm = noTakedown ? (
    <p className="hint">TikTok does not let other apps delete a post. Delete it in the TikTok app.</p>
  ) : confirming ? (
    <div className="card grid gap-3 p-4">
      <p id="remove-q">
        {status === "published" ? `Take this post down from ${platformName(post!.platform)}? It stays here as taken down.` : "Delete this post? This can't be undone."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button ref={confirmRef} type="button" className="btn btn-primary btn-sm" aria-describedby="remove-q" disabled={busy !== null} onClick={remove}>
          {busy === "takedown" ? "Taking down..." : busy === "delete" ? "Deleting..." : status === "published" ? "Yes, take it down" : "Yes, delete"}
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy !== null}
          onClick={() => {
            flushSync(() => setConfirming(false));
            askRef.current?.focus();
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button ref={askRef} type="button" className="btn btn-quiet btn-danger btn-sm justify-self-start" disabled={busy !== null} onClick={() => setConfirming(true)}>
      <Icon name="trash" className="size-4" />
      {status === "published" ? "Take down" : "Delete"}
    </button>
  );

  const messages = (
    <>
      {local && (
        <p role="alert" className="waitlist-error">
          {local}
        </p>
      )}
      <Status problem={shownProblem} done={done} overrides={postMessages} />
      {unsent.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-0 flex-1">
            Not published yet on {names(unsent.map((u) => group.find((g) => g.id === u)?.platform ?? "").filter(Boolean))}.
            {editable ? " Publish now sends them too." : ""}
          </p>
          {!editable && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={publishRest}>
              <Icon name="send" className="size-4" />
              {busy === "publish" ? "Publishing..." : "Publish the rest"}
            </button>
          )}
        </div>
      )}
    </>
  );

  // A saved post, read-only or not, starts a new one with its content.
  const duplicate = postId && (
    <Link href={`/posts/new?from=${encodeURIComponent(postId)}`} className="btn btn-secondary btn-sm justify-self-start">
      <Icon name="copy" className="size-4" />
      Duplicate
    </Link>
  );

  if (!editable && post) {
    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
          {versions}
          <div className="card grid gap-2 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span aria-hidden="true" className="tone size-3 shrink-0 rounded-full bg-current" data-status={post.status} />
              <p ref={statusRef} tabIndex={-1} role="status" className="font-bold">
                {statusName[post.status]}
                {post.status === "published" && post.published_at ? ` on ${when(post.published_at)}` : ""}
                {post.status === "queued" ? ". This page updates by itself." : "."}
              </p>
            </div>
            <p className="text-sm text-ink-soft">
              {setName ? `Set: ${setName}. ` : ""}
              {post.scheduled_at ? `Planned for ${when(post.scheduled_at)}.` : ""}
            </p>
            {pollNote && <p className="text-ink-soft">{pollNote}</p>}
            {post.error && <p className="waitlist-error">What went wrong: {post.error}</p>}
          </div>
          {messages}
          {post.first_comment && (
            <section aria-labelledby="comment-heading" className="card grid gap-2 p-5">
              <h2 id="comment-heading" className="font-display text-lg font-extrabold tracking-tight">
                First comment
              </h2>
              <p className="whitespace-pre-wrap break-words text-sm">{post.first_comment}</p>
            </section>
          )}
          {post.tiktok && (
            <section aria-labelledby="tiktok-summary-heading" className="card grid gap-2 p-5">
              <h2 id="tiktok-summary-heading" className="font-display text-lg font-extrabold tracking-tight">
                TikTok settings
              </h2>
              <p className="text-sm">
                Visible to: {privacyName[post.tiktok.privacy_level ?? ""] ?? "not chosen"}. Allowed: {[post.tiktok.allow_comment && "comments", post.tiktok.allow_duet && "duets", post.tiktok.allow_stitch && "stitches"].filter(Boolean).join(", ") || "no interactions"}.
                {post.tiktok.commercial_content ? ` Disclosed as ${post.tiktok.branded_content ? "a paid partnership" : "promotional content"}.` : ""}
                {post.tiktok.ai_generated ? " Marked as AI-generated." : ""}
              </p>
            </section>
          )}
          {post.platform === "youtube" && (
            <section aria-labelledby="youtube-summary-heading" className="card grid gap-2 p-5">
              <h2 id="youtube-summary-heading" className="font-display text-lg font-extrabold tracking-tight">
                YouTube visibility
              </h2>
              <p className="text-sm">{youtubePrivacyName[post.youtube?.privacy ?? "private"]}</p>
            </section>
          )}
          {post.cover && (
            <section aria-labelledby="cover-heading" className="card grid gap-2 p-5">
              <h2 id="cover-heading" className="font-display text-lg font-extrabold tracking-tight">
                Cover image
              </h2>
              <p className="break-all text-sm">{post.cover}</p>
            </section>
          )}
          {post.targets.length > 0 && (
            <section aria-labelledby="targets-heading" className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="targets-heading" className="font-display text-lg font-extrabold tracking-tight">
                  Accounts
                </h2>
                {post.status === "published" && hasStats(post.platform) && <RefreshStats post={post} onPost={setPost} />}
              </div>
              <ul className="card divide-y divide-ink/10">
                {post.targets.map((t) => {
                  const a = t.social_account_id ? byId.get(t.social_account_id) : undefined;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                      {a && <Avatar connection={a} size="size-8" />}
                      <span className="min-w-0 flex-1">
                        <strong>{a ? accountName(a) : "A disconnected account"}</strong>: {t.status}
                        {t.error ? `. ${t.error}` : ""}
                      </span>
                      {t.remote_url && t.status === "published" && (
                        <a href={t.remote_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                          View on {platformName(post.platform)}
                          <Icon name="external" className="size-4" />
                        </a>
                      )}
                      {t.status === "published" && <TargetStats platform={post.platform} metrics={t.metrics} />}
                      {t.cover_error && (
                        <span className="basis-full text-ink-soft" data-cover-error>
                          Cover image: {t.cover_error} It is not tried again: set the cover on the platform yourself.
                        </span>
                      )}
                      {post.first_comment && (
                        <span className="basis-full text-ink-soft" data-comment-status={t.comment_status ?? "none"}>
                          First comment: {commentStatus(t)}
                        </span>
                      )}
                      {(post.thread ?? []).length > 0 && (
                        <span className="basis-full text-ink-soft">
                          Thread: {(t.parts ?? []).length} of {post.thread.length} follow-up posts out.
                          {(t.parts ?? []).map((p, i) =>
                            p.remote_url ? (
                              <a key={p.remote_id} href={p.remote_url} target="_blank" rel="noopener noreferrer" className="ml-2 font-bold underline" aria-label={`Post ${i + 2} on ${a ? accountName(a) : "a disconnected account"}`}>
                                Post {i + 2}
                              </a>
                            ) : null,
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {siblings}
          <PostPagePanel id={post.id} />
          {duplicate}
          {post.status === "published" && confirm}
        </div>
        {preview}
      </div>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const mode = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as "draft" | "schedule" | "publish" | "queue";
    save(mode || "draft");
  }

  // Ctrl or Cmd + S saves the draft (never the browser's Save dialog); Ctrl or Cmd + Enter in a text box schedules
  // when a time is set and otherwise moves to the Publish at field. A held key and a save on its way do nothing more.
  function onKeys(e: KeyboardEvent<HTMLFormElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key !== "s" && !(key === "enter" && e.target instanceof HTMLTextAreaElement)) return;
    e.preventDefault();
    if (e.repeat || busy !== null) return;
    if (key === "s") return void save("draft");
    if (at) return void save("schedule");
    flushSync(() => setScheduleOpen(true));
    document.getElementById("post-at")?.focus();
  }

  function addPart() {
    flushSync(() => setThread((list) => [...list, { body: "", media: [] }]));
    partRefs.current[thread.length]?.focus();
  }

  function removePart(i: number) {
    flushSync(() => setThread((list) => list.filter((_, j) => j !== i)));
    addPartRef.current?.focus();
  }

  function customize(p: Platform) {
    flushSync(() => setCustom((c) => ({ ...c, [p]: body })));
    document.getElementById(`post-body-${p}`)?.focus();
  }

  function customizeMedia(p: Platform) {
    flushSync(() => setMediaCustom((c) => ({ ...c, [p]: media })));
    document.getElementById(`media-${p}`)?.focus();
  }

  function uncustomizeMedia(p: Platform) {
    flushSync(() => setMediaCustom((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== p))));
    document.getElementById(`media-customize-${p}`)?.focus();
  }

  function customizeComment(p: Platform) {
    flushSync(() => setCommentCustom((c) => ({ ...c, [p]: comment })));
    document.getElementById(`post-comment-${p}`)?.focus();
  }

  function uncustomizeComment(p: Platform) {
    flushSync(() => setCommentCustom((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== p))));
    document.getElementById(`comment-customize-${p}`)?.focus();
  }

  function uncustomize(p: Platform) {
    flushSync(() => setCustom((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== p))));
    document.getElementById(`customize-${p}`)?.focus();
  }

  // Opens a tab and moves focus to it (or to `focus`), for the arrow keys and the notes that link to a tab.
  function openTab(to: Tab, focus = `tab-${to}`) {
    flushSync(() => setTab(to));
    document.getElementById(`tab-${to}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    document.getElementById(focus)?.focus();
  }

  // The ARIA tabs pattern: Left and Right move along the strip, Home and End go to its ends.
  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const keys: Tab[] = ["all", ...selected];
    const i = keys.indexOf(active);
    const j = e.key === "ArrowRight" ? (i + 1) % keys.length : e.key === "ArrowLeft" ? (i - 1 + keys.length) % keys.length : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    openTab(keys[j]!);
  }

  function goToIssue(i: Issue) {
    flushSync(() => {
      setTab(i.tab);
      setIssuesOpen(false);
    });
    (document.getElementById(i.field) ?? document.getElementById(`tab-${i.tab}`))?.focus();
  }

  const issueList = (list: Issue[]) =>
    list.length > 0 && (
      <ul className="grid gap-1">
        {list.map((m, i) => (
          <li key={i} className="waitlist-error">
            {m.text}
          </li>
        ))}
      </ul>
    );

  // On the All tab, a platform with its own text, media or first comment says so and links to its tab.
  const customized = tabbed
    ? selected.flatMap((p) => {
        const what = [customFor(p) !== undefined && "text", mediaCustomFor(p) !== undefined && "media", commentCustomFor(p) !== undefined && "first comment"].filter((w): w is string => !!w);
        return what.length ? [{ p, what }] : [];
      })
    : [];
  const ownRow = "flex flex-wrap items-center justify-between gap-x-3 gap-y-1";

  const shared = (
    <>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="post-body" className="label">
            Post
          </label>
          <SnippetMenu target="post-body" label="Post" value={body} onChange={setBody} />
        </div>
        <textarea
          id="post-body"
          rows={6}
          className="field resize-y"
          placeholder="What do you want to say?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={mainPlatforms.some((p) => overLimit(p, body, xLong)) || undefined}
          aria-describedby="post-count post-keys"
        />
        <Counts id="post-count" text={body} platforms={mainPlatforms} xLong={xLong} alerts />
        <p id="post-keys" className="hint text-xs max-sm:hidden">
          <kbd className="font-sans font-bold">Ctrl</kbd> or <kbd className="font-sans font-bold">Cmd</kbd> + <kbd className="font-sans font-bold">Enter</kbd> schedules, + <kbd className="font-sans font-bold">S</kbd> saves the draft.
        </p>
        {!tabbed && selected[0] === "youtube" && <YouTubeNote />}
        {customized.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {customized.map(({ p, what }) => (
              <li key={p}>
                <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-ink-soft ring-1 ring-[var(--line)] hover:bg-ink/5 hover:text-ink" onClick={() => openTab(p)}>
                  <Icon name="edit" className="size-3" />
                  Custom {new Intl.ListFormat("en", { type: "conjunction" }).format(what)} on {platformName(p)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ImageLinks media={media} max={cap(mediaMain)} platforms={mediaMain} onChange={setMedia} />
      {issueList(issues.filter((i) => i.inline && i.tab === "all"))}
      {coverShown && (
        <fieldset className="grid gap-2">
          <legend className="sr-only">Cover image</legend>
          <label className="grid gap-1 text-sm font-bold">
            <span>Cover image link</span>
            <input type="url" inputMode="url" placeholder="https://" className="field font-normal" value={cover} onChange={(e) => setCover(e.target.value)} aria-describedby="post-cover-note" />
          </label>
          <p id="post-cover-note" className="hint">
            Optional: an image for the video.
          </p>
          <details className="hint">
            <summary className="cursor-pointer select-none font-bold">Where the cover goes</summary>
            {covered.map((p) => `${platformName(p)} takes ${coverTypes[p]}`).join("; ")}.
            {covered.some((p) => p !== "instagram") && " Facebook and YouTube set it after the video is live (YouTube needs a verified channel); if that fails, the post stays up and says why."}
            {noCover.length > 0 && ` ${names(noCover)} can't take one${noCover.includes("tiktok") ? " (TikTok can only pick a frame of the video)" : ""}, so ${noCover.length > 1 ? "they get" : "it gets"} none.`}
            {noVideo.length > 0 && ` ${names(noVideo)} ${noVideo.length > 1 ? "have" : "has"} no single video here, so ${noVideo.length > 1 ? "they get" : "it gets"} none.`}
          </details>
        </fieldset>
      )}
      {commentable.length > 0 && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="post-comment" className="label">
              First comment
            </label>
            <SnippetMenu target="post-comment" label="First comment" value={comment} onChange={setComment} />
          </div>
          <textarea
            id="post-comment"
            rows={2}
            className="field resize-y"
            placeholder="Optional: sources, caveats, a link"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-invalid={commentMain.some((p) => commentOver(p, comment)) || undefined}
            aria-describedby="post-comment-note post-comment-count"
          />
          <CommentCounts id="post-comment-count" text={comment} platforms={commentMain} />
          <p id="post-comment-note" className="hint">
            Posted once, right after the post goes live.
            {noComment.length > 0 && ` ${names(noComment)} can't post one, so ${noComment.length > 1 ? "they get" : "it gets"} none.`}
          </p>
        </div>
      )}
      {threadable.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="label">Thread</legend>
          <p className="hint">
            Follow-up posts go out as replies.
            {noThread.length > 0 && ` ${names(noThread)} can't post threads, so ${noThread.length > 1 ? "they get" : "it gets"} only the first post.`}
          </p>
          {thread.length > 0 && (
            <ol className="grid gap-3">
              {thread.map((p, i) => {
                const over = threadable.some((x) => charCount(x, p.body) > charLimit(x, xLong));
                return (
                  <li key={i} className="grid gap-1 border-l-2 border-[var(--line)] pl-3">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`post-part-${i}`} className="text-sm font-bold">
                        Post {i + 2}
                      </label>
                      <button type="button" className="icon-btn" aria-label={`Remove post ${i + 2}`} onClick={() => removePart(i)}>
                        <Icon name="close" className="size-4" />
                      </button>
                    </div>
                    <textarea
                      id={`post-part-${i}`}
                      ref={(el) => {
                        partRefs.current[i] = el;
                      }}
                      rows={3}
                      className="field resize-y"
                      value={p.body}
                      onChange={(e) => setThread((list) => list.map((v, j) => (j === i ? { ...v, body: e.target.value } : v)))}
                      aria-invalid={over || undefined}
                      aria-describedby={`post-part-${i}-count`}
                    />
                    <Counts id={`post-part-${i}-count`} text={p.body} platforms={threadable} xLong={xLong} />
                    <ImageLinks media={p.media} max={cap(threadable)} post={i + 2} onChange={(m) => setThread((list) => list.map((v, j) => (j === i ? { ...v, media: m } : v)))} />
                  </li>
                );
              })}
            </ol>
          )}
          {thread.length < MAX_PARTS && (
            <button ref={addPartRef} type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={addPart}>
              <Icon name="plus" className="size-4" />
              Add to thread
            </button>
          )}
        </fieldset>
      )}
    </>
  );

  // A platform's own settings: on its tab, or on the one form when it is the only platform.
  const settings = (p: Platform) => (
    <>
      {p === "youtube" && (
        <div className="grid gap-1.5">
          <label htmlFor="youtube-privacy" className="label">
            YouTube visibility
          </label>
          <select id="youtube-privacy" className="field justify-self-start" value={ytPrivacy} onChange={(e) => setYtPrivacy(e.target.value as YouTubePrivacy)} aria-describedby="youtube-privacy-note">
            {(Object.keys(youtubePrivacyName) as YouTubePrivacy[]).map((v) => (
              <option key={v} value={v}>
                {youtubePrivacyName[v]}
              </option>
            ))}
          </select>
          <p id="youtube-privacy-note" className="hint">
            Until Google has audited the YouTube API project behind this server, YouTube keeps new uploads private.
          </p>
        </div>
      )}
      {p === "tiktok" && <TikTokPanel creator={creator} settings={tiktokOut} onChange={setTikTok} photosOnly={photosOnly} onRetry={() => setCreatorTry((n) => n + 1)} />}
    </>
  );

  // One platform's tab: its own text, media and first comment in place of the shared ones, and its settings.
  const own = (p: Platform) => {
    const name = platformName(p);
    return (
      <>
        {custom[p] === undefined ? (
          <div className="grid gap-1.5">
            <div className={ownRow}>
              <p className="hint">Text: the shared post.</p>
              <button id={`customize-${p}`} type="button" className="btn btn-secondary btn-sm" onClick={() => customize(p)}>
                <Icon name="edit" className="size-4" />
                Customize for {name}
              </button>
            </div>
            <Counts id={`post-count-${p}`} text={body} platforms={[p]} xLong={xLong} alerts />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`post-body-${p}`} className="label">
                {name} text
              </label>
              <span className="flex items-center gap-1">
                <SnippetMenu target={`post-body-${p}`} label={`${name} text`} value={custom[p]!} onChange={(v) => setCustom((c) => ({ ...c, [p]: v }))} />
                <button type="button" className="icon-btn" aria-label={`Use the main post on ${name}`} onClick={() => uncustomize(p)}>
                  <Icon name="close" className="size-4" />
                </button>
              </span>
            </div>
            <textarea
              id={`post-body-${p}`}
              rows={6}
              className="field resize-y"
              value={custom[p]}
              onChange={(e) => setCustom((c) => ({ ...c, [p]: e.target.value }))}
              aria-invalid={overLimit(p, custom[p]!, xLong) || undefined}
              aria-describedby={`post-body-${p}-count`}
            />
            <Counts id={`post-body-${p}-count`} text={custom[p]!} platforms={[p]} xLong={xLong} alerts />
          </div>
        )}
        {p === "youtube" && <YouTubeNote />}
        {mediaCustom[p] === undefined ? (
          <div className="grid gap-1">
            <div className={ownRow}>
              <p className="hint">Media: the shared {images.length === 1 ? "file" : `${images.length || "no"} files`}.</p>
              <button id={`media-customize-${p}`} type="button" className="btn btn-secondary btn-sm" onClick={() => customizeMedia(p)}>
                <Icon name="image" className="size-4" />
                Different media for {name}
              </button>
            </div>
            <p className="hint">{mediaRule(p)}</p>
          </div>
        ) : (
          <ImageLinks media={mediaCustom[p]!} max={limits[p].media} own={p} onChange={(m) => setMediaCustom((c) => ({ ...c, [p]: m }))} onClose={() => uncustomizeMedia(p)} />
        )}
        {issueList(issues.filter((i) => i.inline && i.platform === p))}
        {limits[p].comment === null ? (
          comment.trim() && <p className="hint">{name} can&apos;t post a first comment, so it gets none.</p>
        ) : commentable.length < 2 ? null : commentCustom[p] === undefined ? (
          <div className="grid gap-1.5">
            <div className={ownRow}>
              <p className="hint">First comment: the shared one.</p>
              <button id={`comment-customize-${p}`} type="button" className="btn btn-secondary btn-sm" onClick={() => customizeComment(p)}>
                <Icon name="edit" className="size-4" />
                Customize the first comment for {name}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`post-comment-${p}`} className="label">
                {name} first comment
              </label>
              <span className="flex items-center gap-1">
                <SnippetMenu target={`post-comment-${p}`} label={`${name} first comment`} value={commentCustom[p]!} onChange={(v) => setCommentCustom((c) => ({ ...c, [p]: v }))} />
                <button type="button" className="icon-btn" aria-label={`Use the main first comment on ${name}`} onClick={() => uncustomizeComment(p)}>
                  <Icon name="close" className="size-4" />
                </button>
              </span>
            </div>
            <textarea
              id={`post-comment-${p}`}
              rows={2}
              className="field resize-y"
              value={commentCustom[p]}
              onChange={(e) => setCommentCustom((c) => ({ ...c, [p]: e.target.value }))}
              aria-invalid={commentOver(p, commentCustom[p]!) || undefined}
              aria-describedby={`post-comment-${p}-count`}
            />
            <CommentCounts id={`post-comment-${p}-count`} text={commentCustom[p]!} platforms={[p]} />
          </div>
        )}
        {settings(p)}
      </>
    );
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <AccountNote />
        {versions}
        {copied && (
          <p role={isFailure(copied) ? "alert" : "status"} className={isFailure(copied) ? "waitlist-error" : "hint"}>
            {isFailure(copied) ? <>The post to copy couldn&apos;t be loaded. {problemText(copied, postMessages)}</> : <>Copied from {snippet(copied)}. Pick a time, and on TikTok who can see it, again.</>}
          </p>
        )}
        {status === "scheduled" && post && (
          <p className="flex flex-wrap items-center gap-3 font-bold">
            <StatusBadge status="scheduled" />
            Scheduled for {when(post.scheduled_at!)}.
            {post.repeat && <span className="font-normal text-ink-soft">{repeatSummary(post.repeat)}.</span>}
          </p>
        )}
        {post && approvalState(post) && (
          <section aria-label="Approval" className="card flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
            <ApprovalBadge post={post} />
            <p className="min-w-0 flex-1 basis-60">
              {approvalState(post) === "pending" ? (
                "Waiting for an owner or admin to approve. It is not published until then."
              ) : (
                <>
                  An owner or admin asked for changes{post.approval_note ? <>: <strong>{post.approval_note}</strong></> : "."} Edit the post and schedule it again to ask for approval.
                </>
              )}
            </p>
            {mayReview && approvalState(post) === "pending" && (
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => decide("approve")}>
                  {busy === "approve" ? "Approving..." : "Approve"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => setRejecting(true)}>
                  Request changes
                </button>
              </div>
            )}
          </section>
        )}
        {rejecting && post && (
          <ChangesDialog posts={[post, ...group.filter((g) => g.id !== post.id)]} onClose={() => setRejecting(false)} onSend={(_, note) => decide("reject", note)} />
        )}
        {/* Save draft is the first submit button, so Enter in a field saves rather than publishes. */}
        <form onSubmit={onSubmit} onKeyDown={onKeys} className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <div className="card grid gap-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <label htmlFor="post-set" className="label">
                  Set
                </label>
                <select
                  id="post-set"
                  className="field"
                  value={setId}
                  onChange={(e) => {
                    setSetId(e.target.value);
                    setChosen(null);
                  }}
                  required
                  aria-describedby="post-set-note"
                >
                  {Array.isArray(sets) &&
                    sets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <p id="post-set-note" className="hint">
                  {post && together.length < 2 ? `Goes to every ${platformName(post.platform)} account in this set.` : "One post per platform, to every account of it in this set."}
                </p>
              </div>
              <div className="grid content-start gap-1.5">
                <label htmlFor="post-list" className="label">
                  List
                </label>
                <select id="post-list" className="field" value={listChoices.some((l) => l.id === listId) ? listId : ""} onChange={(e) => setListId(e.target.value)} aria-describedby="post-list-note">
                  <option value="">No list</option>
                  {listChoices.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <p id="post-list-note" className="hint">
                  {inLists.length > 0 ? `Now ${inLists.map(partLabel).join(", ")}. ` : ""}A list you pick adds the post as its last part.
                </p>
              </div>
            </div>
            {!post && (
              <fieldset className="grid gap-2">
                <legend className="label mb-1.5">Post to</legend>
                {available.length === 0 && !accountsLoaded ? (
                  <p className="hint">Loading accounts...</p>
                ) : available.length === 0 ? (
                  <p className="hint">
                    No connected account is in this set. Add one on{" "}
                    <Link href="/connections" className="font-bold underline">
                      Connections
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {available.map((p) => {
                      const accs = inSet(p).map(accountName);
                      return (
                        <li key={p}>
                          <label
                            title={accs.join(", ")}
                            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ring-1 ring-[var(--line)] hover:ring-[var(--edge)] has-checked:bg-ink/[0.04] has-checked:ring-[var(--color-ink)]/40"
                          >
                            <input
                              type="checkbox"
                              className="size-3.5 accent-[var(--color-signal-deep)]"
                              checked={selected.includes(p)}
                              onChange={() => setChosen(publishing.filter((x) => (x === p ? !selected.includes(p) : selected.includes(x))))}
                              aria-describedby={`post-to-${p}`}
                            />
                            <PlatformMark platform={p} className="size-4" named />
                            <span aria-hidden="true" className="rounded bg-ink/[0.07] px-1 text-xs tabular-nums text-ink-soft">
                              {accs.length}
                            </span>
                          </label>
                          <span id={`post-to-${p}`} className="sr-only">
                            {accs.length} {accs.length === 1 ? "account" : "accounts"}: {accs.join(", ")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>
            )}
            <ReconnectNotice
              accounts={needingReconnect(selected.flatMap(inSet))}
              canManage={manages(user.current_team.role)}
              title="An account needs reconnecting"
              lead="Posts to these accounts fail while their sign-in has ended, and may fail soon if it ends within a week."
            />
          </div>
          <div className="card">
            {tabbed && (
              // The strip keeps its paper while the list inside fades at the edge it scrolls past.
              <div className="sticky top-[3.0625rem] z-[4] rounded-t-lg border-b border-[var(--line)] bg-paper p-2 md:top-12">
              <div role="tablist" aria-label="Post versions" onKeyDown={onTabKey} className="scroll-fade flex gap-1 overflow-x-auto">
                {(["all", ...selected] as Tab[]).map((k) => {
                  const bad = k === "all" ? 0 : issues.filter((i) => i.platform === k).length;
                  return (
                    <button
                      key={k}
                      id={`tab-${k}`}
                      type="button"
                      role="tab"
                      aria-selected={active === k}
                      aria-controls="post-panel"
                      tabIndex={active === k ? 0 : -1}
                      onClick={() => openTab(k)}
                      className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 focus-visible:outline-offset-[-3px] text-sm text-ink-soft hover:bg-ink/[0.04] hover:text-ink aria-selected:bg-ink/[0.07] aria-selected:text-ink aria-selected:shadow-[inset_0_-2px_0_var(--color-signal-deep)]"
                    >
                      {k === "all" ? <span className="font-bold">All networks</span> : <PlatformMark platform={k} className="size-4" named />}
                      {bad > 0 && (
                        <>
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-signal-deep" />
                          <span className="sr-only">({bad === 1 ? "1 issue" : `${bad} issues`})</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              </div>
            )}
            <div id="post-panel" role={tabbed ? "tabpanel" : undefined} aria-labelledby={tabbed ? `tab-${active}` : undefined} className="grid grid-cols-[minmax(0,1fr)] gap-5 p-4 sm:p-5">
              {active === "all" ? shared : own(active)}
              {!tabbed && selected[0] && settings(selected[0])}
            </div>
          </div>
          <div className="sticky bottom-3 z-10 grid gap-2 rounded-lg bg-paper/95 p-3 shadow-[0_0_0_1px_var(--line),0_-6px_20px_rgb(0_0_0/0.07)] backdrop-blur sm:px-4">
            {messages}
            {issuesOpen && issues.length > 0 && (
              <ul id="post-issues" className="grid gap-1 text-sm">
                {issues.map((i, n) => (
                  <li key={n}>
                    <button type="button" className="text-left font-bold text-signal-deep hover:underline" onClick={() => goToIssue(i)}>
                      {i.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected.includes("tiktok") && <TikTokConsent settings={tiktokOut} />}
            <div className="flex flex-wrap items-center gap-2">
              {issues.length > 0 && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm text-signal-deep"
                  aria-expanded={issuesOpen}
                  aria-controls={issuesOpen ? "post-issues" : undefined}
                  onClick={() => setIssuesOpen((o) => !o)}
                >
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  {issues.length} {issues.length === 1 ? "issue" : "issues"}
                </button>
              )}
              {!scheduleOpen && !at && (
                <button
                  type="button"
                  className="icon-btn sm:hidden"
                  aria-label="Schedule"
                  title="Schedule"
                  aria-expanded={false}
                  onClick={() => {
                    flushSync(() => setScheduleOpen(true));
                    document.getElementById("post-at")?.focus();
                  }}
                >
                  <Icon name="clock" className="size-4" />
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button type="submit" name="mode" value="draft" className="btn btn-secondary" disabled={busy !== null}>
                  {busy === "draft" ? "Saving..." : "Save draft"}
                </button>
                <button type="submit" name="mode" value="publish" className="btn btn-primary" disabled={busy !== null || needsApproval} aria-describedby={needsApproval ? "post-approval-note" : undefined}>
                  <Icon name="send" className="size-4" />
                  {busy === "publish" ? "Publishing..." : "Publish now"}
                </button>
              </div>
              {needsApproval && (
                <p id="post-approval-note" className="hint basis-full text-xs sm:text-right">
                  An owner or admin has to approve this post before it goes out. Schedule it to ask for approval.
                </p>
              )}
            </div>
            <div className={`${scheduleOpen || at ? "flex" : "hidden"} flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--line)] pt-2 sm:flex`}>
              <label htmlFor="post-at" className="text-xs font-bold whitespace-nowrap">
                Publish at
              </label>
              <input id="post-at" type="datetime-local" className="field w-auto min-w-0 max-w-full flex-1 sm:flex-none" value={at} onChange={(e) => setAt(e.target.value)} aria-describedby="post-at-note" />
              <button type="submit" name="mode" value="schedule" className="btn btn-secondary" disabled={busy !== null}>
                <Icon name="clock" className="size-4" />
                {busy === "schedule" ? "Scheduling..." : "Schedule"}
              </button>
              {queueKey && (
                <>
                  <button type="submit" name="mode" value="queue" className="btn btn-secondary" disabled={busy !== null || queueEmpty} aria-describedby="post-queue-note">
                    <Icon name="lists" className="size-4" />
                    {busy === "queue" ? "Adding..." : "Add to queue"}
                  </button>
                  <p id="post-queue-note" className="hint text-xs">
                    {queueEmpty ? (
                      <>
                        No queue times for this set.{" "}
                        <Link href="/queue" className="font-bold underline">
                          Set up the queue
                        </Link>
                      </>
                    ) : (
                      queueNext && `Next slot: ${when(queueNext)}`
                    )}
                  </p>
                </>
              )}
              <p id="post-at-note" className="hint text-xs sm:ml-auto">
                In your time zone, {zone}.
              </p>
              <div className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1">
                {hasTikTok ? (
                  <p className="hint text-xs">A post that goes to TikTok can&apos;t repeat: TikTok needs a person to confirm each post.</p>
                ) : (
                  <>
                    <RepeatControl value={repeat} disabled={status === "draft"} onChange={setRepeat} onCommit={status === "scheduled" ? changeRepeat : undefined} />
                    <p id="post-repeat-note" className="hint basis-full text-xs">
                      {status === "scheduled" ? "Each time it goes out, the next one is scheduled." : "For a scheduled or queued post, not a draft or Publish now."}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </form>
        {siblings}
        {postId && <PostPagePanel id={postId} />}
        {duplicate}
        {postId && together.length < 2 && confirm}
      </div>
      {preview}
    </div>
  );
}

// Where a target's first comment stands. A failed one is never retried, so it says what to do instead.
function commentStatus(t: Target): string {
  if (t.comment_status === "posted") return "posted.";
  if (t.comment_status === "posting") return "being posted.";
  if (t.comment_status === "failed") return `not posted. ${t.comment_error ?? ""} It is not tried again: add the comment on the platform yourself.`.replace(/\s+/g, " ");
  return t.status === "published" ? "not sent." : t.status === "failed" || t.status === "deleted" ? "not posted." : "waits for the post.";
}

const links = (media: string[]) => media.map((m) => m.trim()).filter(Boolean);

// "N/M" chips for each platform, red when over; `alerts` also says how far over a limit the text is.
function Counts({ id, text, platforms, xLong = false, alerts }: { id: string; text: string; platforms: Platform[]; xLong?: boolean; alerts?: boolean }) {
  // YouTube counts its title (the first line) in characters and its description (the rest) in bytes.
  const counts = platforms.flatMap((p) =>
    p === "youtube"
      ? [
          { key: p, name: "YouTube title", n: charCount(p, text), max: limits[p].chars, unit: "characters" },
          { key: `${p}-description`, name: "YouTube description", n: utf8Bytes(youtubeText(text).description), max: YOUTUBE_DESCRIPTION_BYTES, unit: "bytes" },
        ]
      : [{ key: p, name: platformName(p), n: charCount(p, text), max: charLimit(p, xLong), unit: "characters" }],
  );
  return (
    <>
      <CountChips id={id} counts={counts} />
      {alerts &&
        counts
          .filter(({ n, max }) => n > max)
          .map(({ key, name, n, max, unit }) => (
            <p key={key} role="alert" className="waitlist-error">
              That is {(n - max).toLocaleString("en")} over {name}&apos;s limit of {max.toLocaleString("en")} {unit}.
            </p>
          ))}
    </>
  );
}

// One scrolling line of small count chips, e.g. "Bluesky 9/300", those near or over a limit first so they always show.
function CountChips({ id, counts }: { id: string; counts: { key: string; name: string; n: number; max: number; unit: string }[] }) {
  return (
    <ul id={id} className="scroll-fade flex gap-1 overflow-x-auto text-xs whitespace-nowrap tabular-nums">
      {[...counts].sort((a, b) => Number(b.n > b.max - 20) - Number(a.n > a.max - 20) || Number(b.n > b.max) - Number(a.n > a.max)).map(({ key, name, n, max, unit }) => (
        <li
          key={key}
          title={`${name}: ${n.toLocaleString("en")} of ${max.toLocaleString("en")} ${unit}`}
          className={`rounded px-1.5 py-0.5 ${n > max ? "bg-signal-deep/10 font-bold text-signal-deep" : n > max - 20 ? "bg-ink/[0.05] text-signal-deep" : "bg-ink/[0.05] text-ink-soft"}`}
        >
          {name} {n.toLocaleString("en")}/{max.toLocaleString("en")}
          {unit === "bytes" ? " bytes" : ""}
        </li>
      ))}
    </ul>
  );
}

const commentOver = (p: Platform, text: string) => [...text].length > (limits[p].comment ?? Infinity);

// The first comment's count for each platform that takes one; over a limit it also says by how much.
function CommentCounts({ id, text, platforms }: { id: string; text: string; platforms: Platform[] }) {
  const n = [...text].length;
  return (
    <>
      <CountChips id={id} counts={platforms.map((p) => ({ key: p, name: platformName(p), n, max: limits[p].comment!, unit: "characters" }))} />
      {platforms
        .filter((p) => commentOver(p, text))
        .map((p) => (
          <p key={p} role="alert" className="waitlist-error">
            That is {(n - limits[p].comment!).toLocaleString("en")} over {platformName(p)}&apos;s first comment limit of {limits[p].comment!.toLocaleString("en")} characters.
          </p>
        ))}
    </>
  );
}

// What the first line and the rest of a YouTube post become.
function YouTubeNote() {
  return <p className="hint">On YouTube the first line is the video&apos;s title and the rest its description.</p>;
}

// What each platform takes as media, said once per platform on its tab (or the one form).
const mediaRules: Partial<Record<Platform, string>> = {
  bluesky: "Bluesky takes JPEG, PNG, WebP or GIF images, or one MP4 or MOV video.",
  instagram: "Instagram takes JPEG, PNG or WebP images or MP4 or MOV videos.",
  linkedin: "LinkedIn takes JPEG, PNG or GIF images, or one MP4 video or one PDF (posted as a document, the swipeable carousel) on its own.",
  youtube: "YouTube takes exactly one MP4 or MOV video.",
  x: "X takes up to 4 JPEG, PNG or WebP images, or one GIF or MP4 or MOV video.",
  tiktok: "TikTok takes one MP4 or MOV video, or up to 35 JPEG, PNG or WebP photos.",
};
const mediaRule = (p: Platform) => `${mediaRules[p] ?? `${platformName(p)} takes ${mediaTypes[p].text}.`} ${sizeHint([p])}`;

// The image links of one post. `post` is its number in a thread; the first post leaves it out.
// `post` is a thread part's number; `own` is the one platform these files go to in place of the shared ones.
// `rule` is the one platform of a post for one platform, whose media rule the shared hint then says.
function ImageLinks({ media, max, post, own, platforms, onChange, onClose }: { media: string[]; max: number; post?: number; own?: Platform; platforms?: Platform[]; onChange: (media: string[]) => void; onClose?: () => void }) {
  const addRef = useRef<HTMLButtonElement>(null);
  const imageRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [saved, setSaved] = useState<{ text: string; ok: boolean } | null>(null);
  const of = post ? ` of post ${post}` : own ? ` for ${platformName(own)}` : "";
  // Library picks fill the empty link boxes first, then follow the links already there.
  const filled = media.filter((m) => m.trim());

  function addImage() {
    flushSync(() => onChange([...media, ""]));
    imageRefs.current[media.length]?.focus();
  }

  function removeImage(i: number) {
    flushSync(() => onChange(media.filter((_, j) => j !== i)));
    addRef.current?.focus();
  }

  return (
    <fieldset id={own ? `media-${own}` : post ? undefined : "media-shared"} tabIndex={post ? undefined : -1} className="grid gap-2">
      <legend className={post ? "text-sm font-bold" : "label"}>
        {own ? `${platformName(own)} media` : <>Images<span className="sr-only">{of}</span></>}
      </legend>
      {own && (
        <div className="flex items-start justify-between gap-2">
          <p className="hint">
            Only {platformName(own)} gets these, in place of the shared media.
            {own === "instagram" || own === "youtube" || own === "tiktok" ? "" : " Leave it empty to post without any."} {mediaRule(own)}
          </p>
          <button type="button" className="icon-btn" aria-label={`Use the main images on ${platformName(own)}`} onClick={onClose}>
            <Icon name="close" className="size-4" />
          </button>
        </div>
      )}
      {!post && !own && (
        <div className="grid gap-1">
          <p className="hint">
            Up to {max}. Public https links, or Google Drive or Dropbox share links; nothing is uploaded to SocialReins.
          </p>
          {platforms && platforms.length > 0 && (
            <details className="hint">
              <summary className="cursor-pointer select-none font-bold">What each network takes</summary>
              <ul className="mt-1 grid list-disc gap-0.5 pl-5">
                {platforms.map((p) => (
                  <li key={p}>{mediaRules[p] ?? `${platformName(p)} takes ${mediaTypes[p].text}.`}</li>
                ))}
                <li>{sizeHint(platforms)}</li>
              </ul>
            </details>
          )}
        </div>
      )}
      {media.length > 0 && (
        <ul className="grid gap-2">
          {media.map((m, i) => (
            <li key={i} className="flex items-end gap-2">
              <label className="grid flex-1 gap-1 text-sm font-bold">
                <span>
                  Image {i + 1} link<span className="sr-only">{of}</span>
                </span>
                <input
                  ref={(el) => {
                    imageRefs.current[i] = el;
                  }}
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  className="field font-normal"
                  value={m}
                  onChange={(e) => onChange(media.map((v, j) => (j === i ? e.target.value : v)))}
                />
              </label>
              <SaveToLibrary url={m} label={`Image ${i + 1}${of}`} onResult={(text, ok) => setSaved({ text, ok })} />
              <button type="button" className="icon-btn mb-1" aria-label={`Remove image ${i + 1}${of}`} onClick={() => removeImage(i)}>
                <Icon name="close" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {saved && (
        <p role={saved.ok ? "status" : "alert"} className={saved.ok ? "hint" : "waitlist-error"}>
          {saved.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {media.length < max && (
          <button ref={addRef} type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={addImage}>
            <Icon name="image" className="size-4" />
            Add image<span className="sr-only">{post ? ` to post ${post}` : of}</span>
          </button>
        )}
        <LibraryPicker remaining={max - filled.length} of={post ? ` to post ${post}` : of} onPick={(urls) => onChange([...filled, ...urls.filter((u) => !filled.includes(u))].slice(0, max))} />
      </div>
    </fieldset>
  );
}

// Links, mentions and tags, coloured as Bluesky shows them.
const rich = /(https?:\/\/\S+|(?<!\w)@[a-z0-9.-]+\.[a-z]{2,}|(?<!\w)#[^\s#.,!?;:]+)/gi;
const fileName = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname.split("/").filter(Boolean).pop() || u.host;
  } catch {
    return url;
  }
};

// Roughly how the post looks on its first platform. Images show as tiles: the CSP only allows Bluesky's own image CDN.
function Preview({ posts, platform, account }: { posts: ThreadPart[]; platform: Platform; account?: Connection }) {
  return (
    <section aria-labelledby="preview-heading" className="grid gap-3 rounded-lg bg-[var(--line-soft)] p-3 sm:p-4 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
      <h2 id="preview-heading" className="flex items-baseline justify-between gap-2 font-display text-lg font-extrabold tracking-tight">
        Preview
        <span className="text-xs font-normal text-ink-soft">
          <span className="sr-only">as on </span>
          <PlatformMark platform={platform} className="size-3.5" named />
        </span>
      </h2>
      {posts.map((p, i) => (
        <PreviewPost key={i} body={p.body} media={p.media} platform={platform} account={account} />
      ))}
    </section>
  );
}

function PreviewPost({ body, media, platform, account }: { body: string; media: string[]; platform: Platform; account?: Connection }) {
  const video = platform === "youtube" ? youtubeText(body) : null;
  const parts = (video ? video.description : body).split(rich);
  return (
      <div className="card flex gap-3 p-4">
        {account ? (
          <Avatar connection={account} />
        ) : (
          <span aria-hidden="true" className="size-10 shrink-0 rounded-full bg-ink/10" />
        )}
        <div className="grid min-w-0 flex-1 gap-1.5">
          <p className="truncate text-[0.95rem] leading-tight">
            <strong>{account ? accountName(account) : `Your ${platformName(platform)} account`}</strong>{" "}
            <span className="text-ink-soft">{account?.handle ? `@${account.handle}` : ""} now</span>
          </p>
          {video?.title && <p className="break-words text-[0.95rem] font-bold leading-snug">{video.title}</p>}
          {(video ? video.description : body.trim()) ? (
            <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-snug">
              {parts.map((part, i) =>
                i % 2 ? (
                  <span key={i} className="text-[#1185FE]">
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
            </p>
          ) : (
            media.length === 0 && !video?.title && <p className="text-[0.95rem] text-ink-soft">Your post shows here as you write.</p>
          )}
          {media.length > 0 && (
            <ul className={`mt-1 grid gap-1 overflow-hidden rounded-xl ${media.length > 1 ? "grid-cols-2" : ""}`}>
              {media.map((m, i) => (
                <li
                  key={i}
                  className={`grid place-items-center gap-1 bg-ink/5 p-3 text-center text-xs text-ink-soft ${
                    media.length === 1 ? "aspect-video" : media.length === 3 && i === 0 ? "row-span-2" : "aspect-square"
                  }`}
                >
                  <span className="grid justify-items-center gap-1">
                    <Icon name="image" className="size-6" />
                    <span className="max-w-full truncate">{fileName(m)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
  );
}
