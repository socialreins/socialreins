import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("pinterest");

export default function Page() {
  return <NetworkPage slug="pinterest" />;
}
