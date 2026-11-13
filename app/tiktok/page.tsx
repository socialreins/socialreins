import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("tiktok");

export default function Page() {
  return <NetworkPage slug="tiktok" />;
}
