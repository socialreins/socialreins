import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { publicPage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "What you can post where: SocialReins",
  description: "Text, images, videos, carousels, Reels, documents, threads and first comments: what SocialReins can post on each social network today.",
  ...publicPage("/post-types"),
};

const networks = ["Bluesky", "Threads", "LinkedIn", "Facebook Page", "Instagram", "YouTube", "X", "TikTok"];

// "!" marks a cell the network allows through its API but SocialReins does not post yet.
// Mirrors brain's crates/core/src/post.rs, controllers/posts.rs and connectors, and `limits` in lib/posts.ts.
const rows: [string, string[]][] = [
  ["Text only", ["Yes", "Yes", "Yes", "Yes", "No", "No", "Yes", "No"]],
  ["One image", ["Yes", "Yes", "Yes", "Yes", "Yes, JPEG", "No", "Yes", "Yes"]],
  ["Several images (max)", ["Yes, up to 4", "Yes, up to 20", "Yes, up to 20", "Yes, up to 10", "Yes, up to 20", "No", "Yes, up to 4", "Yes, up to 35"]],
  ["One video", ["Yes", "Yes", "Yes, MP4", "Yes, as a Reel", "Yes, as a Reel", "Yes", "Yes", "Yes"]],
  ["Several videos or photos mixed in one post", ["No", "Yes, up to 20", "No", "No", "Yes, up to 20 (Motion Carousel)", "No", "No", "No"]],
  ["Reels / Shorts", ["No", "No", "No", "Yes, one video", "Yes, one video", "Yes, a vertical video becomes a Short", "No", "Yes, every video"]],
  ["PDF document", ["No", "No", "Yes, one PDF", "No", "No", "No", "No", "No"]],
  ["GIF", ["Yes", "No", "Yes", "Yes", "No", "No", "Yes, one", "No"]],
  ["Video cover image", ["No", "No", "No", "Yes", "Yes, JPEG", "Yes", "No", "No!"]],
  ["Thread (reply chain)", ["Yes, up to 25 replies", "Yes, up to 25 replies", "No", "No", "No", "No", "Yes, up to 25 replies", "No"]],
  ["First comment", ["No", "No", "Yes", "Yes", "Yes", "Yes", "No", "No"]],
  ["Stories", ["No", "No", "No", "No!", "No!", "No", "No", "No"]],
  ["Polls", ["No", "No!", "No!", "No", "No", "No", "No!", "No"]],
];

function Cell({ value }: { value: string }) {
  const later = value.endsWith("!");
  const text = later ? value.slice(0, -1) : value;
  return (
    <td className={`border-t border-ink/10 px-3 py-2.5 align-top ${text.startsWith("Yes") ? "font-semibold" : "text-ink-soft"}`}>
      {text}
      {later && (
        <span title="The network allows it; SocialReins does not post it yet" className="ml-1 text-signal-deep">
          <span aria-hidden="true">*</span>
          <span className="sr-only"> (the network allows it; SocialReins does not post it yet)</span>
        </span>
      )}
    </td>
  );
}

export default function PostTypes() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <div className="grid max-w-2xl gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">What you can post where</h1>
        <p className="text-ink-soft">
          What SocialReins can publish on each network today. A <span className="font-bold text-signal-deep">*</span> marks something the
          network allows that SocialReins does not post yet.
        </p>
      </div>

      {/* The table is 66rem wide; below that only the first networks show, so say there are more. */}
      <p className="-mb-5 text-sm text-ink-soft min-[70rem]:hidden">Scroll the table sideways to see all eight networks.</p>
      <div className="relative min-w-0 overflow-x-auto rounded-lg border border-ink/10 bg-paper" tabIndex={0} role="region" aria-label="Post types by network">
        <table className="w-full min-w-[66rem] border-collapse text-left text-[0.95rem] leading-snug">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-paper px-3 py-3 font-display">
                <span className="sr-only">Post type</span>
              </th>
              {networks.map((n) => (
                <th key={n} scope="col" className="px-3 py-3 font-display font-extrabold">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([type, cells]) => (
              <tr key={type}>
                <th scope="row" className="sticky left-0 w-36 min-w-36 border-t border-r border-ink/10 bg-paper px-3 py-2.5 align-top font-bold">
                  {type}
                </th>
                {cells.map((c, i) => (
                  <Cell key={networks[i]} value={c} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legal grid max-w-2xl gap-4 leading-relaxed">
        <h2>Motion Photo</h2>
        <p>
          Instagram has no API for live or motion photos. Post the clip as an MP4 instead: on its own it goes out as a Reel, and with
          other photos or videos it becomes a carousel item.
        </p>
      </div>
    </main>
  );
}
