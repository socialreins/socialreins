import type { Metadata } from "next";
import { LibraryPage } from "@/components/library";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins library" };

export default function Page() {
  return (
    <div className="max-w-5xl">
      <PageHeader title="Library" />
      <LibraryPage />
    </div>
  );
}
