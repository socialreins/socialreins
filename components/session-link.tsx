"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMe } from "@/lib/auth";

// "Get started" for everyone, as the header's one filled button; switches to a plain "Dashboard" link once the
// API says this browser has a session. /signup creates the account, or joins the waitlist while sign-ups are
// closed, and links to /login for people who have one.
export function SessionLink({ className }: { className: string }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    getMe().then((r) => setSignedIn(typeof r === "object"));
  }, []);
  return signedIn ? (
    <Link href="/home" className={className}>
      Dashboard
    </Link>
  ) : (
    <Link href="/signup" className="rounded-full border-2 border-ink bg-ink px-3.5 py-1.5 font-bold whitespace-nowrap text-paper hover:border-signal-deep hover:bg-signal-deep">
      Get started
    </Link>
  );
}
