import type { Metadata } from "next";
import Link from "next/link";
import { GitHubLink } from "@/components/github-link";
import { LogoMark } from "@/components/logo";
import { PlatformIcon, platforms } from "@/components/platform-icons";
import { Reins } from "@/components/reins";
import { SiteHeader } from "@/components/site-header";
import { WaitlistForm } from "@/components/waitlist-form";
import { org } from "@/lib/github";

const repo = "https://github.com/socialreins/socialreins";

const headerLink = "whitespace-nowrap font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

const features = [
  {
    title: "Publish and schedule",
    body: "Write once and send it to every account in a set, now or at a time you pick.",
  },
  {
    title: "A caption for each platform",
    body: "Give X a short line, LinkedIn a longer one and a PDF, and the rest your images, in one post.",
  },
  {
    title: "Take posts down everywhere",
    body: "Pull a published post back from every platform it went out on, in one step.",
  },
  {
    title: "Sets and lists",
    body: "Group accounts into sets, like one per language or brand, and posts into ordered lists.",
  },
  {
    title: "Teams",
    body: "Invite people as admins or members. Sign in with Google, an email link or a passkey.",
  },
  {
    title: "Built for AI agents",
    body: "A REST API and an MCP server let your agents post for you, limited to the sets you choose.",
  },
];

const compose = `git clone --recurse-submodules https://github.com/socialreins/socialreins
cd socialreins && cp .env.example .env
# edit .env: POSTGRES_PASSWORD, BRAIN_URL, WEB_URL
docker compose up -d`;

export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: { url: "/" } };

const organization = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SocialReins",
  url: "https://socialreins.com",
  logo: "https://socialreins.com/icon-512.png",
  sameAs: [org],
});

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <SiteHeader className="py-6" />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organization }} />
      <main>
        <section id="waitlist" className="grid items-center gap-12 pt-8 pb-14 md:grid-cols-[1.05fr_1fr] md:pt-16 md:pb-20">
          <div className="grid gap-6">
            <p className="flex flex-wrap gap-2 text-sm font-bold">
              <span className="rounded-full bg-ink px-3 py-1 text-paper">Open source</span>
              <span className="rounded-full border-2 border-signal-deep px-3 py-0.5 text-signal-deep">Cloud in early access</span>
              <span className="rounded-full border-2 border-ink px-3 py-0.5">Free to self-host</span>
            </p>
            <h1 className="font-display text-[clamp(2.6rem,7vw,4.9rem)] leading-[0.95] font-extrabold tracking-[-0.03em]">
              Every social account, one set of reins.
            </h1>
            <p className="max-w-[34rem] text-lg text-ink-soft">
              SocialReins is an open-source social media manager. It publishes and schedules your posts to eight
              platforms from one place, and pulls a post back from all of them when you need to. SocialReins Cloud is the
              standard way to use it: we run everything, and it is in early access. Want it free? Run it yourself.
            </p>
            <WaitlistForm />
          </div>
          <Reins />
        </section>

        <section aria-labelledby="platforms-title" className="border-y-2 border-ink/10 py-8">
          <h2 id="platforms-title" className="text-sm font-bold tracking-wide text-ink-soft uppercase">
            Works with
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:justify-between">
            {platforms.map((p) => (
              <li key={p.id}>
                <Link href={`/${p.id}`} className="group flex items-center gap-2.5 font-display font-bold">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-ink/10 bg-paper" style={{ color: p.color }}>
                    <PlatformIcon platform={p} className="size-5" />
                  </span>
                  <span className="underline decoration-transparent decoration-2 underline-offset-4 group-hover:decoration-signal">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="features-title" className="py-14 md:py-20">
          <h2 id="features-title" className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            What it does
          </h2>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-3xl border border-ink/10 bg-paper p-6">
                <dt className="grid justify-items-start gap-3 font-display text-xl font-bold">
                  <span className="rounded-full bg-ink px-2.5 py-0.5 font-body text-xs font-bold text-paper">Live now</span>
                  {f.title}
                </dt>
                <dd className="mt-2 text-ink-soft">{f.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-labelledby="oss-title"
          className="-mx-5 grid gap-10 bg-ink px-5 py-14 text-paper sm:-mx-8 sm:px-8 md:grid-cols-2 md:items-center md:rounded-[2.5rem] md:px-14 md:py-16"
        >
          <div>
            <h2 id="oss-title" className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
              Let us run it, or run it yourself for free
            </h2>
            <p className="mt-4 max-w-[34rem] text-lg text-canvas">
              SocialReins Cloud is the standard way: we run the servers, and early access is free for now. Join the
              waitlist for an invitation. SocialReins is also open source, so a few commands start it on your own server with
              Postgres, free, with every feature. See <Link href="/pricing" className="font-bold underline decoration-signal decoration-2 underline-offset-4">pricing</Link>.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#waitlist" className="rounded-full bg-signal px-6 py-3 font-bold text-ink hover:bg-paper">
                Join the waitlist
              </a>
              <GitHubLink
                label="Star on GitHub"
                className="rounded-full border-2 border-paper px-6 py-3 font-bold hover:bg-paper hover:text-ink"
              />
            </div>
          </div>
          <figure className="min-w-0">
            <pre className="overflow-x-auto rounded-2xl bg-paper/10 p-5 font-mono text-sm leading-relaxed">
              <code>{compose}</code>
            </pre>
            <figcaption className="mt-3 text-sm text-canvas/80">
              Full steps in the{" "}
              <a href={`${repo}#self-host`} className="font-bold underline decoration-signal decoration-2 underline-offset-4">
                README
              </a>
              .
            </figcaption>
          </figure>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-4 py-10 text-ink-soft">
        <span className="flex items-center gap-2">
          <LogoMark className="size-6" />
          Built by Bytech
        </span>
        <span className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/privacy" className={headerLink}>
            Privacy
          </Link>
          <Link href="/terms" className={headerLink}>
            Terms
          </Link>
          <Link href="/pricing" className={headerLink}>
            Pricing
          </Link>
          <Link href="/post-types" className={headerLink}>
            Post types
          </Link>
          <Link href="/compare" className={headerLink}>
            Compare
          </Link>
          <Link href="/contact" className={headerLink}>
            Contact
          </Link>
          <a href={repo} target="_blank" rel="noopener noreferrer" className={headerLink}>
            SocialReins on GitHub
          </a>
          <a href="https://github.com/sponsors/HarunRRayhan" target="_blank" rel="noopener noreferrer" className={headerLink}>
            Sponsor
          </a>
        </span>
      </footer>
    </div>
  );
}
