import { ComparePage, compareMetadata } from "@/components/compare-page";

export const metadata = compareMetadata("chatfuel");

export default function Page() {
  return <ComparePage slug="chatfuel" />;
}
