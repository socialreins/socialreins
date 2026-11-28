import { ApprovalWorkflow } from "@/components/guide-articles";
import { GuideArticle, guideMetadata } from "@/components/guides";
import { guide } from "@/lib/guides";

const g = guide("social-media-approval-workflow")!;

export const metadata = guideMetadata(g);

export default function Page() {
  return (
    <GuideArticle slug={g.slug}>
      <ApprovalWorkflow />
    </GuideArticle>
  );
}
