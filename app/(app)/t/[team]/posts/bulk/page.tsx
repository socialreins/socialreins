import type { Metadata } from "next";
import { BulkUpload } from "@/components/bulk-upload";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Bulk upload on SocialReins" };

export default function Page() {
  return (
    <div className="max-w-6xl">
      <PageHeader title="Bulk upload" back={{ href: "/posts", label: "Posts" }} />
      <BulkUpload />
    </div>
  );
}
