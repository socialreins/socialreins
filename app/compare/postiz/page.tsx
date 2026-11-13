import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("postiz");

export default function Page() {
  return <ComparePage slug="postiz" />;
}
