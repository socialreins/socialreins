import { ScheduleSeveral } from "@/components/guide-articles";
import { GuideArticle, guideMetadata } from "@/components/guides";
import { guide } from "@/lib/guides";

const g = guide("schedule-post-to-several-networks")!;

export const metadata = guideMetadata(g);

export default function Page() {
  return (
    <GuideArticle slug={g.slug}>
      <ScheduleSeveral />
    </GuideArticle>
  );
}
