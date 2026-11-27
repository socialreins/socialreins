export type Captcha = "captcha_failed" | "captcha_unavailable";
export type WaitlistResult = "joined" | "invalid" | "rate_limited" | "timeout" | "error";

declare global {
  interface Window {
    __BRAIN_URL?: string;
  }
}

// Set by /config.js from BRAIN_URL at run time; the root layout loads it before any app code runs.
export const apiUrl = (typeof window === "undefined" ? undefined : window.__BRAIN_URL) ?? "http://localhost:8080";

const TIMEOUT_MS = 10_000;

// Brain's error code when a Turnstile check failed (422) or Turnstile itself couldn't be reached (503), else null.
export async function captchaError(res: Response): Promise<Captcha | null> {
  const code: unknown = (await res.json().catch(() => null))?.error;
  return code === "captcha_failed" || code === "captcha_unavailable" ? code : null;
}

// The API answers 200 for a new email and for a duplicate, so both count as joined, and brain then emails a
// link that confirms the spot (there is no Turnstile on the waitlist). The answer carries a `name_token` that
// lets this browser add a name right after; for an email already on the list it opens nothing.
export async function joinWaitlist(
  email: string,
  source = "landing",
): Promise<{ result: WaitlistResult; nameToken: string | null }> {
  try {
    const res = await fetch(`${apiUrl}/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const token: unknown = (await res.json().catch(() => null))?.name_token;
      return { result: "joined", nameToken: typeof token === "string" ? token : null };
    }
    if (res.status === 422) return { result: "invalid", nameToken: null };
    if (res.status === 429) return { result: "rate_limited", nameToken: null };
    return { result: "error", nameToken: null };
  } catch (e) {
    return { result: e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error", nameToken: null };
  }
}

export type NameResult = "saved" | "invalid" | "rate_limited" | "timeout" | "error";

// Adds the optional name with the token the join answered. Brain answers 200 for any well-formed token, so a
// "saved" does not prove the name was stored; 422 means the name is not allowed (empty, over 80 characters).
export async function addWaitlistName(token: string, name: string): Promise<NameResult> {
  try {
    const res = await fetch(`${apiUrl}/v1/waitlist/name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "saved";
    if (res.status === 422) return "invalid";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";
  }
}

// People who confirmed their email; null when brain can't say.
export async function waitlistCount(): Promise<number | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/waitlist/count`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const count: unknown = res.ok ? (await res.json())?.count : null;
    return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

export const waitlistCountText = (n: number) => `${n.toLocaleString()} ${n === 1 ? "person" : "people"} on the waitlist`;

export type VerifyResult = "verified" | "invalid" | "rate_limited" | "timeout" | "error";

// Confirms a spot with the token from brain's email link. Only a click calls this, never a page load,
// because mail scanners open links.
export async function verifyWaitlist(token: string): Promise<VerifyResult> {
  if (!token) return "invalid";
  try {
    const res = await fetch(`${apiUrl}/v1/waitlist/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "verified";
    if (res.status === 422) return "invalid";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";
  }
}
