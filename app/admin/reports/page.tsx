import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminReports } from "@/components/admin-reports";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Page reports: SocialReins admin" };

export default function AdminReportsPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader title="Page reports" />
      <Suspense fallback={<p className="text-ink-soft">Loading the reports...</p>}>
        <AdminReports />
      </Suspense>
    </div>
  );
}
