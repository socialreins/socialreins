import { DocPage, docMetadata } from "@/components/docs";

export const metadata = docMetadata("self-hosted", "ai");

export default function Page() {
  return <DocPage mode="self-hosted" guide="ai" />;
}
