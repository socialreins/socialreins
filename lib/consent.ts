import { useSyncExternalStore } from "react";

// The visitor's Google Analytics choice, kept in a first-party cookie for 6 months. Until it says "accepted",
// nothing from Google is loaded (components/analytics.tsx).
const COOKIE = "sr_consent";
const SIX_MONTHS = 60 * 60 * 24 * 183;
export const CHANGED = "sr-consent-changed";
export const REOPEN = "sr-consent-reopen";

// "none": no choice yet. "off": analytics is not configured, so there is nothing to ask. "pending": the server render.
export type Choice = "accepted" | "rejected" | "none" | "off" | "pending";

export function snapshot(): Choice {
  if (!(window as unknown as { __GA_ID?: string | null }).__GA_ID) return "off";
  const v = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return v === "accepted" || v === "rejected" ? v : "none";
}

export function saveChoice(choice: "accepted" | "rejected") {
  document.cookie = `${COOKIE}=${choice}; Max-Age=${SIX_MONTHS}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  window.dispatchEvent(new Event(CHANGED));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
};

export const useChoice = (): Choice => useSyncExternalStore(subscribe, snapshot, () => "pending");

// Rejecting after accepting: GA's own cookies (_ga, _ga_<id>) go too. They sit on the site's domain or a parent of it.
export function forgetGa() {
  const parts = location.hostname.split(".");
  const domains = ["", ...parts.map((_, i) => `; Domain=${parts.slice(i).join(".")}`)];
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (name === "_ga" || name.startsWith("_ga_")) for (const d of domains) document.cookie = `${name}=; Max-Age=0; Path=/${d}`;
  }
}
