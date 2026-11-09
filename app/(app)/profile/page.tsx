import type { Metadata } from "next";
import { Profile } from "@/components/profile";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins profile" };

export default function Page() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" />
      <Profile />
    </div>
  );
}
