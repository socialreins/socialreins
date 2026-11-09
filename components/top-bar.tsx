"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Failure, Team } from "@/lib/auth";
import { listSets, type SocialSet } from "@/lib/sets";
import { createTeam, listTeams, switchTeam } from "@/lib/teams";
import { isActive, useCurrentSet, useSession, type NavItem } from "@/components/app-shell";
import { Icon } from "@/components/ui";
import { isFailure, problemText, roleName, Status, useAction } from "@/components/team-ui";

const crumb = "flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 font-bold hover:bg-ink/[0.045]";
const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-ink/[0.045]";

// Above every app page: the sidebar toggle, then where you are as Team / Set / page; team and set open menus to switch.
export function TopBar({ session, admin, pages, collapsed, onToggle }: { session: boolean; admin: boolean; pages: NavItem[]; collapsed: boolean; onToggle: () => void }) {
  return (
    <header className="flex h-12 items-center gap-1 border-b border-[var(--line)] bg-paper px-3 text-sm sm:px-6 md:sticky md:top-0 md:z-[5]">
      <button
        type="button"
        className="mr-1 hidden size-8 place-items-center rounded-md text-ink-soft hover:bg-ink/[0.045] hover:text-ink md:grid"
        aria-expanded={!collapsed}
        aria-controls="app-menu"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggle}
      >
        <Icon name="sidebar" className="size-4" />
      </button>
      {session && (
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-0.5">
            {admin ? (
              <li className="min-w-0">
                <Link href="/admin" className={crumb}>
                  Admin console
                </Link>
              </li>
            ) : (
              <>
                <li className="min-w-0">
                  <TeamMenu />
                </li>
                <li aria-hidden="true" className="text-[var(--line)]">/</li>
                <li className="min-w-0">
                  <Suspense fallback={null}>
                    <TeamSets />
                  </Suspense>
                </li>
              </>
            )}
            <Suspense fallback={null}>
              <PageCrumb pages={pages} />
            </Suspense>
          </ol>
        </nav>
      )}
    </header>
  );
}

function PageCrumb({ pages }: { pages: NavItem[] }) {
  const path = usePathname();
  const page = pages.find((p) => isActive(path, p.href));
  if (!page) return null;
  return (
    <>
      <li aria-hidden="true" className="hidden text-[var(--line)] sm:block">/</li>
      <li className="hidden truncate px-2 text-ink-soft sm:block">
        <span aria-current="page">{page.label}</span>
      </li>
    </>
  );
}

// A button that opens a small panel under it (a native popover: Escape and clicking outside close it).
function Menu({ id, trigger, onOpen, children }: { id: string; trigger: ReactNode; onOpen?: () => void; children: ReactNode }) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  return (
    <>
      <button ref={button} type="button" popoverTarget={id} className={crumb}>
        {trigger}
        <Icon name="down" className="size-3.5 text-[var(--faint)]" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        // Placed before it shows, so it never paints in the wrong spot.
        onBeforeToggle={(e) => {
          if ((e.nativeEvent as ToggleEvent).newState !== "open") return;
          const r = button.current!.getBoundingClientRect();
          panel.current!.style.top = `${r.bottom + 4}px`;
          panel.current!.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 296))}px`;
          onOpen?.();
        }}
        className="app-root fixed m-0 w-72 max-w-[calc(100vw-1rem)] rounded-lg bg-paper p-1.5 text-sm shadow-[0_0_0_1px_var(--line),0_10px_30px_rgb(0_0_0/0.12)] [inset:auto]"
      >
        {children}
      </div>
    </>
  );
}

const hide = (id: string) => (document.getElementById(id) as HTMLElement | null)?.hidePopover();

function TeamMenu() {
  const { user, setTeam } = useSession();
  const current = user.current_team;
  const [teams, setTeams] = useState<Team[] | Failure | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const { busy, problem, done, run } = useAction();

  // Focus follows the form: into the name field when it opens, back to "New team" when it closes.
  function openCreate(open: boolean) {
    flushSync(() => setCreating(open));
    (open ? nameRef : newRef).current?.focus();
  }

  function onSwitch(t: Team) {
    run("switch", () => switchTeam(t.id), (team) => {
      setTeam(team);
      return `Switched to ${team.name}.`;
    });
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run("create", () => createTeam(name), (team) => {
      setTeam(team);
      setTeams((ts) => (Array.isArray(ts) ? [...ts, team] : [team]));
      setCreating(false);
      setName("");
      return `Created ${team.name}. It is now your current team.`;
    });
  }

  return (
    <Menu
      id="team-menu"
      onOpen={() => listTeams().then(setTeams)}
      trigger={
        <>
          <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded bg-signal-deep text-[0.6875rem] font-bold text-paper">
            {current.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate" title={current.name}>
            {current.name}
          </span>
        </>
      }
    >
      <p className="px-2 pt-1 pb-1.5 text-xs text-ink-soft">
        Your teams
      </p>
      {isFailure(teams) && (
        <p role="alert" className="waitlist-error px-2">
          Your teams couldn&apos;t be loaded. {problemText(teams)}
        </p>
      )}
      {teams === null && <div className="mx-2 h-8 rounded-md bg-ink/5 motion-safe:animate-pulse" />}
      {Array.isArray(teams) && (
        <ul className="grid">
          {teams.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={item}
                aria-current={t.id === current.id || undefined}
                disabled={busy !== null || t.id === current.id}
                onClick={() => onSwitch(t)}
              >
                <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded bg-ink/10 text-[0.6875rem] font-bold">
                  {t.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="text-xs text-ink-soft">{roleName[t.role]}</span>
                {t.id === current.id && <Icon name="check" className="size-4 text-signal-deep" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="my-1.5 border-t border-[var(--line)]" />
      {creating ? (
        <form onSubmit={onCreate} className="grid gap-1.5 px-2 pb-1">
          <label htmlFor="new-team-name" className="label">
            New team name
          </label>
          <input
            ref={nameRef}
            id="new-team-name"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={problem === "invalid_name" || undefined}
            className="field"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy !== null}>
              {busy === "create" ? "Creating..." : "Create team"}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => openCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button ref={newRef} type="button" className={item} onClick={() => openCreate(true)}>
          <Icon name="plus" className="size-4 text-ink-soft" />
          New team
        </button>
      )}
      <Link href="/team" className={item} onClick={() => hide("team-menu")}>
        <Icon name="team" className="size-4 text-ink-soft" />
        Manage team
      </Link>
      <div className="px-2">
        <Status problem={problem} done={done} />
      </div>
    </Menu>
  );
}

// Keyed by team, so a team switch starts the set menu fresh instead of checking the new team's set against the old team's sets.
function TeamSets() {
  return <SetMenu key={useSession().user.current_team.id} path={usePathname()} />;
}

function SetMenu({ path }: { path: string }) {
  const [current, setCurrent] = useCurrentSet();
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);

  // The name of a picked set is needed before the menu opens; with all sets, nothing to load yet.
  // Loaded again on each page change, so a set deleted on the Sets page drops out of the filter.
  useEffect(() => {
    let live = true;
    if (current) listSets().then((r) => live && setSets(r));
    return () => {
      live = false;
    };
  }, [current, path]);
  // A set deleted elsewhere falls back to all sets.
  useEffect(() => {
    if (current && Array.isArray(sets) && !sets.some((s) => s.id === current)) setCurrent("");
  }, [current, sets, setCurrent]);

  const name = (Array.isArray(sets) && sets.find((s) => s.id === current)?.name) || "All sets";
  const pick = (id: string) => {
    setCurrent(id);
    hide("set-menu");
  };
  const option = (id: string, label: string) => (
    <li key={id || "all"}>
      <button type="button" className={item} aria-current={id === current || undefined} onClick={() => pick(id)}>
        <Icon name={id ? "sets" : "lists"} className="size-4 text-ink-soft" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {id === current && <Icon name="check" className="size-4 text-signal-deep" />}
      </button>
    </li>
  );

  return (
    <Menu id="set-menu" onOpen={() => listSets().then(setSets)} trigger={<span className="truncate">{name}</span>}>
      <p className="px-2 pt-1 pb-1.5 text-xs text-ink-soft">Show posts from one set, or all of them.</p>
      {isFailure(sets) && (
        <p role="alert" className="waitlist-error px-2">
          Sets couldn&apos;t be loaded. {problemText(sets)}
        </p>
      )}
      <ul className="grid">
        {option("", "All sets")}
        {Array.isArray(sets) && sets.map((s) => option(s.id, s.name))}
      </ul>
      <div className="my-1.5 border-t border-[var(--line)]" />
      <Link href="/sets" className={item} onClick={() => hide("set-menu")}>
        <Icon name="edit" className="size-4 text-ink-soft" />
        Manage sets
      </Link>
    </Menu>
  );
}
