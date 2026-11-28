import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader, sitePage } from "@/components/site-header";
import { author, guide, guides, longDate, site, type Guide } from "@/lib/guides";
import { publicPage } from "@/lib/seo";

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export function guidesMetadata(): Metadata {
  return {
    title: "Guides: SocialReins",
    description:
      "Practical guides to scheduling, approvals, self-hosting, inboxes and automations for small teams, from the team that builds SocialReins.",
    keywords: ["social media guides", "social media scheduling", "social media approvals", "self-hosted social media"],
    ...publicPage("/guides"),
  };
}

export function guideMetadata(g: Guide): Metadata {
  return {
    title: `${g.title}: SocialReins`,
    description: g.description,
    keywords: g.keywords,
    ...publicPage(`/guides/${g.slug}`),
  };
}

// The index: every guide, newest first is not useful because they are all current, so the order is the
// order in lib/guides.ts, which runs from the core flow outwards.
export function GuidesIndex() {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid w-full max-w-4xl gap-8">
        <div className="grid max-w-2xl gap-2">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Guides</h1>
          <p className="text-ink-soft">
            Practical guides for the people who run the accounts: scheduling, approvals, self-hosting, inboxes and automations. They describe
            what SocialReins does today, and they say plainly where a network or a plan sets a limit.
          </p>
          <p className="text-sm text-ink-soft">
            <a href="/guides/rss.xml" className={link}>
              RSS feed
            </a>
          </p>
        </div>
        <ul className="grid gap-5 md:grid-cols-2">
          {guides.map((g) => (
            <li key={g.slug}>
              <article className="grid h-full content-start gap-3 rounded-3xl border border-ink/10 bg-paper p-6">
                <h2 className="font-display text-2xl font-extrabold tracking-tight">
                  <Link href={`/guides/${g.slug}`} className="underline decoration-transparent decoration-2 underline-offset-4 hover:decoration-signal">
                    {g.title}
                  </Link>
                </h2>
                <p className="text-ink-soft">{g.intro}</p>
                <p className="mt-auto text-sm text-ink-soft">
                  Last updated{" "}
                  <time dateTime={g.updated}>{longDate(g.updated)}</time>
                </p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

// One article: the shared frame. The body comes from components/guide-articles.tsx, the FAQ from the guide's
// own data, so the visible answers and the FAQPage markup cannot drift apart.
export function GuideArticle({ slug, children }: { slug: string; children: ReactNode }) {
  const g = guide(slug);
  if (!g) throw new Error(`unknown guide: ${slug}`);
  const faq = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${site}/guides/${g.slug}`,
    mainEntity: g.faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  });
  const others = g.related.map((s) => guide(s)).filter((x): x is Guide => !!x);
  return (
    <main className={sitePage}>
      <SiteHeader />
      <article className="grid w-full max-w-3xl gap-6">
        <nav aria-label="Guides" className="text-sm">
          <Link href="/guides" className={link}>
            All guides
          </Link>
        </nav>
        <header className="grid gap-3">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{g.title}</h1>
          <p className="text-lg text-ink-soft">{g.intro}</p>
          <p className="text-sm text-ink-soft">
            By {author}. Last updated{" "}
            <time dateTime={g.updated}>{longDate(g.updated)}</time>.
          </p>
        </header>
        <div className="legal grid gap-4 leading-relaxed">{children}</div>
        <section aria-labelledby="questions" className="grid gap-3 border-t-2 border-ink/10 pt-6">
          <h2 id="questions" className="font-display text-2xl font-extrabold tracking-tight">
            Questions
          </h2>
          <dl className="grid gap-4">
            {g.faq.map((f) => (
              <div key={f.question} className="grid gap-1">
                <dt className="font-bold">{f.question}</dt>
                <dd className="text-ink-soft">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
        <nav aria-label="More guides" className="grid gap-2 border-t-2 border-ink/10 pt-6">
          <h2 className="font-display text-xl font-extrabold tracking-tight">More guides</h2>
          <ul className="grid gap-1">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/guides/${o.slug}`} className={link}>
                  {o.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/guides" className={link}>
                Every guide
              </Link>
            </li>
          </ul>
        </nav>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faq }} />
    </main>
  );
}
