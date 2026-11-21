import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("agorapulse");

export default function Page() {
  return <ComparePage slug="agorapulse" />;
}
