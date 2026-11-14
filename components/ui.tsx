import type { ReactNode } from "react";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";

// Line icons on a 24x24 grid, drawn for the app. Decorative: every icon sits next to text or an aria-label.
const paths = {
  posts: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM4 9.5h16M8.5 2.5v3M15.5 2.5v3M8 13h3M8 16.5h6",
  compose: "M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13M17.6 3.9a2.1 2.1 0 0 1 3 3L12 15.5l-4 1 1-4 8.6-8.6Z",
  lists: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  inbox: "M4 13.5 6.2 5.6A2 2 0 0 1 8.1 4h7.8a2 2 0 0 1 1.9 1.6L20 13.5v4A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-4ZM4 13.5h4.5l1 2.5h5l1-2.5H20",
  automations: "M13 3 5 13.5h6.5L10.5 21 19 10.5h-6.5L13 3Z",
  accounts: "M9.5 14.5a4.5 4.5 0 0 1 0-6.4l2-2a4.5 4.5 0 0 1 6.4 6.4l-1.2 1.2M14.5 9.5a4.5 4.5 0 0 1 0 6.4l-2 2a4.5 4.5 0 0 1-6.4-6.4l1.2-1.2",
  sets: "m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5ZM3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5",
  team: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3a6.5 6.5 0 0 1 3.5 5.7",
  security: "M14.5 9.5a5 5 0 1 0-4.1 4.9L12 16h2v2h2v2.5h4V17l-5.6-5.6c.07-.3.1-.6.1-.9ZM7.75 8.25h.01",
  admin: "M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6L12 3ZM9 12l2 2 4-4",
  key: "M8 20a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM11.2 12.3 20 3.5M16.5 7l2.5 2.5M14 9.5l2 2",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4",
  plus: "M12 5v14M5 12h14",
  left: "m14.5 6-6 6 6 6",
  right: "m9.5 6 6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.8 1.17V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-2.8-1.17l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.3 14H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.17-2.8l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.8 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
  image: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM4 16l4.5-4.5L14 17M13 13l2.5-2.5L20 15M15.5 8.5h.01",
  out: "M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h10",
  external: "M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10",
  trash: "M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2",
  send: "M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4 17-6.5Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0",
  fingerprint: "M5.5 9.5a7 7 0 0 1 13 0M4.5 14a8 8 0 0 1 .3-3M19.5 14.5c.2-1 .2-2 .1-3M8.5 19.5a10 10 0 0 0 1-4.5v-3a2.5 2.5 0 0 1 5 0v1.5M12 12v3a13 13 0 0 1-1.5 6M14.5 17a17 17 0 0 1-.8 3.5M17 12v2a17 17 0 0 1-.5 4M7 12v2.5a7 7 0 0 1-.7 3",
  down: "m6 9.5 6 6 6-6",
  home: "M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v5.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  monitor: "M3.5 6A1.5 1.5 0 0 1 5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V6ZM8.5 20h7M12 16.5V20",
  sidebar: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM9.5 4v16",
};
export type IconName = keyof typeof paths;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

// A page's title, shown in the top bar (`PageTitle`), with its main action on the right of the page.
// `back` is the page one level up: a crumb in the top bar, and a link on the page on phones, where the bar has no room for it.
export function PageHeader({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <>
      <PageTitle title={title} back={back} />
      {back && (
        <Link href={back.href} className={`flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink sm:hidden ${children ? "mb-1" : "mb-6"}`}>
          <Icon name="left" className="size-4" />
          {back.label}
        </Link>
      )}
      {children && <div className="mb-6 flex flex-wrap items-center justify-end gap-2">{children}</div>}
    </>
  );
}
