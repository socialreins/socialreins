"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { captchaMessages, useTurnstile } from "@/components/turnstile";
import { getProviders } from "@/lib/auth";
import { joinWaitlist, waitlistCount, waitlistCountText, type WaitlistResult } from "@/lib/waitlist";

const messages: Record<WaitlistResult, string> = {
  ...captchaMessages,
  joined: "You're on the waitlist for SocialReins Cloud. Check your email for a link to confirm your spot.",
  invalid: "That email address doesn't look right. Check it and try again.",
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "The waitlist took too long to answer. Try again in a moment.",
  error: "The waitlist couldn't be reached. Try again in a moment.",
};

export function WaitlistForm() {
  const [status, setStatus] = useState<WaitlistResult | "idle" | "sending">("idle");
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>();
  const turnstile = useTurnstile(siteKey, "waitlist");

  useEffect(() => {
    waitlistCount().then(setCount);
    getProviders().then((p) => setSiteKey(p.turnstileSiteKey));
  }, []);

  useEffect(() => {
    if (status === "joined") messageRef.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setStatus("sending"));
    const result = await joinWaitlist(email, "landing", turnstile.token);
    turnstile.reset();
    setStatus(result);
    if (result === "joined") waitlistCount().then(setCount);
  }

  const joined = status === "joined";
  const failed = status !== "idle" && status !== "sending" && !joined;
  return (
    <form onSubmit={onSubmit} className="waitlist">
      {!joined && (
        <>
          <label htmlFor="waitlist-email" className="sr-only">Email for the hosted version waitlist</label>
          <div className="waitlist-pill">
            <input
              id="waitlist-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={status === "invalid" || undefined}
              aria-describedby="waitlist-note waitlist-message"
            />
            <button type="submit" disabled={status === "sending" || turnstile.missing}>
              {status === "sending" ? "Joining..." : "Join the waitlist"}
            </button>
          </div>
        </>
      )}
      {!joined && turnstile.widget}
      {count !== null && <p className="waitlist-note">{waitlistCountText(count)}</p>}
      {!joined && (
        <p id="waitlist-note" className="waitlist-note">
          SocialReins Cloud is not open yet. We email you when it is. It will be a paid subscription.
        </p>
      )}
      <p
        id="waitlist-message"
        ref={messageRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={joined ? "waitlist-done" : failed ? "waitlist-error" : "waitlist-empty"}
      >
        {joined || failed ? messages[status] : ""}
      </p>
    </form>
  );
}
