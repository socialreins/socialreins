import type { Metadata } from "next";
import { TeamLink as Link } from "@/components/team-link";
import { Dashboard } from "@/components/dashboard";
import { Icon, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins" };

// The app's landing page; brain's emailed sign-in link lands here.
export default function AppHome() {
  return (
    <>
      <PageHeader title="Home">
        <Link href="/posts/new" className="btn btn-primary">
          <Icon name="plus" className="size-4" />
          New post
        </Link>
      </PageHeader>
      <Dashboard />
    </>
  );
}
