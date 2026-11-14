import Link from "next/link";
import { Menu } from "@/components/menu";
import { PlatformIcon, platforms } from "@/components/platform-icons";

// The header's "Socials" menu: every network SocialReins supports, each linking to its own page.
export function SocialsMenu({ className }: { className: string }) {
  return (
    <Menu summary="Socials" className={className}>
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
    </Menu>
  );
}
