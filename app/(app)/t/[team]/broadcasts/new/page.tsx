import type { Metadata } from "next";
import { BroadcastForm } from "@/components/broadcasts";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New broadcast on SocialReins" };

export default function NewBroadcastPage() {
  return (
    <>
      <PageHeader title="New broadcast" back={{ href: "/broadcasts", label: "Broadcasts" }} />
      <BroadcastForm />
    </>
  );
}
