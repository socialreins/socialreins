import type { Metadata } from "next";
import { FeedsPage } from "@/components/feeds";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins feeds" };

export default function Page() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Feeds" />
      <FeedsPage />
    </div>
  );
}
