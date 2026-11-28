import { PostingCadence } from "@/components/guide-articles";
import { GuideArticle, guideMetadata } from "@/components/guides";
import { guide } from "@/lib/guides";

const g = guide("posting-cadence-small-team")!;

export const metadata = guideMetadata(g);

export default function Page() {
  return (
    <GuideArticle slug={g.slug}>
      <PostingCadence />
    </GuideArticle>
  );
}
