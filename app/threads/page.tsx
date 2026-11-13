import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("threads");

export default function Page() {
  return <NetworkPage slug="threads" />;
}
