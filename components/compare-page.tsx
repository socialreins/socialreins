import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { CHECKED, rival, rivals } from "@/lib/compare";
import { publicPage } from "@/lib/seo";

// One public page per tool: app/compare/<slug>/page.tsx calls these with its slug.
export function compareMetadata(slug: string): Metadata {
  const r = rival(slug)!;
  return { title: `SocialReins vs ${r.name}: SocialReins`, description: r.description, ...publicPage(`/compare/${r.slug}`) };
}

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";
const cell = "border-t border-ink/10 px-3 py-2.5 align-top";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
      <LogoMark className="size-9" />
      SocialReins
    </Link>
  );
}

export function ComparePage({ slug }: { slug: string }) {
  const r = rival(slug)!;
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-8 px-5 py-12">
      <Brand />
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">SocialReins vs {r.name}</h1>
        <p className="text-ink-soft">{r.intro}</p>
        <p className="text-sm text-ink-soft">
          What we say about {r.name} comes from its own website, checked on {CHECKED}. Prices and plans change, so check its site before you
          decide.
        </p>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-ink/10 bg-paper" tabIndex={0} role="region" aria-label={`SocialReins and ${r.name} compared`}>
        <table className="w-full min-w-[36rem] border-collapse text-left text-[0.95rem] leading-snug">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Topic</span>
              </th>
              <th scope="col" className="px-3 py-3 font-display font-extrabold">
                SocialReins
              </th>
              <th scope="col" className="px-3 py-3 font-display font-extrabold">
                {r.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.topic}>
                <th scope="row" className={`${cell} w-1/5 border-r font-bold`}>
                  {row.topic}
                </th>
                <td className={cell}>{row.us}</td>
                <td className={cell}>{row.them}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legal grid gap-4 leading-relaxed">
        <h2>Which one fits you</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <section className="grid content-start gap-3">
            <h3 className="font-bold">Pick {r.name} if</h3>
            <ul>
              {r.pickThem.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
          <section className="grid content-start gap-3">
            <h3 className="font-bold">Pick SocialReins if</h3>
            <ul>
              {r.pickUs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        </div>

        <h2>Sources</h2>
        <ul>
          {r.sources.map((s) => (
            <li key={s} className="break-all">
              <a href={s} target="_blank" rel="noopener noreferrer nofollow" className={link}>
                {s.replace(/^https:\/\/(www\.)?/, "")}
              </a>
            </li>
          ))}
        </ul>
        <p>
          Found something wrong or out of date?{" "}
          <Link href="/contact" className={link}>
            Tell us
          </Link>{" "}
          and we will fix it. {r.name} is a trademark of its owner; SocialReins is not connected to it.
        </p>
        <nav aria-label="Other comparisons">
          <ul className="!flex !list-none flex-wrap !gap-x-4 !gap-y-1 !pl-0">
            {rivals
              .filter((o) => o.slug !== r.slug)
              .map((o) => (
                <li key={o.slug}>
                  <Link href={`/compare/${o.slug}`} className={link}>
                    vs {o.name}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
