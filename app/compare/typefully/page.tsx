import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("typefully");

export default function Page() {
  return <ComparePage slug="typefully" />;
}
