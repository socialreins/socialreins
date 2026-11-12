import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin-overview";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Overview: SocialReins admin" };

export default function AdminHome() {
  return (
    <div className="max-w-5xl">
      <PageHeader title="Overview" />
      <AdminOverview />
    </div>
  );
}
