import type { Metadata } from "next";
import Link from "next/link";
import { docModes, docPath, docTitle, guides } from "@/components/docs";
import { SiteHeader, sitePage } from "@/components/site-header";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Docs",
  description: "SocialReins docs: install it on your own server, connect accounts and publish, and connect an AI assistant. For self-hosted and cloud.",
  ...publicPage("/docs"),
};

const about = {
  "self-hosted": { name: "Self-hosted", tag: "Works today", note: "Run SocialReins on your own server, free, with every feature." },
  cloud: { name: "Cloud", tag: "Not open yet", note: "We run it for you. Join the waitlist to hear when it opens." },
};

export default function Docs() {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid gap-8">
        <div className="grid max-w-2xl gap-2">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Docs</h1>
          <p className="text-ink-soft">Pick how you run SocialReins. Every guide has both versions, and you can switch between them on any page.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {docModes.map((m) => (
            <section key={m} aria-labelledby={`docs-${m}`} className="grid content-start gap-4 rounded-3xl border border-ink/10 bg-paper p-6">
              <p className="justify-self-start rounded-full bg-signal/15 px-2.5 py-0.5 text-xs font-bold text-signal-deep">{about[m].tag}</p>
              <h2 id={`docs-${m}`} className="font-display text-2xl font-extrabold tracking-tight">
                {about[m].name}
              </h2>
              <p className="text-ink-soft">{about[m].note}</p>
              <ul className="grid gap-2">
                {guides.map((g) => (
                  <li key={g}>
                    <Link href={docPath(m, g)} className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">
                      {docTitle(m, g)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
