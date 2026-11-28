import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { SiteHeader, sitePage } from "@/components/site-header";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/contact");

export default function Contact() {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid w-full max-w-2xl gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Contact us</h1>
        <p className="text-ink-soft">Questions, account deletion or anything else: send a message and we reply by email.</p>
      </div>
      <ContactForm />
      </div>
    </main>
  );
}
