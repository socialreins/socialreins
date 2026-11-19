import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("metricool");

export default function Page() {
  return <ComparePage slug="metricool" />;
}
