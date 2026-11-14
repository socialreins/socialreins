import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, sitePage } from "@/components/site-header";
import { rivals } from "@/lib/compare";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Compare SocialReins with other tools: SocialReins",
  description: "SocialReins next to PostSyncer, Manychat, Buffer, Hootsuite, Later and Postiz: what each one does, what it costs and where it fits.",
  ...publicPage("/compare"),
};

export default function Compare() {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid w-full max-w-3xl gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Compare SocialReins</h1>
        <p className="text-ink-soft">
          How SocialReins sits next to other tools, with what each one does better. Every fact about another tool comes from its own website and
          is linked on its page.
        </p>
      </div>
      <ul className="grid gap-3">
        {rivals.map((r) => (
          <li key={r.slug}>
            <Link href={`/compare/${r.slug}`} className="grid gap-1 rounded-lg border border-ink/10 bg-paper px-4 py-3 hover:border-ink">
              <span className="font-display text-lg font-extrabold">SocialReins vs {r.name}</span>
              <span className="text-ink-soft">{r.intro}</span>
            </Link>
          </li>
        ))}
      </ul>
      </div>
    </main>
  );
}
