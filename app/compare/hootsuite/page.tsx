import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("hootsuite");

export default function Page() {
  return <ComparePage slug="hootsuite" />;
}
