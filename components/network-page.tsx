import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { network, networks } from "@/lib/networks";
import { publicPage } from "@/lib/seo";

// One public page per network: app/<slug>/page.tsx is two lines that call these with its slug.
export function networkMetadata(slug: string): Metadata {
  const n = network(slug)!;
  return {
    title: `What you can post to ${n.name}: SocialReins`,
    description: n.description,
    ...publicPage(`/${n.slug}`),
  };
}

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export function NetworkPage({ slug }: { slug: string }) {
  const n = network(slug)!;
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">What you can post to {n.name}</h1>
        <p className="text-ink-soft">
          What SocialReins publishes to {n.account} today, with the limits {n.name} sets.
        </p>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-ink/10 bg-paper">
        <table className="w-full border-collapse text-left text-[0.95rem] leading-snug">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-3 font-display font-extrabold">
                Post type
              </th>
              <th scope="col" className="px-3 py-3 font-display font-extrabold">
                On {n.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {n.rows.map(([type, value]) => (
              <tr key={type}>
                <th scope="row" className="w-2/5 border-t border-r border-ink/10 px-3 py-2.5 align-top font-bold">
                  {type}
                </th>
                <td className={`border-t border-ink/10 px-3 py-2.5 align-top ${value.startsWith("Yes") ? "font-semibold" : "text-ink-soft"}`}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legal grid gap-4 leading-relaxed">
        {n.sections.map((s) => (
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
          See every network side by side on{" "}
          <Link href="/post-types" className={link}>
            What you can post where
          </Link>
          .
        </p>
        <nav aria-label="Other networks">
          <ul className="!flex !list-none flex-wrap gap-x-4 gap-y-1 !pl-0">
            {networks
              .filter((o) => o.slug !== n.slug)
              .map((o) => (
                <li key={o.slug}>
                  <Link href={`/${o.slug}`} className={link}>
                    {o.name}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
