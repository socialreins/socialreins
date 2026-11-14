"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

// The last crumb of the top bar, where each page puts its title. null until the bar has rendered.
export const TitleSlot = createContext<HTMLElement | null>(null);

// A page's h1, shown in the top bar's breadcrumb instead of on the page, so the name is said once.
// `back` is the page one level up; it is a crumb from `sm` up (phones keep the link on the page).
export function PageTitle({ title, back }: { title: string; back?: { href: string; label: string } }) {
  const slot = useContext(TitleSlot);
  if (!slot) return null;
  return createPortal(
    <>
      {back && (
        <>
          <Link href={back.href} className="hidden shrink-0 rounded-md px-2 py-1 text-ink-soft hover:bg-ink/[0.045] hover:text-ink sm:block">
            {back.label}
          </Link>
          <span aria-hidden="true" className="hidden text-[var(--line)] sm:block">/</span>
        </>
      )}
      <h1 aria-current="page" className="truncate px-2 font-bold" title={title}>
        {title}
      </h1>
    </>,
    slot,
  );
}
