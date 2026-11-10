import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins plans" };

// Billing doesn't exist yet: every team is on the Free plan.
export default function BillingPage() {
  return (
    <>
      <PageHeader title="Plans" />
      <section aria-labelledby="plan-heading" className="card grid max-w-xl gap-2 p-5">
        <p className="text-sm text-ink-soft">Current plan</p>
        <h2 id="plan-heading" className="font-display text-xl font-bold">
          Free
        </h2>
        <p>Your team is on the Free plan. Paid plans are coming soon.</p>
      </section>
    </>
  );
}
