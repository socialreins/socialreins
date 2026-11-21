import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("mixpost");

export default function Page() {
  return <ComparePage slug="mixpost" />;
}
