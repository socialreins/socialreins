"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Failure } from "@/lib/auth";
import { listConnections, type Connection } from "@/lib/connections";
import {
  charCount,
  checkThread,
  createPost,
  createPostGroup,
  deletePost,
  fromLocalInput,
  getPost,
  limits,
  listPosts,
  MAX_PARTS,
  publishing,
  publishPost,
  toLocalInput,
  updatePost,
  type Platform,
  type Post,
  type PostGroupInput,
  type PostInput,
  type ThreadPart,
} from "@/lib/posts";
import { fitsList, listLists, partLabel, type PostList } from "@/lib/lists";
import { listSets, type SocialSet } from "@/lib/sets";
import { accountName, Avatar } from "@/components/connections";
import { platformName } from "@/components/platform-icons";
import { AccountNote, PlatformMark, postMessages, StatusBadge, statusName } from "@/components/posts";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { useCurrentSet } from "@/components/app-shell";
import { Icon } from "@/components/ui";

const POLL_MS = 2000;
const POLL_FOR_MS = 60_000;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const names = (list: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(list.map(platformName));

// What a check failure means for one platform, naming its own limit.
function platformProblem(platform: Platform, failure: Failure): ReactNode {
  const name = platformName(platform);
  if (failure === "too_long") return `${name} takes at most ${limits[platform].chars.toLocaleString("en")} characters.`;
  if (failure === "too_many_images") return `${name} takes at most ${limits[platform].media} images.`;
  if (failure === "thread_not_supported") return `${name} can't post threads.`;
  return postMessages[failure] ?? failure;
}

export function PostEditor({ id }: { id?: string }) {
  const router = useRouter();
  const [post, setPost] = useState<Post | Failure | null>(null);
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[]>([]);
  const [setId, setSetId] = useState("");
  // Read once: the set picked in the top bar when the editor opened.
  const startSet = useRef(useCurrentSet()[0]);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [thread, setThread] = useState<ThreadPart[]>([]);
  // The platforms ticked for a new post; null means every platform with an account in the set.
  const [chosen, setChosen] = useState<Platform[] | null>(null);
  // Per-platform text that replaces the main post on that platform.
  const [custom, setCustom] = useState<Partial<Record<Platform, string>>>({});
  // Every post of this post's group, this one included; empty for a single post.
  const [group, setGroup] = useState<Post[]>([]);
  const [at, setAt] = useState("");
  const [lists, setLists] = useState<PostList[]>([]);
  const [listId, setListId] = useState("");
  const [local, setLocal] = useState<ReactNode>(null);
  const [confirming, setConfirming] = useState(false);
  const [pollNote, setPollNote] = useState("");
  // Bumped after Publish now, to move focus onto the status line that follows the post.
  const [sent, setSent] = useState(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const addPartRef = useRef<HTMLButtonElement>(null);
  const partRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const { busy, problem, done, run } = useAction();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);

  function load(p: Post) {
    setPost(p);
    setSetId(p.social_set_id);
    setBody(p.body);
    setMedia(p.media);
    setThread(p.thread ?? []);
    setCustom({});
    setAt(toLocalInput(p.status === "scheduled" ? p.scheduled_at : null));
    setListId("");
  }

  useEffect(() => {
    listSets().then((r) => {
      setSets(r);
      // A new post starts in the set picked in the top bar.
      if (Array.isArray(r) && r[0]) setSetId((v) => v || (r.some((s) => s.id === startSet.current) ? startSet.current : r[0]!.id));
    });
    listConnections().then((r) => Array.isArray(r) && setAccounts(r));
    listLists().then((r) => Array.isArray(r) && setLists(r));
    if (id)
      getPost(id).then((r) => {
        if (isFailure(r)) return setPost(r);
        load(r);
        if (r.group_id) listPosts({ group_id: r.group_id }).then((g) => Array.isArray(g) && setGroup(g));
      });
  }, [id]);

  const postId = post && !isFailure(post) ? post.id : undefined;
  const status = post && !isFailure(post) ? post.status : undefined;
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
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

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

  async function save(mode: "draft" | "schedule" | "publish") {
    flushSync(() => setLocal(null));
    if (selected.length === 0) return setLocal("Pick at least one platform to post to.");
    for (const p of selected) {
      const e = entry(p);
      const invalid = checkThread(e.body, e.media, e.thread, p);
      if (invalid) return setLocal(<>{invalid.part ? `Post ${invalid.part + 1} of the thread: ` : ""}{platformProblem(p, invalid.failure)}</>);
    }
    if (mode === "schedule" && !at) return setLocal("Pick a date and time to schedule the post.");
    const shared = {
      social_set_id: setId,
      scheduled_at: mode === "schedule" ? fromLocalInput(at) : null,
      list_id: listChoices.some((l) => l.id === listId) ? listId : undefined,
    };
    const input: PostInput = { ...shared, platform: selected[0]!, ...entry(selected[0]!) };
    // Customized text, and an empty thread where the platform can't post one, so brain takes the rest.
    const overrides: PostGroupInput["overrides"] = {};
    for (const p of selected) {
      const o = { body: custom[p], thread: limits[p].thread || parts.length === 0 ? undefined : [] };
      if (o.body !== undefined || o.thread) overrides[p] = o;
    }
    let made = 1;
    await run(mode, async () => {
      if (postId || selected.length === 1) {
        const saved = postId ? await updatePost(postId, input) : await createPost(input);
        if (isFailure(saved)) return saved;
        // Keep this editor mounted on the new post's own address.
        if (!postId) window.history.replaceState(null, "", `/app/posts/${saved.id}`);
        load(saved);
        return mode === "publish" ? publishPost(saved.id) : saved;
      }
      const g = await createPostGroup({ ...shared, platforms: selected, body, media: images, thread: parts, overrides });
      if (isFailure(g)) return g;
      const posts = g.posts;
      made = posts.length;
      // The editor carries on as the first post; the others are listed below it.
      window.history.replaceState(null, "", `/app/posts/${posts[0]!.id}`);
      load(posts[0]!);
      setGroup(posts);
      if (mode !== "publish") return posts[0]!;
      const queued: Post[] = [];
      for (const p of posts) {
        const r = await publishPost(p.id);
        if (isFailure(r)) return r;
        queued.push(r);
        setGroup(posts.map((x) => queued.find((q) => q.id === x.id) ?? x));
      }
      return queued[0]!;
    }, (p) => {
      load(p);
      // The status line says Publishing and updates itself; a separate message would go stale.
      if (mode === "publish") return void setSent((n) => n + 1);
      if (p.status === "scheduled") return `${made > 1 ? `Scheduled ${made} posts, one per platform, for` : "Scheduled for"} ${when(p.scheduled_at!)}.`;
      return made > 1 ? `Saved ${made} drafts, one per platform.` : "Draft saved.";
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
    } else if (ok && status !== "published") router.push("/app/posts");
    else if (!ok) askRef.current?.focus();
  }

  const inLists = post && !isFailure(post) ? post.lists : [];
  // Lists this set's post can join; one it is already in is left out, since sending it would move the post to the end.
  const listChoices = lists.filter((l) => fitsList(l, setId) && !inLists.some((x) => x.id === l.id));
  const editable = !status || status === "draft" || status === "scheduled";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const setName = Array.isArray(sets) ? sets.find((s) => s.id === (post as Post | null)?.social_set_id)?.name : undefined;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const shownProblem = local ? null : problem;
  const inSet = (p: Platform) => accounts.filter((a) => a.provider === p && a.set_ids.includes(setId));
  // A saved post keeps its platform; a new one offers each platform with an account in the set.
  const available: Platform[] = post ? [post.platform] : publishing.filter((p) => inSet(p).length > 0);
  const selected = post ? available : (chosen ?? available).filter((p) => available.includes(p));
  const threadable = selected.filter((p) => limits[p].thread);
  const noThread = selected.filter((p) => !limits[p].thread);
  const mainPlatforms = selected.filter((p) => custom[p] === undefined);
  const images = links(media);
  const parts = thread.map((p) => ({ ...p, media: links(p.media) }));
  // One platform's post: its own text if customized, and the thread only where it can post one.
  const entry = (p: Platform) => ({ body: custom[p] ?? body, media: images, thread: limits[p].thread ? parts : [] });
  // Shared images must fit every chosen platform.
  const cap = (list: Platform[]) => (list.length ? Math.min(...list.map((p) => limits[p].media)) : limits.bluesky.media);
  const mediaProblems = selected.flatMap((p) =>
    p === "instagram" && images.length === 0 ? [platformProblem(p, "media_required")] : images.length > limits[p].media ? [platformProblem(p, "too_many_images")] : [],
  );
  const shown = selected[0];
  const others = group.filter((g) => g.id !== postId);

  const preview = (
    <Preview
      posts={shown ? [{ body: entry(shown).body, media: images }, ...entry(shown).thread] : [{ body, media: images }]}
      platform={shown ?? "bluesky"}
      account={shown ? inSet(shown)[0] : undefined}
    />
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
            <Link href={`/app/posts/${g.id}`} className="min-w-0 flex-1 font-bold hover:underline">
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
    </section>
  );

  const confirm = confirming ? (
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
    </>
  );

  if (!editable && post) {
    return (
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-5">
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
          {post.targets.length > 0 && (
            <section aria-labelledby="targets-heading" className="grid gap-3">
              <h2 id="targets-heading" className="font-display text-lg font-extrabold tracking-tight">
                Accounts
              </h2>
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
          {post.status === "published" && confirm}
        </div>
        {preview}
      </div>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const mode = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as "draft" | "schedule" | "publish";
    save(mode || "draft");
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

  function uncustomize(p: Platform) {
    flushSync(() => setCustom((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== p))));
    document.getElementById(`customize-${p}`)?.focus();
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="grid gap-5">
        <AccountNote />
        {status === "scheduled" && post && (
          <p className="flex flex-wrap items-center gap-3 font-bold">
            <StatusBadge status="scheduled" />
            Scheduled for {when(post.scheduled_at!)}.
          </p>
        )}
        {/* Save draft is the first submit button, so Enter in a field saves rather than publishes. */}
        <form onSubmit={onSubmit} className="grid gap-5">
          <div className="card grid gap-5 p-5">
            <div className="grid gap-1.5">
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
                {post ? `The post goes to every ${platformName(post.platform)} account in this set.` : "Each platform gets its own post, sent to every account of that platform in this set."}
              </p>
            </div>
            {!post && (
              <fieldset className="grid gap-2">
                <legend className="label">Post to</legend>
                {available.length === 0 ? (
                  <p className="hint">
                    No connected account is in this set. Add one on{" "}
                    <Link href="/app/connections" className="font-bold underline">
                      Connections
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {available.map((p) => (
                      <li key={p}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected.includes(p)}
                            onChange={() => setChosen(publishing.filter((x) => (x === p ? !selected.includes(p) : selected.includes(x))))}
                          />
                          <PlatformMark platform={p} className="size-4" named />
                          <span className="text-ink-soft">{inSet(p).map(accountName).join(", ")}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            )}
            <div className="grid gap-1.5">
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
            <div className="grid gap-1.5">
              <label htmlFor="post-body" className="label">
                Post
              </label>
              <textarea
                id="post-body"
                rows={7}
                className="field resize-y"
                placeholder="What do you want to say?"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-invalid={mainPlatforms.some((p) => charCount(p, body) > limits[p].chars) || undefined}
                aria-describedby="post-count"
              />
              <Counts id="post-count" text={body} platforms={mainPlatforms} alerts />
            </div>
            {selected.length > 1 &&
              selected.map((p) =>
                custom[p] === undefined ? (
                  <button key={p} id={`customize-${p}`} type="button" className="btn btn-quiet btn-sm justify-self-start" onClick={() => customize(p)}>
                    <Icon name="plus" className="size-4" />
                    Customize for {platformName(p)}
                  </button>
                ) : (
                  <div key={p} className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`post-body-${p}`} className="label">
                        {platformName(p)} text
                      </label>
                      <button type="button" className="icon-btn" aria-label={`Use the main post on ${platformName(p)}`} onClick={() => uncustomize(p)}>
                        <Icon name="close" className="size-4" />
                      </button>
                    </div>
                    <textarea
                      id={`post-body-${p}`}
                      rows={4}
                      className="field resize-y"
                      value={custom[p]}
                      onChange={(e) => setCustom((c) => ({ ...c, [p]: e.target.value }))}
                      aria-invalid={charCount(p, custom[p]!) > limits[p].chars || undefined}
                      aria-describedby={`post-body-${p}-count`}
                    />
                    <Counts id={`post-body-${p}-count`} text={custom[p]!} platforms={[p]} alerts />
                  </div>
                ),
              )}
            <ImageLinks media={media} max={cap(selected)} onChange={setMedia} />
            {mediaProblems.length > 0 && (
              <ul className="grid gap-1">
                {mediaProblems.map((m, i) => (
                  <li key={i} className="waitlist-error">
                    {m}
                  </li>
                ))}
              </ul>
            )}
            {threadable.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="label">Thread</legend>
              <p className="hint">
                Follow-up posts go out as replies, each to the one before, on every account.
                {noThread.length > 0 && ` ${names(noThread)} can't post threads, so ${noThread.length > 1 ? "they get" : "it gets"} only the first post.`}
              </p>
              {thread.length > 0 && (
                <ol className="grid gap-3">
                  {thread.map((p, i) => {
                    const over = threadable.some((x) => charCount(x, p.body) > limits[x].chars);
                    return (
                      <li key={i} className="grid gap-1">
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
                        <Counts id={`post-part-${i}-count`} text={p.body} platforms={threadable} />
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
          </div>
          {messages}
          <div className="card grid gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="submit" name="mode" value="draft" className="btn btn-secondary" disabled={busy !== null}>
                {busy === "draft" ? "Saving..." : "Save draft"}
              </button>
              <button type="submit" name="mode" value="publish" className="btn btn-primary" disabled={busy !== null}>
                <Icon name="send" className="size-4" />
                {busy === "publish" ? "Publishing..." : "Publish now"}
              </button>
            </div>
            <div className="grid gap-1.5 border-t border-ink/10 pt-4">
              <label htmlFor="post-at" className="label">
                Publish at
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="post-at"
                  type="datetime-local"
                  className="field w-auto min-w-0 flex-1"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  aria-describedby="post-at-note"
                />
                <button type="submit" name="mode" value="schedule" className="btn btn-secondary" disabled={busy !== null}>
                  <Icon name="clock" className="size-4" />
                  {busy === "schedule" ? "Scheduling..." : "Schedule"}
                </button>
              </div>
              <p id="post-at-note" className="hint">
                In your time zone, {zone}.
              </p>
            </div>
          </div>
        </form>
        {siblings}
        {postId && confirm}
      </div>
      {preview}
    </div>
  );
}

const links = (media: string[]) => media.map((m) => m.trim()).filter(Boolean);

// "N of M characters" for each platform; `alerts` also says how far over a limit the text is.
function Counts({ id, text, platforms, alerts }: { id: string; text: string; platforms: Platform[]; alerts?: boolean }) {
  const counts = platforms.map((p) => ({ p, n: charCount(p, text), max: limits[p].chars }));
  return (
    <>
      <ul id={id} className="flex flex-wrap justify-end gap-x-4 text-sm">
        {counts.map(({ p, n, max }) => (
          <li key={p} className={n > max ? "font-bold text-signal-deep" : n > max - 20 ? "text-signal-deep" : "text-ink-soft"}>
            {platformName(p)}: {n.toLocaleString("en")} of {max.toLocaleString("en")} characters
          </li>
        ))}
      </ul>
      {alerts &&
        counts
          .filter(({ n, max }) => n > max)
          .map(({ p, n, max }) => (
            <p key={p} role="alert" className="waitlist-error">
              That is {(n - max).toLocaleString("en")} over {platformName(p)}&apos;s limit of {max.toLocaleString("en")} characters.
            </p>
          ))}
    </>
  );
}

// The image links of one post. `post` is its number in a thread; the first post leaves it out.
function ImageLinks({ media, max, post, onChange }: { media: string[]; max: number; post?: number; onChange: (media: string[]) => void }) {
  const addRef = useRef<HTMLButtonElement>(null);
  const imageRefs = useRef<(HTMLInputElement | null)[]>([]);
  const of = post ? ` of post ${post}` : "";

  function addImage() {
    flushSync(() => onChange([...media, ""]));
    imageRefs.current[media.length]?.focus();
  }

  function removeImage(i: number) {
    flushSync(() => onChange(media.filter((_, j) => j !== i)));
    addRef.current?.focus();
  }

  return (
    <fieldset className="grid gap-2">
      <legend className={post ? "text-sm font-bold" : "label"}>
        Images<span className="sr-only">{of}</span>
      </legend>
      {!post && (
        <p className="hint">
          Up to {max}. Public https links to image or video files, or Google Drive share links. Bluesky takes JPEG, PNG, WebP or GIF of 1 MB
          or less; Instagram takes JPEG, MP4 or MOV.
        </p>
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
              <button type="button" className="icon-btn mb-1" aria-label={`Remove image ${i + 1}${of}`} onClick={() => removeImage(i)}>
                <Icon name="close" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {media.length < max && (
        <button ref={addRef} type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={addImage}>
          <Icon name="image" className="size-4" />
          Add image<span className="sr-only">{post ? ` to post ${post}` : ""}</span>
        </button>
      )}
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
    <section aria-labelledby="preview-heading" className="grid gap-3 lg:sticky lg:top-10">
      <h2 id="preview-heading" className="font-display text-lg font-extrabold tracking-tight">
        Preview
      </h2>
      {posts.map((p, i) => (
        <PreviewPost key={i} body={p.body} media={p.media} platform={platform} account={account} />
      ))}
    </section>
  );
}

function PreviewPost({ body, media, platform, account }: { body: string; media: string[]; platform: Platform; account?: Connection }) {
  const parts = body.split(rich);
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
          {body.trim() ? (
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
            media.length === 0 && <p className="text-[0.95rem] text-ink-soft">Your post shows here as you write.</p>
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
