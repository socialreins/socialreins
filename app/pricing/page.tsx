import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pricing: SocialReins",
  description: "SocialReins Cloud is the standard way to use it and is in early access, with no price set yet. Self-hosting is free, with every feature.",
  ...publicPage("/pricing"),
};

const repo = "https://github.com/socialreins/socialreins";
const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

// Cloud has no price yet (plan/migration.md, phase 5): say so plainly and promise nothing.
const plans = [
  {
    name: "Cloud",
    tag: "The standard way",
    price: "Price not set yet",
    note: "We run it for you. This is how most people will use SocialReins.",
    points: [
      "Every feature, the same as the self-hosted version.",
      "Nothing to install, update or keep running.",
      "We register the apps with each network, so you only sign in.",
      "Early access is by invitation from the waitlist.",
      "Early access is free for now. It will become a paid subscription, and people on the waitlist hear the price first.",
    ],
    cta: { label: "Join the waitlist", href: "/#waitlist", external: false },
  },
  {
    name: "Self-hosted",
    tag: "The free way",
    price: "Free",
    note: "Open source, on your own server, free for good.",
    points: [
      "Every feature. There is no paid tier in the code.",
      "All eight networks, and you turn on only the ones you want.",
      "Your data stays on your own server, in your own Postgres database.",
      "One Docker Compose command to start, one line to update.",
      "You register your own developer app with each network you use, except Bluesky, which needs none.",
      "Report problems and ask questions on GitHub.",
    ],
    cta: { label: "Read the self-host guide", href: `${repo}#self-host`, external: true },
  },
];

const questions: [string, string][] = [
  ["Is the self-hosted version limited?", "No. There are no plan limits: it is the same code that runs the cloud version, under the AGPL-3.0 license, and nothing is held back for paying customers."],
  ["What will the cloud version cost?", "We have not set a price. We will publish it here before anyone is charged, and tell the waitlist first."],
  ["Does self-hosting cost anything at all?", "SocialReins itself is free. You pay for your own server, and X charges for its API. The other networks do not charge for posting."],
  ["Can I try the cloud version now?", "Join the waitlist. We let people in a few at a time while it is in early access."],
];

export default function Pricing() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-10 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <div className="grid max-w-2xl gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Pricing</h1>
        <p className="text-ink-soft">SocialReins Cloud is the standard way to use it: we run everything. If you want it free, run it yourself.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {plans.map((p) => (
          <section key={p.name} aria-labelledby={`plan-${p.name}`} className={`grid content-start gap-5 rounded-3xl bg-paper p-6 ${p.name === "Cloud" ? "border-2 border-ink" : "border border-ink/10"}`}>
            <div className="grid gap-1">
              <p className="justify-self-start rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold text-signal-deep">{p.tag}</p>
              <h2 id={`plan-${p.name}`} className="font-display text-xl font-extrabold">
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
    </main>
  );
}
