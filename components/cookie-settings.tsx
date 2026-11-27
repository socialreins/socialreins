"use client";

import { REOPEN, useChoice } from "@/lib/consent";

// Opens the cookie banner again. Not shown where analytics is off, since there is nothing to choose.
export function CookieSettings({ className }: { className?: string }) {
  const choice = useChoice();
  if (choice === "off" || choice === "pending") return null;
  return (
    <button id="cookie-settings" type="button" className={className} onClick={() => window.dispatchEvent(new Event(REOPEN))}>
      Cookie settings
    </button>
  );
}
