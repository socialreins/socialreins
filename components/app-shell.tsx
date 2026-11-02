"use client";

import { createContext, Suspense, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getMe, type MeResult, type Team, type User } from "@/lib/auth";
import { Account } from "@/components/account";
import { LogoMark } from "@/components/logo";
import { PasskeyPrompt } from "@/components/passkey-prompt";
import { TeamSwitcher } from "@/components/team-switcher";
import { Icon, type IconName } from "@/components/ui";

type Session = { user: User; setTeam: (t: Team) => void; refresh: () => Promise<void> };
const SessionContext = createContext<Session | null>(null);

// The signed-in user, checked once by the shell. Only for components rendered under /app.
export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession needs AppShell");
  return s;
}

type NavItem = { href: string; label: string; icon: IconName };
type NavGroup = { label: string; items: NavItem[] };
const nav: NavGroup[] = [
  {
    label: "Publish",
    items: [
      { href: "/app/posts", label: "Posts", icon: "posts" },
      { href: "/app/lists", label: "Lists", icon: "lists" },
    ],
  },
  {
    label: "Engage",
    items: [
      { href: "/app/inbox", label: "Inbox", icon: "inbox" },
      { href: "/app/automations", label: "Automations", icon: "automations" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/app/connections", label: "Accounts", icon: "accounts" },
      { href: "/app/sets", label: "Sets", icon: "sets" },
      { href: "/app/team", label: "Team", icon: "team" },
      { href: "/app/api-tokens", label: "API tokens", icon: "key" },
    ],
  },
  {
    label: "Profile settings",
    items: [
      { href: "/app/profile", label: "Profile", icon: "user" },
      { href: "/app/security", label: "Sign-in and security", icon: "security" },
      { href: "/app/security#passkeys", label: "Passkeys", icon: "fingerprint" },
    ],
  },
];
const adminGroup: NavGroup = { label: "Admin", items: [{ href: "/app/admin", label: "Waitlist", icon: "admin" }] };

// Sidebar preferences in localStorage. The server snapshot is null, so hydration matches and the stored value applies right after.
const listeners = new Set<() => void>();
function subscribe(f: () => void) {
  listeners.add(f);
  window.addEventListener("storage", f);
  return () => {
    listeners.delete(f);
    window.removeEventListener("storage", f);
  };
}
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function useStored(key: string) {
  return useSyncExternalStore(subscribe, () => read(key), () => null);
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  listeners.forEach((f) => f());
}

// The session cookie is on the API host, invisible to Next server code, so the check runs here, once for every app page.
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResult | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  // The icon rail applies from md up; small screens keep the menu button.
  const collapsed = useStored("sidebar-collapsed") === "1";

  useEffect(() => {
    getMe().then((r) => {
      if (r === "signed_out") router.replace("/login");
      else setMe(r);
    });
  }, [router]);

  const user = typeof me === "object" && me ? me.user : null;
  const groups = user?.is_admin ? [...nav, adminGroup] : nav;
  const session: Session | null = user && {
    user,
    setTeam: (t) => setMe({ user: { ...user, current_team: t } }),
    refresh: async () => {
      const r = await getMe();
      if (r === "signed_out") router.replace("/login");
      else setMe(r);
    },
  };

  function closeMenu() {
    flushSync(() => setOpen(false));
    menuRef.current?.focus();
  }

  const content =
    me === "error" ? (
      <p role="alert" className="waitlist-error">
        Sign-in couldn&apos;t be checked. Reload to try again.
      </p>
    ) : session ? (
      // A new current team remounts the page, so it loads that team's data.
      <div key={session.user.current_team.id}>{children}</div>
    ) : (
      <div aria-busy="true" className="grid gap-6">
        <p role="status" className="sr-only">
          Checking your sign-in...
        </p>
        <div className="h-9 w-48 rounded-xl bg-ink/5 motion-safe:animate-pulse" />
        <div className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
        <div className="h-24 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
      </div>
    );

  return (
    <SessionContext.Provider value={session}>
      <div className={`min-h-dvh md:grid ${collapsed ? "md:grid-cols-[4.75rem_minmax(0,1fr)]" : "md:grid-cols-[16rem_minmax(0,1fr)]"}`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-20 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:font-bold">
          Skip to content
        </a>
        <aside
          className="sticky top-0 z-10 border-b border-ink/10 bg-canvas md:h-dvh md:border-r md:border-b-0"
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) closeMenu();
          }}
        >
          <div className="flex h-full flex-col">
            <div
              className={`flex items-center justify-between gap-3 px-4 py-3 md:pt-6 md:pb-5 ${collapsed ? "md:flex-col md:px-0" : "md:px-5"}`}
            >
              <Link href="/app/posts" className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight">
                <LogoMark className="size-8" />
                <span className={collapsed ? "md:sr-only" : ""}>SocialReins</span>
              </Link>
              <button
                type="button"
                className="icon-btn hidden md:inline-grid"
                aria-expanded={!collapsed}
                aria-controls="app-menu"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => store("sidebar-collapsed", collapsed ? "0" : "1")}
              >
                <Icon name="sidebar" />
              </button>
              <button
                ref={menuRef}
                type="button"
                className="icon-btn md:hidden"
                aria-expanded={open}
                aria-controls="app-menu"
                aria-label="Menu"
                onClick={() => setOpen(!open)}
              >
                <Icon name={open ? "close" : "menu"} />
              </button>
            </div>
            <div
              id="app-menu"
              className={`${open ? "flex" : "hidden"} max-h-[calc(100dvh-4rem)] flex-1 flex-col gap-6 overflow-y-auto px-3 pb-5 md:flex md:max-h-none`}
            >
              {/* Following a link closes the menu on small screens. */}
              <nav aria-label="App" onClick={(e) => (e.target as Element).closest("a") && setOpen(false)}>
                <Suspense fallback={<NavGroups path="" groups={groups} collapsed={collapsed} />}>
                  <CurrentNavGroups groups={groups} collapsed={collapsed} />
                </Suspense>
              </nav>
              {/* minmax(0,1fr): a long team name or email truncates instead of widening the sidebar. */}
              <div className={`mt-auto grid grid-cols-[minmax(0,1fr)] gap-4 ${collapsed ? "md:hidden" : ""}`}>
                {session ? (
                  <>
                    <TeamSwitcher />
                    <Account />
                  </>
                ) : (
                  <div className="h-28 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </aside>
        {session && (
          <Suspense fallback={null}>
            <PasskeyPrompt />
          </Suspense>
        )}
        <main id="main" tabIndex={-1} className="app-main mx-auto w-full max-w-6xl px-4 py-8 focus:outline-none sm:px-8 md:py-10">
          {content}
        </main>
      </div>
    </SessionContext.Provider>
  );
}

function CurrentNavGroups(props: { groups: NavGroup[]; collapsed: boolean }) {
  return <NavGroups path={usePathname()} {...props} />;
}

function NavGroups({ path, groups, collapsed }: { path: string; groups: NavGroup[]; collapsed: boolean }) {
  return (
    <div className={`grid gap-4 ${collapsed ? "md:gap-2" : ""}`}>
      {groups.map((group, i) => (
        <NavSection key={group.label} path={path} group={group} collapsed={collapsed} first={i === 0} />
      ))}
    </div>
  );
}

// Hash links (Passkeys) point into a page another link already marks as current.
const isActive = (path: string, href: string) => !href.includes("#") && (path === href || path.startsWith(`${href}/`));

function NavSection({ path, group, collapsed, first }: { path: string; group: NavGroup; collapsed: boolean; first: boolean }) {
  const key = `sidebar-group:${group.label}`;
  const closed = useStored(key) === "closed";
  // The group holding the current page always stays open.
  const holdsPage = group.items.some((item) => isActive(path, item.href));
  const open = holdsPage || !closed;
  const id = `nav-${group.label.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <div className={collapsed && !first ? "md:border-t md:border-ink/10 md:pt-2" : ""}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-disabled={holdsPage || undefined}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1 text-xs font-bold tracking-wider text-ink-soft uppercase ${
          holdsPage ? "cursor-default" : "hover:text-ink"
        } ${collapsed ? "md:hidden" : ""}`}
        onClick={() => !holdsPage && store(key, closed ? "open" : "closed")}
      >
        {group.label}
        {!holdsPage && <Icon name="down" className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />}
      </button>
      {/* The rail shows every group, since its headings are hidden. */}
      <ul id={id} className={`mt-1 gap-0.5 ${open ? "grid" : "hidden"} ${collapsed ? "md:mt-0 md:grid" : ""}`}>
        {group.items.map((item) => {
          const active = isActive(path, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 font-bold ${collapsed ? "md:justify-center" : ""} ${
                  active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                }`}
              >
                <Icon name={item.icon} className={`size-5 ${active ? "text-signal" : ""}`} />
                <span className={collapsed ? "md:sr-only" : ""}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
