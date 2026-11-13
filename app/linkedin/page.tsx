import { NetworkPage, networkMetadata } from "@/components/network-page";

export const metadata = networkMetadata("linkedin");

export default function Page() {
  return <NetworkPage slug="linkedin" />;
}
