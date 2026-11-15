import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, sitePage } from "@/components/site-header";
import { feature } from "@/lib/features";
import { networks } from "@/lib/networks";
import { publicPage } from "@/lib/seo";

// One public page per feature: app/features/<slug>/page.tsx is two lines that call these with its slug.
export function featureMetadata(slug: string): Metadata {
  const f = feature(slug)!;
  return { title: `${f.name}: SocialReins`, description: f.description, ...publicPage(`/features/${f.slug}`) };
}

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export function FeaturePage({ slug }: { slug: string }) {
  const f = feature(slug)!;
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid w-full gap-8">
        <div className="grid max-w-3xl gap-2">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{f.name}</h1>
          <p className="text-ink-soft">{f.intro}</p>
        </div>

        <div className="min-w-0 overflow-x-auto rounded-lg border border-ink/10 bg-paper">
          <table className="w-full border-collapse text-left text-[0.95rem] leading-snug">
            <caption className="sr-only">{f.name} by network</caption>
            <thead>
              <tr>
                <th scope="col" className="px-3 py-3 font-display font-extrabold">
                  Network
                </th>
                <th scope="col" className="px-3 py-3 font-display font-extrabold">
                  {f.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {networks.map((n) => {
                const state = f.support[n.slug] ?? "Not yet";
                return (
                  <tr key={n.slug}>
                    <th scope="row" className="w-2/5 border-t border-r border-ink/10 px-3 py-2.5 align-top font-bold">
                      <Link href={`/${n.slug}`} className="underline-offset-4 hover:underline">
                        {n.name}
                      </Link>
                    </th>
                    <td className={`border-t border-ink/10 px-3 py-2.5 align-top ${state === "Not yet" ? "text-ink-soft" : "font-semibold"}`}>
                      {state}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="legal grid max-w-3xl gap-4 leading-relaxed">
          {f.sections.map((s) => (
            <section key={s.heading} className="grid gap-4">
              <h2>{s.heading}</h2>
              {s.text && <p>{s.text}</p>}
              {s.bullets && (
                <ul>
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <p>
            See what you can post to each network on{" "}
            <Link href="/socials" className={link}>
              Social media
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
