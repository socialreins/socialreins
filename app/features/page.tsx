import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, sitePage } from "@/components/site-header";
import { groups } from "@/lib/features";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Features: SocialReins",
  description: "Everything SocialReins does today: publishing to nine networks, scheduling, teams, post analytics, an API and an MCP server, with an inbox live on Bluesky.",
  ...publicPage("/features"),
};

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export default function Features() {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid w-full gap-10">
        <div className="grid max-w-2xl gap-2">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Features</h1>
          <p className="text-ink-soft">
            What SocialReins does today, in seven groups. Every feature is in the free self-hosted version. SocialReins Cloud is not open yet:{" "}
            <Link href="/#waitlist" className={link}>
              join the waitlist
            </Link>
            .
          </p>
        </div>

        <nav aria-label="Feature groups">
          <ul className="flex flex-wrap gap-2 text-sm font-bold">
            {groups.map((g) => (
              <li key={g.id}>
                <a href={`#${g.id}`} className="block rounded-full border-2 border-ink px-3.5 py-1 hover:bg-ink hover:text-paper">
                  {g.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {groups.map((g) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="grid scroll-mt-6 gap-4 border-t-2 border-ink/10 pt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id={`${g.id}-title`} className="font-display text-2xl font-extrabold tracking-tight">
                {g.name}
              </h2>
              {g.href && (
                <Link href={g.href} className={link}>
                  Learn more<span className="sr-only"> about {g.name}</span>
                </Link>
              )}
            </div>
            {g.note && <p className="justify-self-start rounded-lg bg-signal/10 px-3 py-1.5 text-sm font-bold text-signal-deep">{g.note}</p>}
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((i) => (
                <div key={i.name} className="rounded-2xl border border-ink/10 bg-paper p-4">
                  <dt className="font-display font-bold">{i.name}</dt>
                  <dd className="mt-1 text-[0.95rem] leading-snug text-ink-soft">{i.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <p>
          See <Link href="/post-types" className={link}>what you can post where</Link>, read the <Link href="/docs" className={link}>docs</Link>, or see{" "}
          <Link href="/compare" className={link}>how SocialReins compares</Link> with other tools.
        </p>
      </div>
    </main>
  );
}
