import type { Metadata } from "next";
import { TeamLink as Link } from "@/components/team-link";
import { Posts } from "@/components/posts";
import { Icon, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar">
        <Link href="/posts/new" className="btn btn-primary">
          <Icon name="plus" className="size-4" />
          New post
        </Link>
      </PageHeader>
      <Posts view="calendar" />
    </>
  );
}
