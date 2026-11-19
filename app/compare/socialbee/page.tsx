import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("socialbee");

export default function Page() {
  return <ComparePage slug="socialbee" />;
}
