import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("buffer");

export default function Page() {
  return <ComparePage slug="buffer" />;
}
