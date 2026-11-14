import { DocPage, docMetadata } from "@/components/docs";

export const metadata = docMetadata("cloud", "start");

export default function Page() {
  return <DocPage mode="cloud" guide="start" />;
}
