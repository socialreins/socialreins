import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("manychat");

export default function Page() {
  return <ComparePage slug="manychat" />;
}
