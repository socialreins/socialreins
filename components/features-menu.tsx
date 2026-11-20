import Link from "next/link";
import { Menu } from "@/components/menu";
import { features } from "@/lib/features";

const items = [{ href: "/features", name: "All features", short: "Everything SocialReins does today" }, { href: "/socials", name: "Social media", short: "Every network you can post to" }, ...features.map((f) => ({ href: `/features/${f.slug}`, name: f.name, short: f.short }))];

// The header's "Features" menu: every feature, the networks index and one page per feature.
export function FeaturesMenu({ className }: { className: string }) {
  return (
    <Menu summary="Features" className={className}>
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} className="grid rounded-lg px-2.5 py-2 hover:bg-ink/5">
            <span className="font-bold">{i.name}</span>
            <span className="text-sm text-ink-soft">{i.short}</span>
          </Link>
        </li>
      ))}
    </Menu>
  );
}
