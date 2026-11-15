import { FeaturePage, featureMetadata } from "@/components/feature-page";

export const metadata = featureMetadata("inboxes");

export default function Page() {
  return <FeaturePage slug="inboxes" />;
}
