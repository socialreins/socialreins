"use client";

import { useEffect, useState } from "react";
import { getPublicPost, linked, pictures, type PublicPost } from "@/lib/posts";
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
      {pictures(media).map((m) => (
        // eslint-disable-next-line @next/next/no-img-element -- the author's own link, any host
        <img key={m} src={m} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-[32rem] w-full rounded-2xl object-contain" />
      ))}
    </div>
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
          {post.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                <PlatformMark platform={l.platform} className="size-4" />
                See it on {platformName(l.platform)}
                <Icon name="external" className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
