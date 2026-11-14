import Link from "next/link";
import { GitHubMenu } from "@/components/github-link";
import { LogoMark } from "@/components/logo";
import { SessionLink } from "@/components/session-link";
import { SocialsMenu } from "@/components/socials-menu";

const navLink = "whitespace-nowrap font-bold underline-offset-4 hover:text-signal-deep hover:underline";

// Every public page sits in this one column, so the menu bar and the left edge never move between pages.
export const sitePage = "mx-auto grid w-full max-w-6xl gap-8 px-5 pt-6 pb-12 sm:px-8";

// The one menu bar for every public page. `relative` because an open menu panel spans it on a phone.
export function SiteHeader({ className = "" }: { className?: string }) {
  return (
    <header className={`relative flex items-center justify-between gap-3 ${className}`}>
      <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        {/* On a phone the mark alone leaves room for Socials and Get started; the GitHub menu is hidden and the footer links to GitHub. */}
        <span className="max-sm:sr-only">SocialReins</span>
      </Link>
      <nav aria-label="Site" className="flex items-center gap-4 sm:gap-6">
        <SocialsMenu className={navLink} />
        <Link href="/docs" className={navLink}>
          Docs
        </Link>
        <div className="max-sm:hidden">
          <GitHubMenu className="rounded-full border-2 border-ink px-3.5 py-1.5 font-bold hover:bg-ink hover:text-paper" />
        </div>
        <SessionLink className={navLink} />
      </nav>
    </header>
  );
}
