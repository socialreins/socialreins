import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("publer");

export default function Page() {
  return <ComparePage slug="publer" />;
}
