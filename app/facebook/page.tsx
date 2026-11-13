import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("facebook");

export default function Page() {
  return <NetworkPage slug="facebook" />;
}
