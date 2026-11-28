import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "@/components/inbox";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins comments" };

export default function CommentsPage() {
  return (
    <>
      <PageHeader title="Comments" />
      <Suspense fallback={<p className="text-ink-soft">Loading the comments...</p>}>
        <Inbox mode="comments" />
      </Suspense>
    </>
  );
}
