import type { Metadata } from "next";
import { Suspense } from "react";
import { Admin } from "@/components/admin";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Waitlist: SocialReins admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Waitlist" />
      <Suspense fallback={<p className="text-ink-soft">Loading the waitlist...</p>}>
        <Admin />
      </Suspense>
    </div>
  );
}
