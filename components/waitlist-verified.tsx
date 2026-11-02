"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const link = "underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export function WaitlistVerified() {
  const failed = useSearchParams().get("error") !== null;
  return (
    <div className="grid gap-3">
      <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-balance">
        {failed ? "That link didn't work" : "Your spot is confirmed"}
      </h1>
      {failed ? (
        <p className="text-ink-soft">
          The link is invalid or has expired. Join the waitlist again from the{" "}
          <Link href="/" className={link}>
            home page
          </Link>{" "}
          to get a new one.
        </p>
      ) : (
        <p className="text-ink-soft">
          You&apos;re on the waitlist for the hosted version.{" "}
          <Link href="/" className={link}>
            Back to the home page
          </Link>
        </p>
      )}
    </div>
  );
}
