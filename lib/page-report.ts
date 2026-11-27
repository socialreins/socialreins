import { apiUrl, captchaError, type Captcha } from "@/lib/waitlist";

const TIMEOUT_MS = 10_000;

export const REPORT_REASONS = [
  { value: "phishing", label: "Phishing or a scam" },
  { value: "spam", label: "Spam" },
  { value: "illegal", label: "Illegal content" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export type ReportResult = "ok" | "invalid" | "gone" | "rate_limited" | "timeout" | "error" | Captcha;

// "Report this page": brain stores the report and mails the operators. 404 means the page is no longer public.
export async function reportPage(code: string, report: { reason: ReportReason; message: string; email: string; token?: string | null }): Promise<ReportResult> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/pages/${encodeURIComponent(code)}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: report.reason,
        ...(report.message.trim() && { message: report.message.trim() }),
        ...(report.email.trim() && { email: report.email.trim() }),
        ...(report.token && { turnstile_token: report.token }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "ok";
    if (res.status === 404) return "gone";
    if (res.status === 429) return "rate_limited";
    if (res.status === 422 || res.status === 503) {
      const captcha = await captchaError(res);
      if (captcha) return captcha;
      return res.status === 422 ? "invalid" : "error";
    }
    return "error";
  } catch (e) {
    return e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";
  }
}
