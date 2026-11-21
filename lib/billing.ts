import { api } from "@/lib/auth";

export type Plan = {
  id: string;
  name: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};
// A limit of null is unlimited.
export type Billing = {
  enabled: boolean;
  plan: Plan | null;
  limits: { accounts: number | null; members: number | null; automation: number | null; contacts: number | null };
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
