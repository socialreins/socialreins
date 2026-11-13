import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("x");

export default function Page() {
  return <NetworkPage slug="x" />;
}
