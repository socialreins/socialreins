import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicPostView } from "@/components/public-post";
import { LogoMark } from "@/components/logo";

// A team's own words, not SocialReins copy: kept out of search results.
export const metadata: Metadata = { title: "A post on SocialReins", robots: { index: false } };

type Params = { params: Promise<{ code: string }> };

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
  return <PublicPostView code={(await params).code} />;
}
