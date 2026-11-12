import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminTeamsList } from "@/components/admin-lists";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Teams: SocialReins admin" };

export default function AdminTeamsPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader title="Teams" />
      <Suspense fallback={<p className="text-ink-soft">Loading teams...</p>}>
        <AdminTeamsList />
      </Suspense>
    </div>
  );
}
