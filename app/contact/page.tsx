import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { SiteHeader } from "@/components/site-header";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Contact: SocialReins",
  description: "Send the SocialReins team a message with a question or feedback about the open-source social media manager. We reply by email.",
  ...publicPage("/contact"),
};

export default function Contact() {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-8 px-5 py-12">
      <SiteHeader />
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Contact us</h1>
        <p className="text-ink-soft">Questions, account deletion or anything else: send a message and we reply by email.</p>
      </div>
      <ContactForm />
    </main>
  );
}
