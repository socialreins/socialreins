import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("bluesky");

export default function Page() {
  return <NetworkPage slug="bluesky" />;
}
