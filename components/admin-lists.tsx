"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Failure } from "@/lib/auth";
import { listTeams, listUsers, nextPage, pageQuery, parsePage, previousPage, showing, type AdminTeam, type AdminUser, type Page } from "@/lib/admin";
import { isFailure, problemText, roleName } from "@/components/team-ui";
import { day, Forbidden, SearchBox, td, th } from "@/components/admin";

type Rows<R> = { total: number; rows: R[] };

const loadUsers = (p: Page) => listUsers(p).then((r) => (isFailure(r) ? r : { total: r.total, rows: r.users }));
const loadTeams = (p: Page) => listTeams(p).then((r) => (isFailure(r) ? r : { total: r.total, rows: r.teams }));

// One searchable, paged admin table. The search and the page live in `?q=&limit=&offset=`, so a reload keeps them.
function AdminList<R extends { id: string }>({
  base,
  noun,
  searchLabel,
  load,
  head,
  row,
}: {
  base: string;
  noun: string;
  searchLabel: string;
  load: (p: Page) => Promise<Rows<R> | Failure>;
  head: string[];
  row: (r: R) => ReactNode;
}) {
  const page = parsePage(useSearchParams());
  const key = pageQuery(page);
  // The answer remembers its page, so a new page shows loading, not the old rows.
  const [loaded, setLoaded] = useState<{ key: string; data: Rows<R> | Failure } | null>(null);
  const { q, limit, offset } = page;

  useEffect(() => {
    let live = true;
    load({ q, limit, offset }).then((data) => live && setLoaded({ key, data }));
    return () => {
      live = false;
    };
  }, [load, key, q, limit, offset]);

  const data = loaded?.key === key ? loaded.data : null;
  if (data === "forbidden") return <Forbidden />;
  const ok = data !== null && !isFailure(data) ? data : null;
  const previous = previousPage(page);
  const next = ok && nextPage(page, ok.total);

  return (
    <div className="grid gap-4">
      <SearchBox label={searchLabel} q={q} hrefFor={(text) => `${base}${pageQuery({ q: text, limit, offset: 0 })}`} />
      {isFailure(data) ? (
        <p role="alert" className="waitlist-error">
          The {noun} couldn&apos;t be loaded. {problemText(data)}
        </p>
      ) : !ok ? (
        <p role="status" className="text-ink-soft">
          Loading {noun}...
        </p>
      ) : (
        <>
          {ok.rows.length === 0 ? (
            <p className="text-ink-soft">{q ? `No ${noun} match "${q}".` : `No ${noun} here.`}</p>
          ) : (
            // Scrolls sideways on phones rather than squeezing the columns.
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <caption className="sr-only">
                  {noun[0].toUpperCase() + noun.slice(1)}, newest first
                </caption>
                <thead>
                  <tr className="text-left text-xs text-ink-soft">
                    {head.map((h) => (
                      <th key={h} scope="col" className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ok.rows.map((r) => (
                    <tr key={r.id} className="border-t border-ink/10 first:border-t-0">
                      {row(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-ink-soft">
              {showing(offset, ok.rows.length, ok.total)}
            </p>
            {(previous || next) && (
              <nav aria-label="Pages" className="flex gap-2">
                {previous && (
                  <Link href={`${base}${pageQuery(previous)}`} className="btn btn-secondary btn-sm">
                    Previous
                  </Link>
                )}
                {next && (
                  <Link href={`${base}${pageQuery(next)}`} className="btn btn-secondary btn-sm">
                    Next
                  </Link>
                )}
              </nav>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const role = (r: string) => (r in roleName ? roleName[r as keyof typeof roleName] : r);

export function AdminUsersList() {
  return (
    <AdminList<AdminUser>
      base="/admin/users"
      noun="users"
      searchLabel="Search by name or email"
      load={loadUsers}
      head={["Name", "Email", "Teams", "Joined", "Last sign-in"]}
      row={(u) => (
        <>
          <th scope="row" className={`${td} text-left font-bold`}>
            <span className="flex flex-wrap items-center gap-2">
              {u.name || "No name"}
              {u.is_admin && <span className="badge bg-signal-deep text-paper">Admin</span>}
            </span>
          </th>
          <td className={td}>{u.email}</td>
          <td className={td}>
            {u.teams.length === 0 ? (
              <span className="text-ink-soft">None</span>
            ) : (
              <ul className="grid gap-0.5">
                {u.teams.map((t) => (
                  <li key={t.id}>
                    {t.name} <span className="text-ink-soft">({role(t.role)})</span>
                  </li>
                ))}
              </ul>
            )}
          </td>
          <td className={`${td} whitespace-nowrap`}>{day(u.created_at)}</td>
          <td className={`${td} whitespace-nowrap`}>{u.last_sign_in_at ? day(u.last_sign_in_at) : <span className="text-ink-soft">Never, or signed out</span>}</td>
        </>
      )}
    />
  );
}

export function AdminTeamsList() {
  return (
    <AdminList<AdminTeam>
      base="/admin/teams"
      noun="teams"
      searchLabel="Search by team name"
      load={loadTeams}
      head={["Name", "Owner", "Members", "Accounts", "Posts", "Created"]}
      row={(t) => (
        <>
          <th scope="row" className={`${td} text-left font-bold`}>
            {t.name}
          </th>
          <td className={td}>{t.owner_email ?? <span className="text-ink-soft">No owner</span>}</td>
          <td className={td}>{t.members.toLocaleString()}</td>
          <td className={td}>{t.accounts.toLocaleString()}</td>
          <td className={td}>{t.posts.toLocaleString()}</td>
          <td className={`${td} whitespace-nowrap`}>{day(t.created_at)}</td>
        </>
      )}
    />
  );
}
