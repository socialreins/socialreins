import type { Metadata } from "next";
import { QueuePage } from "@/components/queue";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins queue" };

export default function Page() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Queue" />
      <QueuePage />
    </div>
  );
}
