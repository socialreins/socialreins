import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminUsersList } from "@/components/admin-lists";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Users: SocialReins admin" };

export default function AdminUsersPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader title="Users" />
      <Suspense fallback={<p className="text-ink-soft">Loading users...</p>}>
        <AdminUsersList />
      </Suspense>
    </div>
  );
}
