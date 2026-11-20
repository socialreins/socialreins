import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { NewsletterUnsubscribe, NewsletterUnsubscribeWithToken } from "@/components/newsletter-unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe: SocialReins", robots: { index: false }, referrer: "no-referrer" };

// The Unsubscribe link of every newsletter email leads here with ?token=; only the button unsubscribes, never the
// page load, since mail scanners open links.
export default function Unsubscribe() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      {/* ?token= is only known in the browser, so the prerendered HTML carries the page without it. */}
      <Suspense fallback={<NewsletterUnsubscribe token="" />}>
        <NewsletterUnsubscribeWithToken />
      </Suspense>
    </main>
  );
}
