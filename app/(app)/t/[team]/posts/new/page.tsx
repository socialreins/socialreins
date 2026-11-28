import type { Metadata } from "next";
import { Suspense } from "react";
import { PostEditor } from "@/components/post-editor";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New post on SocialReins" };

type Props = { searchParams: Promise<{ from?: string | string[]; testimonial?: string | string[] }> };

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

// ?from=<post id> starts the new post as a copy of that one (Duplicate); ?testimonial=<id> starts
// it from a testimonial's quote (Post it), handed over through sessionStorage.
async function Editor({ searchParams }: Props) {
  const params = await searchParams;
  const one = (v?: string | string[]) => (typeof v === "string" ? v : undefined);
  return <PostEditor from={one(params.from)} testimonial={one(params.testimonial)} />;
}
