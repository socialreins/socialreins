import type { Metadata } from "next";
import { TeamSettings } from "@/components/team";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins team" };

export default function Page() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Team" />
      <div className="grid grid-cols-1 gap-6">
        <TeamSettings />
      </div>
    </div>
  );
}
