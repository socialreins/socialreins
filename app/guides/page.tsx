import { GuidesIndex, guidesMetadata } from "@/components/guides";

export const metadata = guidesMetadata();

export default function Page() {
  return <GuidesIndex />;
}
