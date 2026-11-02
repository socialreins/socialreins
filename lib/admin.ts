import { api } from "@/lib/auth";

export type Signup = { id: string; email: string; source: string; created_at: string; verified_at: string | null };
export type Waitlist = { total: number; verified: number; signups: Signup[] };
// null lists everyone; true or false only confirmed or unconfirmed signups.
export type Verified = boolean | null;

// The `?verified=` value of the admin page, as brain takes it; anything else means all.
export const parseVerified = (v: string | null): Verified => (v === "true" ? true : v === "false" ? false : null);

// Site admins only: brain answers 403 forbidden to everyone else. Newest first.
export const listWaitlist = (verified: Verified) =>
  api<Waitlist>(`/v1/admin/waitlist${verified === null ? "" : `?verified=${verified}`}`);
