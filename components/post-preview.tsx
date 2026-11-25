"use client";

import { Avatar, accountName } from "@/components/connections";
import { platformName } from "@/components/platform-icons";
import { PlatformMark } from "@/components/posts";
import { Icon } from "@/components/ui";
import type { Connection } from "@/lib/connections";
import { youtubeText, type Platform, type ThreadPart } from "@/lib/posts";

// Links, mentions and tags, coloured as Bluesky shows them.
export const rich = /(https?:\/\/\S+|(?<!\w)@[a-z0-9.-]+\.[a-z]{2,}|(?<!\w)#[^\s#.,!?;:]+)/gi;
export const fileName = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname.split("/").filter(Boolean).pop() || u.host;
  } catch {
    return url;
  }
};

// Roughly how the post looks on its first platform. Images show as tiles: the CSP only allows Bluesky's own image CDN.
export function Preview({ posts, platform, account, inline }: { posts: ThreadPart[]; platform: Platform; account?: Connection; inline?: boolean }) {
  return (
    <section aria-labelledby={inline ? undefined : "preview-heading"} aria-label={inline ? `${platformName(platform)} preview` : undefined} className={`grid gap-3 rounded-lg bg-[var(--line-soft)] p-3 sm:p-4 ${inline ? "" : "lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto"}`}>
      {!inline && (
        <h2 id="preview-heading" className="flex items-baseline justify-between gap-2 font-display text-lg font-extrabold tracking-tight">
          Preview
          <span className="text-xs font-normal text-ink-soft">
            <span className="sr-only">as on </span>
            <PlatformMark platform={platform} className="size-3.5" named />
          </span>
        </h2>
      )}
      {posts.map((p, i) => (
        <PreviewPost key={i} body={p.body} media={p.media} alt={p.media_alt} platform={platform} account={account} />
      ))}
    </section>
  );
}

function PreviewPost({ body, media, alt = [], platform, account }: { body: string; media: string[]; alt?: string[]; platform: Platform; account?: Connection }) {
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
                  {alt[i]?.trim() && (
                    <span className="flex max-w-full items-start gap-1 text-left" data-preview-alt>
                      <span className="rounded bg-ink/70 px-1 text-[0.65rem] font-bold text-white">ALT</span>
                      <span className="line-clamp-3 break-words">{alt[i]}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
  );
}
