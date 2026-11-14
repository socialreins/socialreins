import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, sitePage } from "@/components/site-header";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pricing: SocialReins",
  description: "Self-hosting SocialReins is free, with every feature, and works today. SocialReins Cloud is not open yet and has no price set.",
  ...publicPage("/pricing"),
};

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

// Cloud has no price yet (plan/migration.md, phase 5): say so plainly and promise nothing.
const plans = [
  {
    name: "Cloud",
    tag: "Not open yet",
    price: "Price not set yet",
    note: "We run it for you. You cannot sign up yet; join the waitlist to hear when it opens.",
    points: [
      "Every feature, the same as the self-hosted version.",
      "Nothing to install, update or keep running.",
      "We register the apps with each network, so you only sign in.",
      "Not open yet. Join the waitlist and we email you when it is.",
      "It will be a paid subscription, and people on the waitlist hear the price first.",
    ],
    cta: { label: "Join the waitlist", href: "/#waitlist", external: false },
  },
  {
    name: "Self-hosted",
    tag: "Works today",
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
    cta: { label: "Read the install guide", href: "/docs/self-hosted", external: false },
  },
];

const questions: [string, string][] = [
  ["Is the self-hosted version limited?", "No. There are no plan limits: it is the same code that runs the cloud version, under the AGPL-3.0 license, and nothing is held back for paying customers."],
  ["What will the cloud version cost?", "We have not set a price. We will publish it here before anyone is charged, and tell the waitlist first."],
  ["Does self-hosting cost anything at all?", "SocialReins itself is free. You pay for your own server, and X charges for its API. The other networks do not charge for posting."],
  ["Can I try the cloud version now?", "No. SocialReins Cloud is not open yet. Join the waitlist and we email you when it is. You can self-host today."],
];

export default function Pricing() {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid w-full gap-10">
      <div className="grid max-w-2xl gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Pricing</h1>
        <p className="text-ink-soft">Run SocialReins on your own server today, free. SocialReins Cloud, where we run everything for you, is not open yet.</p>
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
      </div>
    </main>
  );
}
