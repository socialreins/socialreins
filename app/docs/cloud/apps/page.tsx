import { DocPage, docMetadata } from "@/components/docs";

export const metadata = docMetadata("cloud", "apps");

export default function Page() {
  return <DocPage mode="cloud" guide="apps" />;
}
