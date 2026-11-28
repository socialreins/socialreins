import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { brainUrl } from "@/lib/brain-url";
import { getPublicPost, pageMeta, publicPageCode } from "@/lib/posts";
import { PublicPostView } from "@/components/public-post";
import { LogoMark } from "@/components/logo";

// A team's own words, not SocialReins copy: kept out of search results.
const fallback: Metadata = { title: "A post on SocialReins", robots: { index: false } };

type Params = { params: Promise<{ code: string }> };

// The post for link previews, read on the server; the page body still reads it in the browser.
// shortcut: brain limits its public route to 120 requests a minute per IP and every server fetch comes from
// the web server's IP, so this 5 minute cache per code is what keeps previews under it; add a shared cache
// (or exempt the web server in brain) if many different pages get shared at once.
async function previewPost(code: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  const post = await getPublicPost(code, brainUrl(), 5000);
  // A timeout, rate limit or outage throws past the cache, so it is not kept for 5 minutes.
  if (post === "error") throw new Error("brain unavailable");
  return post;
}

// Page codes are 10 characters of the team code alphabet; anything else is not asked for.
const pageCode = /^[2-9a-hjkmnp-z]{10}$/;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  try {
    const code = publicPageCode((await params).code);
    if (!pageCode.test(code)) return fallback;
    const post = await previewPost(code);
    return post ? pageMeta(post) : fallback;
  } catch {
    return fallback;
  }
}

export default function PublicPostPage({ params }: Params) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-start gap-8 px-4 py-10">
      <Suspense fallback={<p className="text-ink-soft">Loading the post...</p>}>
        <Code params={params} />
      </Suspense>
      <footer className="border-t border-ink/10 pt-6 text-sm text-ink-soft">
        {/* A full page load, so the next page gets its own stricter image policy (proxy.ts). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="inline-flex items-center gap-2 font-bold text-ink">
          <LogoMark className="size-6" />
          Shared with SocialReins
        </a>
      </footer>
    </main>
  );
}

async function Code({ params }: Params) {
  return <PublicPostView code={publicPageCode((await params).code)} />;
}
