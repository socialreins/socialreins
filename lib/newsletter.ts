import { apiUrl } from "@/lib/waitlist";

const TIMEOUT_MS = 10_000;
const enc = encodeURIComponent;

export type SubscribeResult = "ok" | "invalid" | "gone" | "rate_limited" | "timeout" | "error";
export type NewsletterVerifyResult = { team: string } | "invalid" | "rate_limited" | "timeout" | "error";

const failed = (e: unknown) => (e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error");

// The same answer for a new email and a known one; brain mails a link to confirm. 404 means the page or its
// newsletter was switched off since the page loaded.
export async function subscribe(code: string, email: string): Promise<SubscribeResult> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/pages/${enc(code)}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "ok";
    if (res.status === 422) return "invalid";
    if (res.status === 404) return "gone";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return failed(e);
  }
}

// Confirms an email with the token from brain's link. Only a click calls this, never a page load, because mail
// scanners open links.
export async function verifyNewsletter(token: string): Promise<NewsletterVerifyResult> {
  if (!token) return "invalid";
  try {
    const res = await fetch(`${apiUrl}/v1/public/newsletter/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const team: unknown = (await res.json().catch(() => null))?.team;
      return { team: typeof team === "string" ? team : "" };
    }
    if (res.status === 422) return "invalid";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return failed(e);
  }
}

export type Subscriber = { id: string; email: string; confirmed: boolean; subscribed_at: string };

// The confirmed emails as a CSV for a mailing tool. Unconfirmed ones never leave: nobody agreed to mail them.
// A value a spreadsheet would run as a formula starts with a quote: a leading = or @, and a leading + or - unless
// the value is a plain address (letters, digits and . _ % + - only), which a mailing tool needs to read as it is.
const plain = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/;
export function subscribersCsv(list: Subscriber[]): string {
  const cell = (v: string) => {
    const safe = /^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !plain.test(v)) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = list.filter((s) => s.confirmed).map((s) => `${cell(s.email)},${cell(s.subscribed_at)}`);
  return ["email,subscribed_at", ...rows].join("\r\n") + "\r\n";
}
