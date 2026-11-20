import type { Metadata } from "next";
import { Suspense } from "react";
import { PostAnalytics } from "@/components/post-analytics";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins analytics" };

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" />
      <Suspense fallback={<p className="text-ink-soft">Loading the analytics...</p>}>
        <PostAnalytics />
      </Suspense>
    </>
  );
}
