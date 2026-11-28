import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SiteHeader, sitePage } from "@/components/site-header";
import { plans, questions } from "@/lib/pricing";
import { faqSchema, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/pricing");

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export default function Pricing() {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <JsonLd data={faqSchema(questions)} />
      <div className="grid w-full gap-10">
      <div className="grid max-w-2xl gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Pricing</h1>
        <p className="text-ink-soft">SocialReins Cloud, where we run everything for you, opens by invitation for now. Prices are in US dollars, and yearly is two months free. Or run SocialReins on your own server today, free.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => (
          <section key={p.name} aria-labelledby={`plan-${p.name.replace(/ /g, "-")}`} className={`grid content-start gap-5 rounded-3xl bg-paper p-6 ${p.name === "Self-hosted" ? "border border-ink/10" : "border-2 border-ink"}`}>
            <div className="grid gap-1">
              <p className="justify-self-start rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold text-signal-deep">{p.tag}</p>
              <h2 id={`plan-${p.name.replace(/ /g, "-")}`} className="font-display text-xl font-extrabold">
                {p.name}
              </h2>
              <p className="font-display text-3xl font-extrabold tracking-tight">{p.price}</p>
              <p className="text-ink-soft">{p.note}</p>
            </div>
            <ul className="grid list-disc gap-2 pl-5 leading-snug">
              {p.points.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {p.cta.external ? (
              <a href={p.cta.href} target="_blank" rel="noopener noreferrer" className="justify-self-start rounded-full border-2 border-ink px-5 py-2.5 font-bold hover:bg-ink hover:text-paper">
                {p.cta.label}
              </a>
            ) : (
              <Link href={p.cta.href} className="justify-self-start rounded-full bg-ink px-5 py-2.5 font-bold text-paper hover:bg-signal-deep">
                {p.cta.label}
              </Link>
            )}
          </section>
        ))}
      </div>

      <div className="legal grid max-w-2xl gap-4 leading-relaxed">
        <h2>Questions</h2>
        <dl className="grid gap-4">
          {questions.map(([q, a]) => (
            <div key={q} className="grid gap-1">
              <dt className="font-bold">{q}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
        <p>
          See <Link href="/post-types" className={link}>what you can post where</Link> and{" "}
          <Link href="/compare" className={link}>how SocialReins compares</Link> with other tools.
        </p>
      </div>
      </div>
    </main>
  );
}
