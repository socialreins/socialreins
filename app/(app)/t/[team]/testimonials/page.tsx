import type { Metadata } from "next";
import { TestimonialsPage } from "@/components/testimonials";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Testimonials on SocialReins" };

export default function Page() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Testimonials" />
      <TestimonialsPage />
    </div>
  );
}
