"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { verifyWaitlist, type VerifyResult } from "@/lib/waitlist";

const link = "underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";
const title = "font-display text-4xl font-extrabold leading-tight tracking-tight text-balance";

const problems: Record<Exclude<VerifyResult, "verified" | "invalid">, string> = {
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "The waitlist took too long to answer. Try again in a moment.",
  error: "Your spot couldn't be confirmed. Try again in a moment.",
};

export function WaitlistVerifyWithToken() {
  return <WaitlistVerify token={useSearchParams().get("token") ?? ""} />;
}

export function WaitlistVerify({ token }: { token: string }) {
  const [status, setStatus] = useState<VerifyResult | "idle" | "sending">("idle");
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === "verified" || status === "invalid") doneRef.current?.focus();
  }, [status]);

  async function confirm() {
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setStatus("sending"));
    setStatus(await verifyWaitlist(token));
  }

  if (status === "verified")
    return (
      <div className="grid gap-3">
        <h1 ref={doneRef} tabIndex={-1} className={`${title} focus:outline-none`}>
          Your spot is confirmed
        </h1>
        <p className="text-ink-soft">
          You&apos;re on the waitlist for the hosted version.{" "}
          <Link href="/" className={link}>
            Back to the home page
          </Link>
        </p>
      </div>
    );

  if (status === "invalid")
    return (
      <div className="grid gap-3">
        <h1 ref={doneRef} tabIndex={-1} className={`${title} focus:outline-none`}>
          That link didn&apos;t work
        </h1>
        <p role="alert" className="text-ink-soft">
          Join again from the{" "}
          <Link href="/" className={link}>
            home page
          </Link>
          .
        </p>
      </div>
    );

  const failed = status !== "idle" && status !== "sending";
  return (
    <div className="grid gap-5">
      <h1 className={title}>Confirm your spot on the SocialReins waitlist</h1>
      <div className="waitlist">
        <button type="button" onClick={confirm} disabled={status === "sending"} className="justify-self-start">
          {status === "sending" ? "Confirming..." : "Confirm my email"}
        </button>
        <p role="status" aria-live="polite" className={failed ? "waitlist-error" : "waitlist-empty"}>
          {failed ? problems[status] : ""}
        </p>
      </div>
    </div>
  );
}
