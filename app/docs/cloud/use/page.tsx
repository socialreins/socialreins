import { DocPage, docMetadata } from "@/components/docs";

export const metadata = docMetadata("cloud", "use");

export default function Page() {
  return <DocPage mode="cloud" guide="use" />;
}
