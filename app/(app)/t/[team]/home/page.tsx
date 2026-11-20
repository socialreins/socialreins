import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins" };

// The app's landing page; brain's emailed sign-in link lands here. Its actions sit in the Dashboard's own header row.
export default function AppHome() {
  return (
    <>
      <PageHeader title="Home" />
      <Dashboard />
    </>
  );
}
