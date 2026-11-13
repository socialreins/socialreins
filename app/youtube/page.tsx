import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("youtube");

export default function Page() {
  return <NetworkPage slug="youtube" />;
}
