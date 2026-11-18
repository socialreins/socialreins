"use client";

import { useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { subscribe, type SubscribeResult } from "@/lib/newsletter";
import { getPublicPost, linked, pageMedia, type PublicPost } from "@/lib/posts";
import { platformName } from "@/components/platform-icons";
import { PlatformMark } from "@/components/posts";
import { Icon } from "@/components/ui";

// The author's text with its links made clickable. They are someone else's links: no referrer, not endorsed.
function Text({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {linked(text).map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="nofollow ugc noopener noreferrer" className="font-bold underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function Part({ body, media }: { body: string; media: string[] }) {
  return (
    <div className="grid gap-3">
      {body.trim() && <Text text={body} className="text-lg" />}
      {pageMedia(media).map((m, i) => {
        if (m.kind === "link")
          return (
            <a key={i} href={m.href} target="_blank" rel="nofollow ugc noopener noreferrer" className="btn btn-secondary btn-sm justify-self-start">
              {m.label}
              <Icon name="external" className="size-4" />
            </a>
          );
        // eslint-disable-next-line @next/next/no-img-element -- the author's own link, any host
        const img = <img src={m.src} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-[32rem] w-full rounded-2xl object-contain" />;
        return m.href ? (
          <a key={i} href={m.href} target="_blank" rel="nofollow ugc noopener noreferrer" aria-label="Open the picture">
            {img}
          </a>
        ) : (
          <span key={i}>{img}</span>
        );
      })}
    </div>
  );
}

const subscribeProblems: Record<Exclude<SubscribeResult, "ok">, string> = {
  invalid: "That doesn't look like an email address.",
  gone: "This newsletter is not open any more.",
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "That took too long. Try again in a moment.",
  error: "Signing up didn't work. Try again in a moment.",
};

// Brain answers the same for a new email and a known one, so this never says whether it was subscribed before.
function Newsletter({ code, team }: { code: string; team: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubscribeResult | "idle" | "sending">("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setStatus("sending"));
    setStatus(await subscribe(code, email.trim()));
  }

  if (status === "ok")
    return (
      <p role="status" tabIndex={-1} ref={(el) => el?.focus()} className="card p-5 outline-none">
        Check your email: we sent a link to confirm your subscription.
      </p>
    );
  const failed = status !== "idle" && status !== "sending";
  return (
    <section aria-labelledby="newsletter-heading" className="card grid gap-3 p-5">
      <h2 id="newsletter-heading" className="font-display text-lg font-extrabold tracking-tight">
        Get the newsletter
      </h2>
      <form onSubmit={onSubmit} className="waitlist">
        <label htmlFor="newsletter-email">Your email, to get the newsletter of {team}</label>
        <div className="waitlist-row">
          <input id="newsletter-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={status === "invalid" || undefined} />
          <button type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending..." : "Subscribe"}
          </button>
        </div>
        <p role="status" aria-live="polite" className={failed ? "waitlist-error" : "waitlist-empty"}>
          {failed ? subscribeProblems[status] : ""}
        </p>
      </form>
    </section>
  );
}

export function PublicPostView({ code }: { code: string }) {
  const [post, setPost] = useState<PublicPost | null | "error" | "loading">("loading");
  useEffect(() => {
    getPublicPost(code).then(setPost);
  }, [code]);

  if (post === "loading") return <p className="text-ink-soft">Loading the post...</p>;
  if (post === "error")
    return (
      <p role="alert" className="waitlist-error">
        The post couldn&apos;t be loaded. Try again in a moment.
      </p>
    );
  if (post === null) return <p>This page is not available. The post may not be published yet, or its page was switched off.</p>;
  return (
    <article className="grid gap-6">
      <p className="text-sm text-ink-soft">
        Posted by <strong className="text-ink">{post.team}</strong> on {new Date(post.published_at).toLocaleDateString(undefined, { dateStyle: "long" })}
      </p>
      <Part body={post.body} media={post.media} />
      {post.thread.map((t, i) => (
        <Part key={i} body={t.body} media={t.media} />
      ))}
      {post.details.trim() && (
        <section aria-labelledby="details-heading" className="card grid gap-2 p-5">
          <h2 id="details-heading" className="font-display text-lg font-extrabold tracking-tight">
            Details
          </h2>
          <Text text={post.details} />
        </section>
      )}
      {post.links.length > 0 && (
        <ul aria-label="Where this was posted" className="flex flex-wrap gap-2">
          {post.links
            .filter((l) => l.url.startsWith("https://"))
            .map((l, i) => (
            <li key={i}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                <PlatformMark platform={l.platform} className="size-4" />
                See it on {platformName(l.platform)}
                <Icon name="external" className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {post.newsletter && <Newsletter code={code} team={post.team} />}
    </article>
  );
}
