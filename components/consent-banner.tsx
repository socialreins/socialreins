"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { tracked } from "@/lib/ga";
import { REOPEN, saveChoice, useChoice } from "@/lib/consent";

const choiceButton = "btn btn-secondary border-ink";

// Asks once, on the public pages where Google Analytics would run, before anything from Google loads.
// Reject and Accept look the same; no choice means no analytics. "Cookie settings" (components/cookie-settings.tsx) asks again.
export function ConsentBanner() {
  const path = usePathname();
  const choice = useChoice();
  // The address where Cookie settings was pressed, so leaving that page closes it.
  const [asked, setAsked] = useState<string | null>(null);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    const open = () => setAsked(location.pathname);
    window.addEventListener(REOPEN, open);
    return () => window.removeEventListener(REOPEN, open);
  }, []);
  const again = asked === path;
  useEffect(() => {
    if (again) box.current?.focus();
  }, [again]);

  const asking =
    choice === "none" ||
    (again && (choice === "accepted" || choice === "rejected"));
  if (!asking || !tracked(path)) return null;

  const pick = (c: "accepted" | "rejected") => {
    saveChoice(c);
    if (again) document.getElementById("cookie-settings")?.focus();
    setAsked(null);
  };

  return (
    <>
      <section
        ref={box}
        tabIndex={-1}
        aria-label="Cookie choice"
        className="fixed inset-x-3 bottom-3 z-50 mx-auto grid max-w-2xl gap-3 rounded-2xl border-2 border-ink bg-paper p-4 text-ink shadow-[4px_4px_0_var(--color-signal)] outline-none sm:grid-cols-[1fr_auto] sm:items-center sm:gap-5 sm:p-5"
      >
        <p className="text-sm leading-relaxed">
          We would like to use Google Analytics to count visits to our public
          pages. It sets cookies, and only if you accept. Either choice is fine
          and you can change it later. See the{" "}
          <Link
            href="/privacy#cookies"
            className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={choiceButton}
            onClick={() => pick("rejected")}
          >
            Reject
          </button>
          <button
            type="button"
            className={choiceButton}
            onClick={() => pick("accepted")}
          >
            Accept
          </button>
        </div>
      </section>
      <div aria-hidden="true" className="h-52 sm:h-32" />
    </>
  );
}
