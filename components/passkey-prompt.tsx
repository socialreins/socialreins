"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { listPasskeys } from "@/lib/auth";
import { Icon } from "@/components/ui";

const SNOOZE_KEY = "passkey-prompt-snoozed-at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// Hide the prompt for a week. Also called by /welcome's "Skip for now", so a new user isn't asked twice in a row.
export function snoozePasskeyPrompt() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch {}
}

function snoozed() {
  try {
    return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) ?? 0) < SNOOZE_MS;
  } catch {
    return true;
  }
}

// Asks a signed-in user with no passkeys to add one. Rendered by the app shell once it has the session.
export function PasskeyPrompt() {
  const router = useRouter();
  const path = usePathname();
  const [show, setShow] = useState(false);
  const checked = useRef(false);
  const ref = useRef<HTMLDialogElement>(null);
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    // The security page is where passkeys are added, so the prompt waits until the user leaves it.
    if (checked.current || path === "/security" || typeof window.PublicKeyCredential !== "function" || snoozed()) return;
    checked.current = true;
    // A failed list shows nothing.
    // The user may have moved to the security page while the list loaded.
    listPasskeys().then((r) => setShow(Array.isArray(r) && r.length === 0 && pathRef.current !== "/security"));
  }, [path]);

  useEffect(() => {
    if (show) ref.current?.showModal();
  }, [show]);

  function onClose() {
    snoozePasskeyPrompt();
    setShow(false);
    // The browser returns focus to where it was before the dialog opened; if that was nowhere, land on the main content.
    const at = document.activeElement;
    if (!at || at === document.body || ref.current?.contains(at)) document.getElementById("main")?.focus();
  }

  if (!show) return null;
  return (
    <dialog
      ref={ref}
      aria-labelledby="passkey-prompt-title"
      aria-describedby="passkey-prompt-text"
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <div className="grid gap-5 p-6">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-ink text-signal">
          <Icon name="fingerprint" className="size-6" />
        </span>
        <div className="grid gap-2">
          <h2 id="passkey-prompt-title" className="font-display text-2xl font-extrabold tracking-tight">
            Add a passkey
          </h2>
          <p id="passkey-prompt-text" className="text-ink-soft">
            Sign in faster and more safely with your fingerprint, face or screen lock. It takes a few seconds.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              ref.current?.close();
              router.push("/security#passkeys");
            }}
          >
            Add a passkey
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => ref.current?.close()}>
            Not now
          </button>
        </div>
      </div>
    </dialog>
  );
}
