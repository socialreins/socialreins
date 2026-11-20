import type { Metadata } from "next";
import { Broadcasts } from "@/components/broadcasts";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins broadcasts" };

export default function BroadcastsPage() {
  return (
    <>
      <PageHeader title="Broadcasts" />
      <Broadcasts />
    </>
  );
}
