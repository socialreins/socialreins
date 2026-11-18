"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { verifyNewsletter, type NewsletterVerifyResult } from "@/lib/newsletter";

const link = "underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";
const title = "font-display text-4xl font-extrabold leading-tight tracking-tight text-balance";

const problems = {
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "Confirming took too long. Try again in a moment.",
  error: "Your subscription couldn't be confirmed. Try again in a moment.",
};

export function NewsletterVerifyWithToken() {
  return <NewsletterVerify token={useSearchParams().get("token") ?? ""} />;
}

export function NewsletterVerify({ token }: { token: string }) {
  const [status, setStatus] = useState<NewsletterVerifyResult | "idle" | "sending">("idle");
  const doneRef = useRef<HTMLHeadingElement>(null);
  const settled = typeof status === "object" || status === "invalid";

  useEffect(() => {
    if (settled) doneRef.current?.focus();
  }, [settled]);

  async function confirm() {
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setStatus("sending"));
    setStatus(await verifyNewsletter(token));
  }

  if (typeof status === "object")
    return (
      <div className="grid gap-3">
        <h1 ref={doneRef} tabIndex={-1} className={`${title} focus:outline-none`}>
          You&apos;re subscribed
        </h1>
        <p className="text-ink-soft">
          {status.team ? `You'll get the newsletter of ${status.team}.` : "Your email is confirmed."}{" "}
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
          Sign up again from the page you came from to get a new link.
        </p>
      </div>
    );

  const failed = status !== "idle" && status !== "sending";
  return (
    <div className="grid gap-5">
      <h1 className={title}>Confirm your subscription</h1>
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
