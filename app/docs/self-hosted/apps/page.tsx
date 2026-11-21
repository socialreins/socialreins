import { DocPage, docMetadata } from "@/components/docs";

export const metadata = docMetadata("self-hosted", "apps");

export default function Page() {
  return <DocPage mode="self-hosted" guide="apps" />;
}
