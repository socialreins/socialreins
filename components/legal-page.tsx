import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader, sitePage } from "@/components/site-header";

export const updated = "29 October 2026";

// Shared frame for /privacy and /terms: plain reading text, one column.
// A page whose text changed later passes its own date.
export function LegalPage({ title, updated: date = updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid w-full max-w-2xl gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-ink-soft">Last updated {date}</p>
      </div>
      <div className="legal grid gap-4 leading-relaxed">{children}</div>
      </div>
    </main>
  );
}

export const ContactLink = () => (
  <Link href="/contact" className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">
    contact us
  </Link>
);
