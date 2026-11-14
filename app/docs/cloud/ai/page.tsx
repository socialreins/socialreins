import { DocPage, docMetadata } from "@/components/docs";

export const metadata = docMetadata("cloud", "ai");

export default function Page() {
  return <DocPage mode="cloud" guide="ai" />;
}
