"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PlatformIcon, platforms } from "@/components/platform-icons";

// The header's "Socials" menu: every network SocialReins supports, each linking to its own page.
// A native <details> opens and closes by keyboard; the effect adds Escape and a click elsewhere.
// On a phone the panel spans the header, so the header must be `relative`.
export function SocialsMenu({ className }: { className: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="group sm:relative">
      <summary className={`${className} flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden`}>
        Socials
        <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3 transition-transform group-open:rotate-180">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <ul className="absolute right-0 z-20 mt-3 grid w-60 gap-0.5 rounded-xl border-2 border-ink/10 bg-paper p-2 shadow-lg max-sm:inset-x-0 max-sm:top-full max-sm:mt-0 max-sm:w-auto"
        // A link to another network page keeps this component mounted, so close on any choice.
        onClick={() => ref.current?.removeAttribute("open")}
      >
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
