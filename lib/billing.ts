import { api, type Failure } from "@/lib/auth";

export type Plan = {
  id: string;
  name: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  // A free plan an admin gave: nothing to pay or manage. Optional until brain sends it.
  comped?: boolean;
};
// A limit of null is unlimited.
export type Billing = {
  enabled: boolean;
  plan: Plan | null;
  limits: { accounts: number | null; members: number | null; automation: boolean; contacts: number | null };
  usage: { accounts: number; members: number };
};
export type Credits = { x: number; ai: number };
export type Provider = "anthropic" | "openai";
export type AiKey = { provider: Provider; last4: string; updated_at: string };

export const getBilling = () => api<Billing>("/v1/team/billing");
export const getCredits = () => api<Credits>("/v1/team/credits");
// Owners and admins only. 404 (not_found) means no key is set; the key is never sent back, only its last 4 characters.
export const getAiKey = () => api<AiKey>("/v1/team/ai-key");
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required; a wrong shape is invalid_key.
export const setAiKey = (provider: Provider, key: string) => api<AiKey>("/v1/team/ai-key", "PUT", { provider, key });
export const removeAiKey = () => api("/v1/team/ai-key", "DELETE");

export type PlanChoice = "scheduler" | "automation";
export type Interval = "year" | "month";
// Only Stripe's own pages are followed, so a wrong or tampered answer can't send the browser elsewhere.
export function stripeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.port === "" && ["checkout.stripe.com", "billing.stripe.com"].includes(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}
// A missing or foreign url is the same as Stripe failing: stripe_failed.
const toStripe = (r: { url?: unknown } | Failure): { url: string } | Failure => {
  if (typeof r === "string") return (r as string) === "ok" ? "stripe_failed" : r;
  const url = stripeUrl(r?.url);
  return url ? { url } : "stripe_failed";
};
// Owner only, and a sign-in from the last 10 minutes (reauth_required). Both answer {url}, a Stripe page to send the browser to.
export const startCheckout = async (plan: PlanChoice, interval: Interval = "year") =>
  toStripe(await api<{ url: string }>("/v1/team/billing/checkout", "POST", { plan, interval }));
// One-time X credit packs (decision 0006): the webhook grants the credits once Stripe reports the payment.
export type Pack = "x100" | "x500";
export const buyCredits = async (pack: Pack) => toStripe(await api<{ url: string }>("/v1/team/billing/credits", "POST", { pack }));
export const openPortal = async () => toStripe(await api<{ url: string }>("/v1/team/billing/portal", "POST", {}));
// A plan that counts as live: the team has one and can use it.
export const isLive = (p: Plan | null): p is Plan => !!p && ["trialing", "active", "past_due"].includes(p.status);
