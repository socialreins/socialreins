"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import {
  addWaitlistName,
  joinWaitlist,
  waitlistCount,
  waitlistCountText,
  type NameResult,
  type WaitlistResult,
} from "@/lib/waitlist";

const emailProblems: Record<Exclude<WaitlistResult, "joined">, string> = {
  invalid: "That email address doesn't look right. Check it and try again.",
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "The waitlist took too long to answer. Try again in a moment.",
  error: "The waitlist couldn't be reached. Try again in a moment.",
};

const nameProblems: Record<Exclude<NameResult, "saved">, string> = {
  invalid: "That name doesn't work. Use 1 to 80 characters, or skip this step.",
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again or skip.",
  timeout: "The waitlist took too long to answer. Try again or skip.",
  error: "The name couldn't be saved. Try again or skip.",
};

const saved = "You're on the list. We sent a link to your email to confirm your spot.";
const done = "Check your email to confirm your spot on the waitlist for SocialReins Cloud. The link proves the address is yours.";

type Step = "email" | "name" | "done";

export function WaitlistForm() {
  const [step, setStep] = useState<Step>("email");
  const [problem, setProblem] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameToken, setNameToken] = useState<string | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    waitlistCount().then(setCount);
  }, []);

  useEffect(() => {
    if (step === "done") messageRef.current?.focus();
  }, [step]);

  async function onEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => {
      setBusy(true);
      setProblem(null);
      setInvalid(false);
    });
    const { result, nameToken } = await joinWaitlist(email, "landing");
    setBusy(false);
    if (result === "joined") {
      setNameToken(nameToken);
      // Without a token there is nothing to attach a name to, so go straight to the last step.
      setStep(nameToken ? "name" : "done");
    } else {
      setInvalid(result === "invalid");
      setProblem(emailProblems[result]);
    }
  }

  async function onName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name || !nameToken) return setStep("done");
    flushSync(() => {
      setBusy(true);
      setProblem(null);
      setInvalid(false);
    });
    const result = await addWaitlistName(nameToken, name);
    setBusy(false);
    if (result === "saved") setStep("done");
    else {
      setInvalid(result === "invalid");
      setProblem(nameProblems[result]);
      nameRef.current?.focus();
    }
  }

  return (
    <div className="waitlist">
      {step === "email" && (
        <form onSubmit={onEmail} className="waitlist">
          <label htmlFor="waitlist-email" className="sr-only">Email for the hosted version waitlist</label>
          <div className="waitlist-pill">
            <input
              id="waitlist-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={invalid || undefined}
              aria-describedby="waitlist-note waitlist-message"
            />
            <button type="submit" disabled={busy}>
              {busy ? "Joining..." : "Join the waitlist"}
            </button>
          </div>
        </form>
      )}
      {step === "name" && (
        <form onSubmit={onName} className="waitlist">
          <label htmlFor="waitlist-name">What should we call you? (optional)</label>
          <div className="waitlist-pill">
            <input
              id="waitlist-name"
              ref={nameRef}
              name="name"
              type="text"
              maxLength={80}
              autoComplete="name"
              autoFocus
              placeholder="Your name"
              aria-invalid={invalid || undefined}
              aria-describedby="waitlist-message"
            />
            <button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Continue"}
            </button>
          </div>
          <button
            type="button"
            className="waitlist-skip"
            disabled={busy}
            onClick={() => {
              setProblem(null);
              setStep("done");
            }}
          >
            Skip
          </button>
        </form>
      )}
      {count !== null && count > 0 && <p className="waitlist-note">{waitlistCountText(count)}</p>}
      {step === "email" && (
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
        className={step === "done" ? "waitlist-done" : problem ? "waitlist-error" : step === "name" ? "waitlist-note" : "waitlist-empty"}
      >
        {step === "done" ? done : (problem ?? (step === "name" ? saved : ""))}
      </p>
    </div>
  );
}
