import { OpenSourceHosted } from "@/components/guide-articles";
import { GuideArticle, guideMetadata } from "@/components/guides";
import { guide } from "@/lib/guides";

const g = guide("open-source-vs-hosted-social-media-tools")!;

export const metadata = guideMetadata(g);

export default function Page() {
  return (
    <GuideArticle slug={g.slug}>
      <OpenSourceHosted />
    </GuideArticle>
  );
}
