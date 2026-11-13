import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("later");

export default function Page() {
  return <ComparePage slug="later" />;
}
