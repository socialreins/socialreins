import type { Metadata } from "next";
import Link from "next/link";
import { PlatformIcon, platforms } from "@/components/platform-icons";
import { SiteHeader, sitePage } from "@/components/site-header";
import { network } from "@/lib/networks";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Supported social media: SocialReins",
  description: "Every social network SocialReins posts to: Bluesky, Threads, LinkedIn, Facebook, Instagram, YouTube, X, TikTok and Pinterest, each with its own page.",
  ...publicPage("/socials"),
};

export default function Socials() {
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid w-full gap-8">
        <div className="grid max-w-2xl gap-2">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Supported social media</h1>
          <p className="text-ink-soft">SocialReins posts to {platforms.length} networks. Open one to see what you can post there and its limits.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {platforms.map((p) => (
            <li key={p.id}>
              <Link href={`/${p.id}`} className="flex h-full gap-3 rounded-lg border border-ink/10 bg-paper p-4 hover:border-ink/40">
                <span className="grid size-9 shrink-0 place-items-center" style={{ color: p.color }}>
                  <PlatformIcon platform={p} className="size-6" />
                </span>
                <span className="grid gap-1">
                  <strong className="font-display text-lg font-extrabold">{p.name}</strong>
                  {/* The network's search description without its "What SocialReins posts to X: " lead. */}
                  <span className="text-[0.95rem] leading-snug text-ink-soft first-letter:uppercase">{network(p.id)?.description.replace(/^.*?: /, "")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/post-types" className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">
            Compare all networks side by side
          </Link>
        </p>
      </div>
    </main>
  );
}
