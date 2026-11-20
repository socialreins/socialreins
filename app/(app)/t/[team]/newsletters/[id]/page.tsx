import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsletterDetail } from "@/components/newsletters";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Newsletter on SocialReins" };

type Params = { params: Promise<{ id: string }> };

export default function NewsletterPage({ params }: Params) {
  return (
    <>
      <PageHeader title="Newsletter" back={{ href: "/newsletters", label: "Newsletters" }} />
      <Suspense fallback={<p className="text-ink-soft">Loading the newsletter...</p>}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}

async function Detail({ params }: Params) {
  return <NewsletterDetail id={(await params).id} />;
}
