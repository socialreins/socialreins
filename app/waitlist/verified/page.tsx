import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { WaitlistVerified } from "@/components/waitlist-verified";

export const metadata: Metadata = { title: "Waitlist: SocialReins" };

// Brain's email link lands here, with ?error=invalid_link when the link was bad or used up.
export default function Verified() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      {/* ?error= is only known in the browser, so the prerendered HTML carries a placeholder. */}
      <Suspense fallback={<p className="text-ink-soft">Loading...</p>}>
        <WaitlistVerified />
      </Suspense>
    </main>
  );
}
