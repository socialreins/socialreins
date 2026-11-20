import type { Metadata } from "next";
import { Newsletters } from "@/components/newsletters";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins newsletters" };

export default function NewslettersPage() {
  return (
    <>
      <PageHeader title="Newsletters" />
      <Newsletters />
    </>
  );
}
