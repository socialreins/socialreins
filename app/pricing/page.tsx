import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, sitePage } from "@/components/site-header";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Pricing: SocialReins",
  description: "SocialReins Cloud: Scheduler $190 a year or $19 a month, Scheduler and Automation $490 a year or $49 a month, and a 7-day free trial on a team's first plan. Self-hosting is free, with every feature.",
  ...publicPage("/pricing"),
};

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

// Decision 0006: USD, yearly (two months free) shown first. Cloud is invitation-only until open sign-up, so the button is still the waitlist.
const plans = [
  {
    name: "Scheduler",
    tag: "Cloud, not open yet",
    price: "$190 a year",
    note: "Or $19 a month. A team's first plan starts with a 7-day free trial.",
    points: [
      "10 connected accounts.",
      "3 team members.",
      "Scheduling, the calendar, queues, approvals and analytics.",
      "Nothing to install: we run it and register the apps with each network.",
      "No inbox or automations.",
    ],
    cta: { label: "Join the waitlist", href: "/#waitlist", external: false },
  },
  {
    name: "Scheduler and Automation",
    tag: "Cloud, not open yet",
    price: "$490 a year",
    note: "Or $49 a month. A team's first plan starts with a 7-day free trial.",
    points: [
      "25 connected accounts.",
      "Unlimited team members.",
      "Everything in Scheduler.",
      "The inbox, automations, broadcasts and newsletters, with 2,500 contacts.",
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
  ["What does the cloud version cost?", "Scheduler is $190 a year or $19 a month. Scheduler and Automation is $490 a year or $49 a month. Yearly is two months free. Prices are in US dollars, and a team's first plan starts with a 7-day free trial."],
  ["Why do posts to X cost extra?", "X charges us for every post sent through its API, so posting to X on the cloud version uses prepaid credits: 100 posts for $5 or 500 for $20. Each part of a thread counts as one post. Credits never expire. The other networks do not charge for posting."],
  ["Can I cancel or get a refund?", "You can cancel at any time, and your plan keeps working until the end of the period you paid for. A period already started and credit packs are not refunded, except for a duplicate charge or our mistake; the free trial is the time to try it."],
  ["Does self-hosting cost anything at all?", "SocialReins itself is free. You pay for your own server, and X charges for its API. The other networks do not charge for posting."],
  ["Can I try the cloud version now?", "Not yet. SocialReins Cloud is open by invitation while we finish it. Join the waitlist and we email you when it opens. You can self-host today."],
];

export default function Pricing() {
  return (
    <main className={sitePage}>
      <SiteHeader />
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
