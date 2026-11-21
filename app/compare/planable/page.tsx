import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("planable");

export default function Page() {
  return <ComparePage slug="planable" />;
}
