import type { Metadata } from "next";
import { Suspense } from "react";
import { BroadcastDetail } from "@/components/broadcasts";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Broadcast on SocialReins" };

type Params = { params: Promise<{ id: string }> };

export default function BroadcastPage({ params }: Params) {
  return (
    <>
      <PageHeader title="Broadcast" back={{ href: "/broadcasts", label: "Broadcasts" }} />
      <Suspense fallback={<p className="text-ink-soft">Loading the broadcast...</p>}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}

async function Detail({ params }: Params) {
  return <BroadcastDetail id={(await params).id} />;
}
