"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

// Escape and a click elsewhere close an open <details>, which opens and closes by keyboard on its own.
function useDismiss(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        // Focus inside the panel would be lost when it closes, so hand it back to the button.
        if (el.contains(document.activeElement)) el.querySelector("summary")?.focus();
      } else if (el.contains(e.target as Node)) return;
      el.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [ref]);
}

// A header dropdown. On a phone the panel spans the header, so the header must be `relative`.
export function Menu({ summary, className, children }: { summary: ReactNode; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref);

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

export const menuItem = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium whitespace-nowrap hover:bg-ink/5 disabled:opacity-50";

// A small menu inside the app, on a card or between two rows: the same <details>, closed by Escape, a click elsewhere or a choice.
// Its items are plain buttons and links with `menuItem`.
export function ActionMenu({ label, className, side = "right", children, trigger }: { label: string; className: string; side?: "left" | "right"; trigger: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref);
  return (
    <details ref={ref} className="relative">
      <summary aria-label={label} title={label} className={`${className} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {trigger}
      </summary>
      <div
        className={`absolute z-20 mt-1 grid min-w-40 gap-0.5 rounded-lg bg-paper p-1 shadow-[0_0_0_1px_var(--line),0_10px_30px_rgb(0_0_0/0.12)] ${side === "right" ? "right-0" : "left-0"}`}
        onClick={() => ref.current?.removeAttribute("open")}
      >
        {children}
      </div>
    </details>
  );
}
