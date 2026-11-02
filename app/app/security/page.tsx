import type { Metadata } from "next";
import { Security } from "@/components/security";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins sign-in and security" };

export default function Page() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Sign-in and security" />
      <div className="grid gap-10">
        <Security />
      </div>
    </div>
  );
}
