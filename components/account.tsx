"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
import { TeamLink as Link } from "@/components/team-link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import { roleName } from "@/components/team-ui";
import { Icon, type IconName } from "@/components/ui";

const item = "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-ink/[0.045]";

// The signed-in user at the foot of the sidebar: avatar, name and role in the current team. Hover or click opens the menu
// with the profile pages, the admin console and Sign out (a native popover: Escape and clicking outside close it).
export function Account({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { user } = useSession();
  const inAdmin = usePathname().startsWith("/admin");
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  const byHover = useRef(false);
  // Clicking the button light-dismisses an open menu before the click lands, so pointerdown notes it was open.
  const wasOpen = useRef(false);
  const [open, setOpen] = useState(false);
  // Next keeps a left layout mounted but hidden, so the admin and app shells can both be in the page.
  const id = useId();
  const name = user.name || user.email;

  const isOpen = () => panel.current?.matches(":popover-open") ?? false;
  function show(hover: boolean) {
    clearTimeout(leaving.current);
    if (isOpen()) return;
    byHover.current = hover;
    panel.current?.showPopover();
  }
  // A short delay lets the pointer cross the gap between the button and the menu.
  const hoverEnter = (e: PointerEvent) => e.pointerType === "mouse" && show(true);
  const hoverLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !byHover.current) return;
    leaving.current = setTimeout(() => panel.current?.hidePopover(), 200);
  };

  const links: { href: string; label: string; icon: IconName }[] = [
    { href: "/profile", label: "Profile", icon: "user" },
    { href: "/security", label: "Sign-in and security", icon: "security" },
    { href: "/security#passkeys", label: "Passkeys", icon: "fingerprint" },
    { href: "/billing", label: "Plans", icon: "settings" },
  ];
  if (user.is_admin) links.push(inAdmin ? { href: "/home", label: "Back to the app", icon: "left" } : { href: "/admin", label: "Admin console", icon: "admin" });

  return (
    <div
      className="border-t border-[var(--line)] pt-2"
      onPointerEnter={hoverEnter}
      onPointerLeave={hoverLeave}
      // Escape closes only this menu, not the mobile menu around it.
      onKeyDown={(e) => open && e.key === "Escape" && e.stopPropagation()}
    >
      <button
        ref={button}
        type="button"
        data-account
        aria-expanded={open}
        aria-controls={id}
        aria-label={collapsed ? `Account: ${name}` : undefined}
        title={collapsed ? name : undefined}
        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-ink/[0.045] ${collapsed ? "md:justify-center md:px-0" : ""}`}
        // A click pins a menu that hover opened, and otherwise toggles it.
        onPointerDown={() => (wasOpen.current = isOpen() && !byHover.current)}
        onClick={(e) => {
          // A mouse click arrives with the menu already dismissed; a key press with it still open.
          const pinned = e.detail ? wasOpen.current : isOpen() && !byHover.current;
          wasOpen.current = false;
          if (pinned) return panel.current?.hidePopover();
          show(false);
          byHover.current = false;
        }}
      >
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-signal-deep text-xs font-semibold text-paper">
          {[...name][0].toUpperCase()}
        </span>
        <span className={`grid min-w-0 flex-1 leading-tight ${collapsed ? "md:sr-only" : ""}`}>
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-[var(--faint)]">{roleName[user.current_team.role]}</span>
        </span>
        <Icon name="down" className={`size-3.5 rotate-180 text-[var(--faint)] ${collapsed ? "md:hidden" : ""}`} />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        // Placed before it shows: above the button, or beside it on the icon rail.
        onBeforeToggle={(e) => {
          const opening = (e.nativeEvent as ToggleEvent).newState === "open";
          setOpen(opening);
          // Closing with focus inside (Escape) hands focus back to the button.
          if (!opening) return void (panel.current!.contains(document.activeElement) && button.current?.focus());
          const r = button.current!.getBoundingClientRect();
          const rail = r.width < 80;
          const s = panel.current!.style;
          s.bottom = `${innerHeight - (rail ? r.bottom : r.top - 4)}px`;
          s.left = `${Math.max(8, Math.min(rail ? r.right + 8 : r.left, innerWidth - 248))}px`;
        }}
        onClick={(e) => (e.target as Element).closest("a") && panel.current?.hidePopover()}
        className="account-menu app-root fixed m-0 w-60 max-w-[calc(100vw-1rem)] rounded-lg bg-paper p-1.5 text-sm shadow-[0_0_0_1px_var(--line),0_10px_30px_rgb(0_0_0/0.12)] [inset:auto]"
      >
        <p className="px-2 pt-1 pb-1.5 text-xs text-ink-soft">
          Signed in as{" "}
          <strong className="block truncate font-medium text-ink" title={user.email}>
            {user.email}
          </strong>
        </p>
        <ul className="grid">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={item}>
                <Icon name={l.icon} className="size-4 text-[var(--faint)]" />
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="my-1.5 border-t border-[var(--line)]" />
        <button
          type="button"
          disabled={signingOut}
          className={item}
          onClick={async () => {
            setSigningOut(true);
            setSignOutFailed(false);
            if (await signOut()) return router.push("/");
            setSignOutFailed(true);
            setSigningOut(false);
          }}
        >
          <Icon name="out" className="size-4 text-[var(--faint)]" />
          Sign out
        </button>
        {signOutFailed && (
          <p role="alert" className="waitlist-error px-2 text-sm">
            Sign out didn&apos;t go through. Try again in a moment.
          </p>
        )}
      </div>
    </div>
  );
}
