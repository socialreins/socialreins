"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A header dropdown. A native <details> opens and closes by keyboard; the effect adds Escape and a click elsewhere.
// On a phone the panel spans the header, so the header must be `relative`.
export function Menu({ summary, className, children }: { summary: ReactNode; className: string; children: ReactNode }) {
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
      <summary className={`${className} flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden`}>
        {summary}
        <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3 transition-transform group-open:rotate-180">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <ul
        className="absolute right-0 z-20 mt-3 grid w-60 gap-0.5 rounded-xl border-2 border-ink/10 bg-paper p-2 font-normal text-ink shadow-lg max-sm:inset-x-0 max-sm:top-full max-sm:mt-0 max-sm:w-auto"
        // A link to another page of the same kind keeps this component mounted, so close on any choice.
        onClick={() => ref.current?.removeAttribute("open")}
      >
        {children}
      </ul>
    </details>
  );
}
