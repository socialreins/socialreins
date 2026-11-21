import type { Metadata } from "next";
import { BillingPage } from "@/components/billing";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins plans" };

export default function Page() {
  return (
    <>
      <PageHeader title="Plans" />
      <BillingPage />
    </>
  );
}
