"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Failure } from "@/lib/auth";
import { compPlan, endCompPlan, listTeams, listUsers, MAX_STORAGE_BYTES, nextPage, pageQuery, parsePage, parseStorageBytes, previousPage, setStorageBudget, showing, type AdminTeam, type AdminUser, type Page } from "@/lib/admin";
import { isFailure, linkButton, problemText, roleName, Status, useAction } from "@/components/team-ui";
import { day, Forbidden, SearchBox, td, th } from "@/components/admin";
import { storageText } from "@/lib/uploads";

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
  const previous = previousPage(page, ok?.total);
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

const planNames: Record<string, string> = { scheduler: "Scheduler", automation: "Scheduler and Automation" };
const live = (status?: string | null) => status === "trialing" || status === "active" || status === "past_due";

// A team's plan in words, with Comp or End comp. A comp is free (no Stripe, no end); a live paid plan is never replaced here.
function PlanCell({ team }: { team: AdminTeam }) {
  const [plan, setPlan] = useState({ plan: team.plan ?? null, status: team.plan_status ?? null, provider: team.plan_provider ?? null });
  const action = useAction();
  const comped = plan.provider === "comp" && live(plan.status);
  const paid = plan.provider === "stripe" && live(plan.status);
  const name = plan.plan ? (planNames[plan.plan] ?? plan.plan) : null;
  const words = !name ? "No plan" : comped ? `${name}, comped` : `${name}, ${plan.status}`;
  return (
    <div className="grid justify-items-start gap-1">
      <span>{words}</span>
      {!paid && (
        <button
          type="button"
          className={linkButton}
          disabled={action.busy !== null}
          aria-label={`${comped ? "End comp for" : "Comp"} ${team.name}`}
          onClick={() =>
            comped
              ? action.run("end", () => endCompPlan(team.id), () => {
                  setPlan((p) => ({ ...p, status: "canceled" }));
                  return "Comp ended.";
                })
              : action.run("comp", () => compPlan(team.id, "automation"), () => {
                  setPlan({ plan: "automation", status: "active", provider: "comp" });
                  return "Comped Scheduler and Automation.";
                })
          }
        >
          {action.busy ? "Saving..." : comped ? "End comp" : "Comp"}
        </button>
      )}
      <Status problem={action.problem} done={action.done} overrides={{ has_paid_plan: "This team pays for a plan; change it in Stripe.", not_found: "There is no comp to end." }} />
    </div>
  );
}

// A team's upload storage in words and bytes, with a box and Save for its own budget. Blank means
// no override: brain's TEAM_STORAGE_BYTES applies. The text says what is used of what is allowed.
function StorageCell({ team }: { team: AdminTeam }) {
  const [storage, setStorage] = useState({ used: team.storage_used, budget: team.storage_budget, override: team.storage_budget_override });
  const [text, setText] = useState(team.storage_budget_override === null ? "" : String(team.storage_budget_override));
  const action = useAction();
  const bytes = parseStorageBytes(text);
  const field = "field w-36";
  return (
    <div className="grid justify-items-start gap-1">
      <span>
        Upload storage: {storageText(storage.used)} of {storage.budget === 0 ? "unlimited" : storageText(storage.budget)}
      </span>
      <form
        className="flex flex-wrap items-center gap-1"
        aria-label={`Upload storage budget for ${team.name} in bytes`}
        onSubmit={(e) => {
          e.preventDefault();
          if (bytes === "invalid") return;
          action.run("storage", () => setStorageBudget(team.id, bytes), (r) => {
            setStorage({ ...r, override: bytes });
            setText(bytes === null ? "" : String(bytes));
            return bytes === null ? "Budget back to the default." : `Upload storage budget saved: ${storageText(r.budget)}.`;
          });
        }}
      >
        <label className="sr-only" htmlFor={`storage-${team.id}`}>
          Upload storage budget in bytes, blank for the default, 0 for unlimited
        </label>
        <input
          id={`storage-${team.id}`}
          className={field}
          inputMode="numeric"
          value={text}
          placeholder={storage.override === null ? "Default" : ""}
          aria-invalid={bytes === "invalid"}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={linkButton} disabled={action.busy !== null || bytes === "invalid"}>
          {action.busy ? "Saving..." : "Save"}
        </button>
      </form>
      {bytes === "invalid" && (
        <span role="alert" className="text-xs text-danger">
          Whole bytes only, up to {storageText(MAX_STORAGE_BYTES)}; 0 is unlimited.
        </span>
      )}
      {storage.override === null ? (
        <span className="text-xs text-ink-soft">Default budget. Type bytes to set this team&apos;s own.</span>
      ) : (
        <span className="text-xs text-ink-soft">
          Own budget. Clear the box and Save for the default.
        </span>
      )}
      <Status problem={action.problem} done={action.done} overrides={{ not_found: "That team no longer exists." }} />
    </div>
  );
}

export function AdminTeamsList() {
  return (
    <AdminList<AdminTeam>
      base="/admin/teams"
      noun="teams"
      searchLabel="Search by team name"
      load={loadTeams}
      head={["Name", "Owner", "Plan", "Upload storage", "Members", "Accounts", "Posts", "Created"]}
      row={(t) => (
        <>
          <th scope="row" className={`${td} text-left font-bold`}>
            {t.name}
          </th>
          <td className={td}>{t.owner_email ?? <span className="text-ink-soft">No owner</span>}</td>
          <td className={td}>
            <PlanCell team={t} />
          </td>
          <td className={td}>
            <StorageCell team={t} />
          </td>
          <td className={td}>{t.members.toLocaleString()}</td>
          <td className={td}>{t.accounts.toLocaleString()}</td>
          <td className={td}>{t.posts.toLocaleString()}</td>
          <td className={`${td} whitespace-nowrap`}>{day(t.created_at)}</td>
        </>
      )}
    />
  );
}
