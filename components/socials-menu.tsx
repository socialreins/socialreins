import Link from "next/link";
import { PlatformIcon, platforms } from "@/components/platform-icons";

// The header's "Socials" menu: every network SocialReins supports, each linking to its own page.
// A native <details>, so it opens and closes by keyboard and needs no script.
export function SocialsMenu({ className }: { className: string }) {
  return (
    <details className="relative">
      <summary className={`${className} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Socials</summary>
      <ul className="absolute right-0 z-20 mt-3 grid w-60 gap-0.5 rounded-xl border-2 border-ink/10 bg-paper p-2 shadow-lg max-sm:fixed max-sm:inset-x-4 max-sm:top-20 max-sm:w-auto">
        {platforms.map((p) => (
          <li key={p.id}>
            <Link href={`/${p.id}`} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-bold hover:bg-ink/5">
              <span className="grid size-7 shrink-0 place-items-center" style={{ color: p.color }}>
                <PlatformIcon platform={p} className="size-4" />
              </span>
              {p.name}
            </Link>
          </li>
        ))}
        <li className="mt-1 border-t border-ink/10 pt-1">
          <Link href="/post-types" className="block rounded-lg px-2.5 py-2 text-ink-soft hover:bg-ink/5">
            Compare all networks
          </Link>
        </li>
      </ul>
    </details>
  );
}
