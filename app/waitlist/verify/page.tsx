import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { WaitlistVerify, WaitlistVerifyWithToken } from "@/components/waitlist-verify";

export const metadata: Metadata = { title: "Confirm your spot: SocialReins", robots: { index: false } };

// Brain's waitlist email links here with ?token=; only the button confirms, never the page load.
export default function Verify() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      {/* ?token= is only known in the browser, so the prerendered HTML carries the form without it. */}
      <Suspense fallback={<WaitlistVerify token="" />}>
        <WaitlistVerifyWithToken />
      </Suspense>
    </main>
  );
}
