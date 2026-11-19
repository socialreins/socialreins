import type { Metadata } from "next";
import { Suspense } from "react";
import { Contacts } from "@/components/contacts";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins contacts" };

export default function ContactsPage() {
  return (
    <>
      <PageHeader title="Contacts" />
      <Suspense fallback={<p className="text-ink-soft">Loading the contacts...</p>}>
        <Contacts />
      </Suspense>
    </>
  );
}
