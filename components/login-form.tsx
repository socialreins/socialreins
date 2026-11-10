"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getProviders, googleStartUrl, safeNext, signInWithPasskey, type Failure } from "@/lib/auth";

const rateLimited = "Too many attempts from this connection. Wait a minute, then try again.";
const unreachable = "Sign-in couldn't be reached. Try again in a moment.";

// Values brain puts in /login?error= when an emailed link or Google sign-in cannot be used.
const linkErrors: Record<string, string> = {
  invalid_link: "That sign-in link has expired or was already used. Ask for a new one below.",
  registration_disabled: "New accounts are closed on this server, so you can't create one here.",
  google_failed: "Google sign-in didn't finish. Try again, or use an email link instead.",
  no_account: "There's no account for that Google sign-in yet. Sign up below to create one.",
};
const unknownLinkError = "That sign-in didn't work. Try again, or ask for an email link below.";

const passkeyFailures: Partial<Record<Failure | "cancelled", string>> = {
  invalid_passkey: "That passkey didn't work. Try another, or sign in with an email link.",
  invalid_challenge: "That took too long. Try again.",
  cancelled: "Passkey sign-in was cancelled or no passkey was found on this device.",
  rate_limited: rateLimited,
  timeout: "Sign-in took too long to answer. Try again in a moment.",
};

const noSubscribe = () => () => {};
const hasWebAuthn = () => typeof window.PublicKeyCredential === "function";

type Mode = "login" | "signup";

// Google's own mark, in its four colors, as its sign-in button guidelines require.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const waitlistedNote = "You're on the waitlist. Sign-ups are closed for now; we'll email you when SocialReins is live.";

// Reads ?error= and brain's ?waitlisted=1 (a Google sign-up it put on the waitlist) on the client;
// the page shows <LoginForm linkError={null} /> as its server-rendered fallback.
export function LoginFormWithError({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  // Read once, so dropping it from the URL below keeps the note on screen.
  const [waitlisted] = useState(() => params.get("waitlisted") === "1");
  useEffect(() => {
    if (!waitlisted) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("waitlisted");
    window.history.replaceState(null, "", url);
  }, [waitlisted]);
  return <LoginForm mode={mode} linkError={params.get("error")} next={params.get("next")} waitlisted={waitlisted} />;
}

// The ways to log in or sign up. `next`: where to go after Google or passkey sign-in, if it is a path on this site.
export function LoginForm({
  mode,
  linkError,
  next = null,
  waitlisted = false,
}: {
  mode: Mode;
  linkError: string | null;
  next?: string | null;
  waitlisted?: boolean;
}) {
  const router = useRouter();
  const login = mode === "login";
  const [google, setGoogle] = useState(false);
  const [passkey, setPasskey] = useState<"idle" | "pending" | Failure | "cancelled">("idle");
  // Only known after hydration, so the server HTML never shows a button the browser can't use.
  const passkeys = useSyncExternalStore(noSubscribe, hasWebAuthn, () => false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    getProviders().then((p) => setGoogle(p.google));
  }, []);

  async function onPasskey() {
    setTried(true);
    flushSync(() => setPasskey("pending"));
    const r = await signInWithPasskey();
    if (r === "ok") return router.push(safeNext(next));
    setPasskey(r);
  }

  const passkeyFailed = passkey !== "idle" && passkey !== "pending";
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="grid gap-6">
      {waitlisted && !tried && (
        <p role="status" className="waitlist-done">
          {waitlistedNote}
        </p>
      )}
      {linkError !== null && !tried && (
        <p role="alert" className="waitlist-error">
          {Object.hasOwn(linkErrors, linkError) ? linkErrors[linkError] : unknownLinkError}
        </p>
      )}
      <div className="grid gap-3">
        {login && passkeys && (
          <button type="button" className="btn btn-primary h-11 w-full" disabled={passkey === "pending"} onClick={onPasskey}>
            {passkey === "pending" ? "Waiting for your passkey..." : "Login with a passkey"}
          </button>
        )}
        {passkeyFailed && (
          // Cancelling is the person's own choice, so it is a quiet status, not an alert.
          <p role={passkey === "cancelled" ? "status" : "alert"} className="waitlist-error">
            {passkeyFailures[passkey] ?? unreachable}
          </p>
        )}
        {google && (
          <a
            href={googleStartUrl(next, login)}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-[#747775] bg-white px-3 text-[0.95rem] font-medium text-[#1f1f1f] [font-family:Roboto,Arial,sans-serif] hover:bg-[#f8f9fa]"
          >
            <GoogleMark />
            Continue with Google
          </a>
        )}
        <Link href={`${login ? "/login/email" : "/signup/email"}${query}`} className="btn btn-secondary flex h-11 w-full items-center justify-center">
          {login ? "Login with Email" : "Sign up with Email"}
        </Link>
      </div>
      <p className="text-ink-soft">
        {login ? "New here? " : "Already have an account? "}
        <Link href={`${login ? "/signup" : "/login"}${query}`} className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">
          {login ? "Sign up" : "Log in"}
        </Link>
      </p>
    </div>
  );
}
