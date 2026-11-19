import type { Metadata } from "next";
import { Suspense } from "react";
import { NewAutomation } from "@/components/automations";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New automation on SocialReins" };

export default function NewAutomationPage() {
  return (
    <>
      <PageHeader title="New automation" back={{ href: "/automations", label: "Automations" }} />
      <Suspense fallback={<p className="text-ink-soft">Loading...</p>}>
        <NewAutomation />
      </Suspense>
    </>
  );
}
