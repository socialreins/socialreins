import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("postsyncer");

export default function Page() {
  return <ComparePage slug="postsyncer" />;
}
