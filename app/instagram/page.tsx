import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("instagram");

export default function Page() {
  return <NetworkPage slug="instagram" />;
}
