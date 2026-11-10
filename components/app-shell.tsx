"use client";

import { createContext, Suspense, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getMe, type MeResult, type Team, type User } from "@/lib/auth";
import { Account } from "@/components/account";
import { LogoMark } from "@/components/logo";
import { PasskeyPrompt } from "@/components/passkey-prompt";
import { TopBar } from "@/components/top-bar";
import { Icon, type IconName } from "@/components/ui";

type Session = { user: User; setUser: (u: User) => void; setTeam: (t: Team) => void; refresh: () => Promise<void> };
const SessionContext = createContext<Session | null>(null);

// The signed-in user, checked once by the shell. Only for components rendered inside the shell.
export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession needs AppShell");
  return s;
}

export type NavItem = { href: string; label: string; icon: IconName };
type NavGroup = { label: string; items: NavItem[] };
const nav: NavGroup[] = [
  { label: "", items: [{ href: "/home", label: "Home", icon: "home" }] },
  {
    label: "Publish",
    items: [
      { href: "/posts", label: "Posts", icon: "posts" },
      { href: "/lists", label: "Lists", icon: "lists" },
    ],
  },
  {
    label: "Engage",
    items: [
      { href: "/inbox", label: "Inbox", icon: "inbox" },
      { href: "/automations", label: "Automations", icon: "automations" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/connections", label: "Accounts", icon: "accounts" },
      { href: "/sets", label: "Sets", icon: "sets" },
      { href: "/team", label: "Team", icon: "team" },
      { href: "/api-tokens", label: "API tokens", icon: "key" },
    ],
  },
];
// Personal pages live in the account menu at the foot of the sidebar; listed here for the breadcrumb.
const profilePages: NavItem[] = [
  { href: "/profile", label: "Profile", icon: "user" },
  { href: "/security", label: "Sign-in and security", icon: "security" },
];
// The admin console at /admin, for site admins only; it has its own nav and colours.
const adminNav: NavGroup[] = [{ label: "", items: [{ href: "/admin/waitlist", label: "Waitlist", icon: "admin" }] }];

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

// The set picked in the top bar, per team on this device; "" means all sets.
export function useCurrentSet(): [string, (id: string) => void] {
  const team = useSession().user.current_team.id;
  const key = `current-set:${team}`;
  return [useStored(key) ?? "", (id) => store(key, id)];
}

// The session cookie is on the API host, invisible to Next server code, so the check runs here, once for every app page.
export function AppShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResult | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  // The icon rail applies from md up; small screens keep the menu button.
  const collapsed = useStored("sidebar-collapsed") === "1";

  useEffect(() => {
    getMe().then((r) => {
      if (r === "signed_out") router.replace("/login");
      // brain refuses admin calls from anyone else; this only spares them a page of errors.
      else if (admin && typeof r === "object" && !r.user.is_admin) router.replace("/home");
      else setMe(r);
    });
  }, [router, admin]);

  const user = typeof me === "object" && me ? me.user : null;
  const groups = admin ? adminNav : nav;
  const session: Session | null = user && {
    user,
    setUser: (u) => setMe({ user: u }),
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
      <div className={`app-root ${admin ? "admin-root" : ""} min-h-dvh md:grid ${collapsed ? "md:grid-cols-[4rem_minmax(0,1fr)]" : "md:grid-cols-[15rem_minmax(0,1fr)]"}`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-20 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:font-bold">
          Skip to content
        </a>
        <aside
          className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--side)] md:h-dvh md:border-r md:border-b-0"
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) closeMenu();
          }}
        >
          <div className="flex h-full flex-col">
            <div
              className={`flex items-center justify-between gap-3 px-4 py-3 md:h-12 md:border-b md:border-[var(--line)] md:py-0 ${collapsed ? "md:justify-center md:px-0" : "md:px-4"}`}
            >
              <Link href={admin ? "/admin" : "/home"} className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
                <LogoMark className="size-7" />
                <span className={collapsed ? "md:sr-only" : ""}>SocialReins</span>
                {admin && <span className={`badge bg-signal-deep text-paper ${collapsed ? "md:sr-only" : ""}`}>Admin</span>}
              </Link>
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
              // Following a link (the nav or the account menu) closes the menu on small screens.
              onClick={(e) => (e.target as Element).closest("a") && setOpen(false)}
              className={`${open ? "flex" : "hidden"} max-h-[calc(100dvh-4rem)] min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2.5 pb-4 md:pt-3 md:flex md:max-h-none`}
            >
              <nav aria-label="App">
                <Suspense fallback={<NavGroups path="" groups={groups} collapsed={collapsed} />}>
                  <CurrentNavGroups groups={groups} collapsed={collapsed} />
                </Suspense>
              </nav>
              {/* minmax(0,1fr): a long team name or email truncates instead of widening the sidebar. */}
              <div className="mt-auto grid grid-cols-[minmax(0,1fr)]">
                {session ? <Account collapsed={collapsed} /> : <div className="h-10 rounded-md bg-ink/5 motion-safe:animate-pulse" />}
              </div>
            </div>
          </div>
        </aside>
        {/* The passkey prompt belongs to the app; admins see it there. */}
        {session && !admin && (
          <Suspense fallback={null}>
            <PasskeyPrompt />
          </Suspense>
        )}
        <div className="flex min-w-0 flex-col">
          <TopBar
            session={session !== null}
            admin={admin}
            pages={[...groups.flatMap((g) => g.items), ...profilePages]}
            collapsed={collapsed}
            onToggle={() => store("sidebar-collapsed", collapsed ? "0" : "1")}
          />
          <main id="main" tabIndex={-1} className="app-main mx-auto w-full max-w-7xl px-4 py-6 focus:outline-none sm:px-8 md:py-8">
            {content}
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}

function CurrentNavGroups(props: { groups: NavGroup[]; collapsed: boolean }) {
  return <NavGroups path={usePathname()} {...props} />;
}

function NavGroups({ path, groups, collapsed }: { path: string; groups: NavGroup[]; collapsed: boolean }) {
  return (
    <div className={`grid gap-3 ${collapsed ? "md:gap-2" : ""}`}>
      {groups.map((group, i) => (
        <NavSection key={group.label || "home"} path={path} group={group} collapsed={collapsed} first={i === 0} />
      ))}
    </div>
  );
}

// Hash links point into a page another link already marks as current.
// Home (/home) matches only itself, or it would hold every page.
export const isActive = (path: string, href: string) =>
  !href.includes("#") && (path === href || (href !== "/home" && path.startsWith(`${href}/`)));

function NavSection({ path, group, collapsed, first }: { path: string; group: NavGroup; collapsed: boolean; first: boolean }) {
  const key = `sidebar-group:${group.label}`;
  const closed = useStored(key) === "closed";
  // The group holding the current page always stays open.
  const holdsPage = group.items.some((item) => isActive(path, item.href));
  // A group without a label (Home) has no heading and is always open.
  const open = holdsPage || !closed || !group.label;
  const id = `nav-${group.label.toLowerCase().replaceAll(" ", "-") || "home"}`;

  return (
    <div className={collapsed && !first ? "md:border-t md:border-[var(--line)] md:pt-2" : ""}>
      {group.label && (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-disabled={holdsPage || undefined}
        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1 text-xs text-[var(--faint)] ${
          holdsPage ? "cursor-default" : "hover:text-ink"
        } ${collapsed ? "md:hidden" : ""}`}
        onClick={() => !holdsPage && store(key, closed ? "open" : "closed")}
      >
        {group.label}
        {!holdsPage && <Icon name="down" className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />}
      </button>
      )}
      {/* The rail shows every group, since its headings are hidden. */}
      <ul id={id} className={`mt-0.5 gap-px ${open ? "grid" : "hidden"} ${collapsed ? "md:mt-0 md:grid" : ""}`}>
        {group.items.map((item) => {
          const active = isActive(path, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`app-nav-link flex items-center gap-2.5 rounded-md px-2.5 py-1.5 ${collapsed ? "md:justify-center" : ""} ${
                  active ? "" : "text-[#3f3b37] hover:bg-ink/[0.045] hover:text-ink"
                }`}
              >
                <Icon name={item.icon} className={`size-4 ${active ? "" : "text-[var(--faint)]"}`} />
                <span className={collapsed ? "md:sr-only" : ""}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
