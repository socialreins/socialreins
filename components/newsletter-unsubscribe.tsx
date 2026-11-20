"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { unsubscribe } from "@/lib/newsletter";

const title = "font-display text-4xl font-extrabold leading-tight tracking-tight text-balance";

const problems = {
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "That took too long. Try again in a moment.",
  error: "That didn't work. Try again in a moment.",
};

export function NewsletterUnsubscribeWithToken() {
  return <NewsletterUnsubscribe token={useSearchParams().get("token") ?? ""} />;
}

export function NewsletterUnsubscribe({ token }: { token: string }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof unsubscribe>> | "idle" | "sending">("idle");
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === "ok") doneRef.current?.focus();
  }, [status]);

  async function confirm() {
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setStatus("sending"));
    setStatus(await unsubscribe(token));
  }

  // The same words for every token: the page never says whether a link was real.
  if (status === "ok")
    return (
      <div className="grid gap-3">
        <h1 ref={doneRef} tabIndex={-1} className={`${title} focus:outline-none`}>
          You are unsubscribed
        </h1>
        <p className="text-ink-soft">You will get no more emails from this newsletter. You can close this page.</p>
      </div>
    );

  const failed = status !== "idle" && status !== "sending";
  return (
    <div className="grid gap-5">
      <h1 className={title}>Unsubscribe from this newsletter?</h1>
      <p className="text-ink-soft">You will get no more emails from it. Nothing else changes.</p>
      <div className="waitlist">
        <button type="button" onClick={confirm} disabled={status === "sending"} className="justify-self-start">
          {status === "sending" ? "Unsubscribing..." : "Unsubscribe"}
        </button>
        <p role="status" aria-live="polite" className={failed ? "waitlist-error" : "waitlist-empty"}>
          {failed ? problems[status] : ""}
        </p>
      </div>
    </div>
  );
}
