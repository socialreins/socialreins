"use client";

import { createContext, Suspense, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { TeamCode, TeamLink as Link, usePagePath } from "@/components/team-link";
import { usePathname, useRouter } from "next/navigation";
import { getMe, getTabTeam, setTabTeam, type MeResult, type Team, type User } from "@/lib/auth";
import { MY_TEAM, splitTeamPath, teamPath } from "@/lib/team-path";
import { Account } from "@/components/account";
import { LogoMark } from "@/components/logo";
import { TitleSlot } from "@/components/page-title";
import { PasskeyPrompt } from "@/components/passkey-prompt";
import { ThemeSwitch } from "@/components/theme";
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

// set: the set picked in the top bar changes what this page shows, so the top bar offers the switcher there.
export type NavItem = { href: string; label: string; icon: IconName; set?: true };
type NavGroup = { label: string; items: NavItem[] };
const nav: NavGroup[] = [
  { label: "", items: [{ href: "/home", label: "Home", icon: "home", set: true }] },
  {
    label: "Publish",
    items: [
      { href: "/posts", label: "Posts", icon: "compose", set: true },
      { href: "/calendar", label: "Calendar", icon: "posts", set: true },
      { href: "/lists", label: "Lists", icon: "lists", set: true },
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
      { href: "/connections", label: "Accounts", icon: "accounts", set: true },
      { href: "/sets", label: "Sets", icon: "sets" },
      { href: "/team", label: "Team", icon: "team" },
      { href: "/api-tokens", label: "API tokens", icon: "key" },
    ],
  },
];
// The admin console at /admin, for site admins only; it has its own nav and colours.
const adminNav: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/admin", label: "Overview", icon: "home" },
      { href: "/admin/users", label: "Users", icon: "user" },
      { href: "/admin/teams", label: "Teams", icon: "team" },
      { href: "/admin/waitlist", label: "Waitlist", icon: "admin" },
      { href: "/admin/settings", label: "Sign-up settings", icon: "settings" },
    ],
  },
];

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
export function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function useStored(key: string) {
  return useSyncExternalStore(subscribe, () => read(key), () => null);
}
export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  listeners.forEach((f) => f());
}

// The set picked in the top bar, per team on this device; "" only until the top bar picks the Default set.
export function useCurrentSet(): [string, (id: string) => void] {
  const team = useSession().user.current_team.id;
  const key = `current-set:${team}`;
  return [useStored(key) ?? "", (id) => store(key, id)];
}

// Marks <html> while an app shell is showing, so the dark page background stays off the landing and sign-in pages.
// Counted, since Next can keep the app and admin shells both mounted; hiding one runs its cleanup.
let shells = 0;
function useAppMark() {
  useEffect(() => {
    shells++;
    document.documentElement.dataset.app = "";
    return () => {
      if (--shells === 0) delete document.documentElement.dataset.app;
    };
  }, []);
}

// The session cookie is on the API host, invisible to Next server code, so the check runs here, once for every app page.
export function AppShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResult | null>(null);
  const [open, setOpen] = useState(false);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  // The icon rail applies from md up; small screens keep the menu button.
  const collapsed = useStored("sidebar-collapsed") === "1";
  useAppMark();

  // The team code in the address: undefined until read, null on a page outside /t/ (profile, /admin).
  const [urlTeam, setUrlTeam] = useState<string | null | undefined>(undefined);
  // The code of the team whose session is loaded, for the effect below; kept in step after every render.
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    loaded.current = typeof me === "object" && me ? me.user.current_team.code : null;
  }, [me]);

  useEffect(() => {
    if (urlTeam === undefined) return;
    let live = true;
    // The address names the team and every call carries it. A page outside /t/ (profile, /admin) keeps the team this tab
    // is on. "_" names none: brain answers with the account's current team.
    // This also runs when Next shows a kept shell again (Back), so the tab's team and the sign-in are checked afresh.
    if (urlTeam === null) setTabTeam(loaded.current ?? getTabTeam());
    else setTabTeam(urlTeam === MY_TEAM ? null : urlTeam);
    getMe().then((r) => {
      if (!live) return;
      if (r === "signed_out") return router.replace("/login");
      if (typeof r !== "object") return setMe(r);
      // brain refuses admin calls from anyone else; this only spares them a page of errors.
      if (admin && !r.user.is_admin) return router.replace(teamPath(MY_TEAM, "/home"));
      const code = r.user.current_team.code;
      setTabTeam(code);
      setMe(r);
      // An old address (/posts, sent here as /t/_/posts): show the team's real one, keeping the query and the hash.
      if (urlTeam === MY_TEAM) router.replace(teamPath(code, splitTeamPath(location.pathname)[1]) + location.search + location.hash);
    });
    return () => {
      live = false;
    };
  }, [urlTeam, router, admin]);

  const user = typeof me === "object" && me ? me.user : null;
  const groups = admin ? adminNav : nav;
  const session: Session | null = user && {
    user,
    setUser: (u) => setMe({ user: u }),
    // After a switch, a new team or a rename. A new team's address replaces the old one, on the same section:
    // the rest of the address (a post id) belongs to the team being left.
    setTeam: (t) => {
      setTabTeam(t.code);
      setMe({ user: { ...user, current_team: t } });
      if (urlTeam && urlTeam !== t.code) router.push(teamPath(t.code, `/${location.pathname.split("/")[3] ?? "home"}`));
    },
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

  const waiting = (
      <div aria-busy="true" className="grid gap-6">
        <p role="status" className="sr-only">
          Loading...
        </p>
        <div className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
        <div className="h-24 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
      </div>
  );

  const content =
    me === "error" ? (
      <p role="alert" className="waitlist-error">
        Sign-in couldn&apos;t be checked. Reload to try again.
      </p>
    ) : me === "not_found" ? (
      // A team the user is not in and a code no team has look the same, here and in brain.
      <div className="grid gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="text-ink-soft">This address doesn&apos;t lead to a team you belong to.</p>
        <Link href="/home" className="btn btn-primary justify-self-start">
          Go to your team
        </Link>
      </div>
    ) : session ? (
      // A new current team remounts the page, so it loads that team's data.
      <Suspense fallback={waiting}>
        <OnTeam key={session.user.current_team.id} code={session.user.current_team.code} fallback={waiting}>
          {children}
        </OnTeam>
      </Suspense>
    ) : (
      waiting
    );

  return (
    <SessionContext.Provider value={session}>
      <TeamCode.Provider value={user?.current_team.code ?? MY_TEAM}>
      <Suspense fallback={null}>
        <TeamInAddress onCode={setUrlTeam} />
      </Suspense>
      <div className={`app-root ${admin ? "admin-root" : ""} min-h-dvh md:grid ${collapsed ? "md:grid-cols-[4rem_minmax(0,1fr)]" : "md:grid-cols-[15rem_minmax(0,1fr)]"}`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-20 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:font-bold">
          Skip to content
        </a>
        <aside
          className="sticky top-0 z-10 max-h-dvh border-b border-[var(--line)] bg-[var(--side)] md:h-dvh md:border-r md:border-b-0"
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) closeMenu();
          }}
        >
          <div className="flex h-full max-h-dvh flex-col">
            <div
              className={`flex items-center justify-between gap-3 px-2.5 py-2 md:min-h-12 md:pt-3 md:pb-1 ${collapsed ? "md:justify-center md:px-0" : ""}`}
            >
              {/* The logo: mark and name, or only the mark on the icon rail. The team is in the top bar. */}
              <Link
                href={admin ? "/admin" : "/home"}
                className="flex items-center gap-2 px-1.5 font-display text-base font-bold tracking-tight"
                onClick={() => setOpen(false)}
              >
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
              className={`${open ? "flex" : "hidden"} min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2.5 pb-3 md:pt-3 md:flex`}
            >
              <nav aria-label="App">
                <Suspense fallback={<NavGroups path="" groups={groups} collapsed={collapsed} />}>
                  <CurrentNavGroups groups={groups} collapsed={collapsed} />
                </Suspense>
              </nav>
              {/* minmax(0,1fr): a long name or email truncates instead of widening the sidebar. */}
              <div className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-2">
                <ThemeSwitch collapsed={collapsed} />
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
            pages={groups.flatMap((g) => g.items)}
            collapsed={collapsed}
            onToggle={() => store("sidebar-collapsed", collapsed ? "0" : "1")}
            titleRef={setTitleSlot}
          />
          <main id="main" tabIndex={-1} className="app-main mx-auto w-full max-w-7xl px-4 py-6 focus:outline-none sm:px-8 md:py-8">
            <TitleSlot.Provider value={titleSlot}>{content}</TitleSlot.Provider>
          </main>
        </div>
      </div>
      </TeamCode.Provider>
    </SessionContext.Provider>
  );
}

// The page, once the address and the loaded team agree. Read from the address in the same render as the page,
// so a page never mounts under another team (mid-switch, or Back to another team); it waits for its own.
function OnTeam({ code, fallback, children }: { code: string; fallback: ReactNode; children: ReactNode }) {
  const inAddress = splitTeamPath(usePathname())[0];
  return inAddress === null || inAddress === code ? <div>{children}</div> : fallback;
}

// Reads the team code from the address. On its own under Suspense: usePathname waits for the request on /t/[team] pages.
function TeamInAddress({ onCode }: { onCode: (code: string | null) => void }) {
  const code = splitTeamPath(usePathname())[0];
  useEffect(() => onCode(code), [code, onCode]);
  return null;
}

function CurrentNavGroups(props: { groups: NavGroup[]; collapsed: boolean }) {
  return <NavGroups path={usePagePath()} {...props} />;
}

function NavGroups({ path, groups, collapsed }: { path: string; groups: NavGroup[]; collapsed: boolean }) {
  return (
    <div className={`grid gap-4 ${collapsed ? "md:gap-2" : ""}`}>
      {groups.map((group, i) => (
        <NavSection key={group.label || "home"} path={path} group={group} collapsed={collapsed} first={i === 0} />
      ))}
    </div>
  );
}

// Hash links point into a page another link already marks as current.
// Home (/home) and the admin Overview (/admin) match only themselves, or they would hold every page.
export const isActive = (path: string, href: string) =>
  !href.includes("#") && (path === href || (href !== "/home" && href !== "/admin" && path.startsWith(`${href}/`)));

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
        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide text-[var(--faint)] ${
          holdsPage ? "cursor-default" : "hover:text-ink"
        } ${collapsed ? "md:hidden" : ""}`}
        onClick={() => !holdsPage && store(key, closed ? "open" : "closed")}
      >
        {group.label}
        {!holdsPage && <Icon name="down" className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />}
      </button>
      )}
      {/* The rail shows every group, since its headings are hidden. */}
      <ul id={id} className={`mt-1 gap-0.5 ${open ? "grid" : "hidden"} ${collapsed ? "md:mt-0 md:grid" : ""}`}>
        {group.items.map((item) => {
          const active = isActive(path, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-tip={collapsed ? item.label : undefined}
                className={`app-nav-link flex h-8 items-center gap-2.5 rounded-md px-2.5 font-medium ${collapsed ? "md:justify-center" : ""} ${
                  active ? "" : "text-[var(--nav)] hover:bg-ink/[0.05] hover:text-ink"
                }`}
              >
                <Icon name={item.icon} className={`size-[1.125rem] ${active ? "" : "text-[var(--faint)]"}`} />
                <span className={collapsed ? "md:sr-only" : ""}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
