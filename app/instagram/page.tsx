import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "What you can post to Instagram: SocialReins",
  description: "What SocialReins posts to Instagram: photos, Reels, carousels and Motion Carousels of up to 20 slides, covers and first comments.",
  ...publicPage("/instagram"),
};

// Mirrors brain's crates/core/src/post.rs (INSTAGRAM_*) and `limits.instagram` in lib/posts.ts.
const rows: [string, string][] = [
  ["One photo", "Yes. JPEG, PNG or WebP; PNG and WebP are turned into JPEG for you."],
  ["One video", "Yes, as a Reel. MP4 or MOV."],
  ["Carousel of photos", "Yes, 2 to 20 slides."],
  ["Motion Carousel (videos, or videos and photos mixed)", "Yes, 2 to 20 slides. Any slide can be a video."],
  ["Cover image for a Reel", "Yes. JPEG, PNG or WebP."],
  ["First comment", "Yes, up to 2,200 characters."],
  ["Caption", "Up to 2,200 characters."],
  ["Text only", "No. Instagram needs at least one photo or video."],
  ["Stories", "Not yet. Instagram allows it; SocialReins does not post it yet."],
];

export default function Instagram() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">What you can post to Instagram</h1>
        <p className="text-ink-soft">
          What SocialReins publishes to an Instagram business or creator account today, with the limits Instagram sets.
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
                On Instagram
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([type, value]) => (
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
        <h2>Carousels and Motion Carousels</h2>
        <p>
          A carousel is one post with several slides to swipe through. A Motion Carousel is a carousel where some or all of the slides are
          videos, so the slides move. Instagram takes both, and SocialReins posts both.
        </p>
        <ul>
          <li>Up to 20 slides in one carousel. That is Instagram&apos;s own limit, not ours.</li>
          <li>Photos and videos can be mixed in any order.</li>
          <li>Instagram crops every slide to the shape of the first one, so make the first slide the shape you want.</li>
          <li>A carousel counts as one post toward Instagram&apos;s daily limit.</li>
          <li>One video on its own goes out as a Reel, not a carousel.</li>
        </ul>
        <h2>Motion Photo</h2>
        <p>
          Instagram has no API for live or motion photos. Post the clip as an MP4 instead: on its own it goes out as a Reel, and with other
          photos or videos it becomes a slide in a Motion Carousel.
        </p>
        <p>
          See every network side by side on <Link href="/post-types" className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">What you can post where</Link>.
        </p>
      </div>
    </main>
  );
}
