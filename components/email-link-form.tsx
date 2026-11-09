"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { captchaMessages, useTurnstile } from "@/components/turnstile";
import { cleanName, getProviders, MAX_NAME, requestLink, type LinkResult } from "@/lib/auth";

const failures: Record<Exclude<LinkResult, "sent">, string> = {
  ...captchaMessages,
  invalid: "That email address doesn't look right. Check it and try again.",
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "Sign-in took too long to answer. Try again in a moment.",
  error: "Sign-in couldn't be reached. Try again in a moment.",
};

const linkButton =
  "justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep disabled:cursor-progress disabled:opacity-70";

const noSubscribe = () => () => {};

type Status = LinkResult | "idle" | "sending" | "invalid_name";

// The email step of logging in or signing up, on its own page. Sign-up also asks for a name.
export function EmailLinkForm({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const [siteKey, setSiteKey] = useState<string | null>();
  const turnstile = useTurnstile(siteKey, "login");
  const [status, setStatus] = useState<Status>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const doneRef = useRef<HTMLHeadingElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  // Keeps ?next= on the way back, for Google or passkey. Empty in the prerendered HTML.
  const query = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");

  useEffect(() => {
    getProviders().then((p) => setSiteKey(p.turnstileSiteKey));
  }, []);

  useEffect(() => {
    if (status === "sent") doneRef.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleaned = signup ? cleanName(name) : null;
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setStatus("sending"));
    if (signup && !cleaned) return setStatus("invalid_name");
    const result = await requestLink(email.trim(), turnstile.token, cleaned);
    turnstile.reset();
    setStatus(result);
  }

  if (status === "sent") {
    return (
      <div className="grid gap-3">
        <h2 ref={doneRef} tabIndex={-1} className="font-display text-2xl font-extrabold tracking-tight">
          Check your email
        </h2>
        <p className="waitlist-done">
          If {email.trim()} can sign in, a link is on its way. It works once and expires in 15 minutes.
        </p>
        <button
          type="button"
          className={linkButton}
          onClick={() => {
            flushSync(() => setStatus("idle"));
            firstRef.current?.focus();
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  const message =
    status === "invalid_name"
      ? `Enter your name, up to ${MAX_NAME} characters.`
      : status === "idle" || status === "sending"
        ? ""
        : failures[status];
  const sending = status === "sending";
  return (
    <div className="grid gap-6">
      <form onSubmit={onSubmit} className="waitlist max-w-none">
        {signup && (
          <>
            <label htmlFor="login-name">Name</label>
            <input
              ref={firstRef}
              id="login-name"
              name="name"
              type="text"
              required
              maxLength={MAX_NAME}
              autoComplete="name"
              placeholder="Harun R. Rayhan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={status === "invalid_name" || undefined}
              aria-describedby="login-message"
            />
          </>
        )}
        <label htmlFor="login-email">Email</label>
        <input
          ref={signup ? undefined : firstRef}
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={signup ? "me@harun.dev" : "you@example.com"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={status === "invalid" || undefined}
          aria-describedby="login-message"
        />
        {turnstile.widget}
        <button type="submit" disabled={sending || turnstile.missing}>
          {sending ? "Sending..." : signup ? "Sign up with a link" : "Login with a link"}
        </button>
        <p id="login-message" role="status" aria-live="polite" className={message ? "waitlist-error" : "waitlist-empty"}>
          {message}
        </p>
      </form>
      <Link href={`${signup ? "/signup" : "/login"}${query}`} className={linkButton}>
        Other ways to {signup ? "sign up" : "log in"}
      </Link>
    </div>
  );
}
