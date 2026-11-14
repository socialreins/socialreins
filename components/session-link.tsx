"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMe } from "@/lib/auth";

// "Get started" for everyone; switches to "Dashboard" once the
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
    <Link href="/signup" className={className}>
      Get started
    </Link>
  );
}
