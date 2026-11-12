import type { Metadata } from "next";
import { AdminSettings } from "@/components/admin-settings";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Sign-up settings: SocialReins admin" };

export default function AdminSettingsPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Sign-up settings" />
      <AdminSettings />
    </div>
  );
}
