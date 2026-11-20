import type { Metadata } from "next";
import { NewsletterDraft } from "@/components/newsletters";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New newsletter on SocialReins" };

export default function NewNewsletterPage() {
  return (
    <>
      <PageHeader title="New newsletter" back={{ href: "/newsletters", label: "Newsletters" }} />
      <NewsletterDraft />
    </>
  );
}
