import type { Metadata } from "next";
import { Suspense } from "react";
import { PostEditor } from "@/components/post-editor";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New post on SocialReins" };

type Props = { searchParams: Promise<{ from?: string | string[] }> };

export default function NewPostPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader title="New post" back={{ href: "/posts", label: "Posts" }} />
      <Suspense fallback={<p className="text-ink-soft">Loading the editor...</p>}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// ?from=<post id> starts the new post as a copy of that one (Duplicate).
async function Editor({ searchParams }: Props) {
  const from = (await searchParams).from;
  return <PostEditor from={typeof from === "string" ? from : undefined} />;
}
