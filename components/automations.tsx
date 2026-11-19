"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import { TeamLink as Link } from "@/components/team-link";
import { useTeamRouter as useRouter } from "@/components/team-link";
import type { Failure } from "@/lib/auth";
import {
  actionName,
  actionsSummary,
  conditionNotes,
  deleteAutomation,
  getAutomation,
  listAutomations,
  listRuns,
  reason,
  switchAutomation,
  templates,
  triggers,
  type Automation,
  type Run,
} from "@/lib/automations";
import { authorName, getItem, type Author } from "@/lib/inbox";
import { listConnections, type Connection } from "@/lib/connections";
import { listSets, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { AutomationForm, automationMessages, triggerIcon } from "@/components/automation-form";
import { scopeSummary } from "@/components/scope-fields";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const statusName: Record<Run["status"], string> = { running: "Running", sent: "Sent", failed: "Failed", skipped: "Skipped" };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// The team's accounts and sets, for the scope fields and summaries.
function useScopeData() {
  const [accounts, setAccounts] = useState<Connection[] | null>(null);
  const [sets, setSets] = useState<SocialSet[]>([]);
  useEffect(() => {
    // A failed load still settles, so the form can be used; post links by handle then need a reload.
    listConnections().then((r) => setAccounts(Array.isArray(r) ? r : []));
    listSets().then((r) => Array.isArray(r) && setSets(r));
  }, []);
  return { accounts: accounts ?? [], ready: accounts !== null, sets };
}

// On and off as a switch. Members see the state as text.
function ActiveSwitch({ automation: a, canManage, onChange }: { automation: Automation; canManage: boolean; onChange: (a: Automation) => void }) {
  const { busy, problem, done, run } = useAction();
  if (!canManage) return <span className="badge tone" data-status={a.active ? "sent" : undefined}>{a.active ? "On" : "Off"}</span>;
  return (
    <span className="grid justify-items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={a.active}
        aria-label={a.name}
        disabled={busy !== null}
        onClick={() => run("switch", () => switchAutomation(a.id, !a.active), (r) => {
          onChange(r);
          return `${r.name} is ${r.active ? "on" : "off"}.`;
        })}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-progress ${a.active ? "bg-ink" : "bg-ink/20"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 left-1 size-5 rounded-full bg-paper transition-transform motion-reduce:transition-none ${a.active ? "translate-x-5 bg-signal" : ""}`}
        />
      </button>
      <span role="status" className="sr-only">
        {done?.text}
      </span>
      {problem && (
        <span role="alert" className="max-w-56 text-right text-xs font-bold text-signal-deep">
          Not switched. {problemText(problem, automationMessages)}
        </span>
      )}
    </span>
  );
}

// Sent, Skipped and Failed as small figures, with the last run's time.
function Stats({ runs }: { runs: Automation["runs"] }) {
  if (!runs) return null;
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
      <dl aria-label="Runs" className="flex gap-5">
        {(["sent", "skipped", "failed"] as const).map((k) => (
          <div key={k}>
            <dt className="text-xs text-ink-soft">{statusName[k]}</dt>
            <dd className={`font-bold tabular-nums ${k === "failed" && runs.failed ? "text-signal-deep" : ""}`}>{runs[k]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-soft">{runs.last_at ? `Last run ${when(runs.last_at)}` : "No runs yet"}</p>
    </div>
  );
}

// The trigger in words with its icon, the keywords, then scope, conditions and what it does.
function Summary({ automation: a, accounts, sets }: { automation: Automation; accounts: Connection[]; sets: SocialSet[] }) {
  const keywords = a.conditions.keywords ?? [];
  return (
    <>
      <p className="flex items-center gap-2 text-[0.95rem]">
        <Icon name={triggerIcon[a.trigger] ?? "automations"} className="size-4 text-ink-soft" />
        {triggers[a.trigger]?.label ?? a.trigger}
      </p>
      {keywords.length > 0 && (
        <ul aria-label="Keywords" className="flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <li key={k} className="badge tone text-ink">
              {k}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-soft">
        {[scopeSummary(a.conditions, accounts, sets), ...conditionNotes(a.conditions), actionsSummary(a)].join(". ")}.
      </p>
    </>
  );
}

export function Automations() {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const [list, setList] = useState<Automation[] | Failure | null>(null);
  const { accounts, sets } = useScopeData();

  useEffect(() => {
    listAutomations().then(setList);
  }, []);

  // Switching on or off answers without run counts, so the listed ones stay.
  const replace = (a: Automation) => setList((l) => (Array.isArray(l) ? l.map((x) => (x.id === a.id ? { ...a, runs: x.runs } : x)) : l));

  return (
    <section aria-labelledby="automations-heading" className="grid gap-4">
      <h2 id="automations-heading" className="sr-only">
        Your automations
      </h2>
      {!canManage && <p className="text-ink-soft">Only team owners and admins can create or change automations.</p>}
      {list === null ? (
        <div role="status" className="h-40 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
          <span className="sr-only">Loading automations...</span>
        </div>
      ) : isFailure(list) ? (
        <p role="alert" className="waitlist-error">
          Automations couldn&apos;t be loaded. {problemText(list)}
        </p>
      ) : list.length === 0 ? (
        <div className="card grid gap-3 p-6">
          <p>
            <strong className="block">No automations yet</strong>
            <span className="text-ink-soft">
              Answer comments, DMs, mentions, new followers and story replies on your own: a DM to everyone who comments &quot;link&quot;, a welcome to a first message. Start from a template.
            </span>
          </p>
          {canManage && (
            <Link href="/automations/new" className="btn btn-primary justify-self-start">
              <Icon name="plus" className="size-4" />
              New automation
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid gap-3">
          {list.map((a) => (
            <li key={a.id} className="card relative flex items-start gap-4 p-5">
              <span className={`hidden size-10 shrink-0 place-items-center rounded-xl sm:grid ${a.active ? "bg-signal/10 text-signal-deep" : "bg-ink/5 text-ink-soft"}`}>
                <Icon name={triggerIcon[a.trigger] ?? "automations"} />
              </span>
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Link href={`/automations/${a.id}`} className="font-bold hover:underline">
                  {a.name}
                </Link>
                <Summary automation={a} accounts={accounts} sets={sets} />
                <Stats runs={a.runs} />
              </div>
              <ActiveSwitch automation={a} canManage={canManage} onChange={replace} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AutomationDetail({ id }: { id: string }) {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const router = useRouter();
  const [a, setA] = useState<Automation | Failure | null>(null);
  const [runs, setRuns] = useState<{ runs: Run[]; next: string | null } | Failure | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<{ text: string; n: number } | null>(null);
  // Who each run answered: the author of its inbox item, null when the item can't be read.
  const [people, setPeople] = useState<Record<string, Author | null>>({});
  const asked = useRef(new Set<string>());
  const { accounts, ready, sets } = useScopeData();
  const del = useAction();
  const more = useAction();
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getAutomation(id).then(setA);
    listRuns(id).then((r) => setRuns(isFailure(r) ? r : { runs: r.runs, next: r.next_cursor }));
  }, [id]);

  // shortcut: one request per run's item (50 a page), since brain's runs carry no author; ask brain for it in the run if this gets slow.
  useEffect(() => {
    if (!runs || isFailure(runs)) return;
    for (const r of runs.runs) {
      if (asked.current.has(r.inbox_item_id)) continue;
      asked.current.add(r.inbox_item_id);
      getItem(r.inbox_item_id).then((i) => setPeople((p) => ({ ...p, [r.inbox_item_id]: isFailure(i) ? null : i.author })));
    }
  }, [runs]);

  if (a === null) return <div role="status" className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse"><span className="sr-only">Loading the automation...</span></div>;
  if (isFailure(a))
    return (
      <p role="alert" className="waitlist-error">
        This automation couldn&apos;t be loaded. {problemText(a, automationMessages)}
      </p>
    );

  async function onDelete(x: Automation) {
    const ok = await del.run("delete", () => deleteAutomation(x.id), () => {
      router.push("/automations");
    });
    if (!ok) confirmRef.current?.focus();
  }

  const close = () => {
    flushSync(() => setEditing(false));
    editRef.current?.focus();
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      {editing ? (
        <AutomationForm
          automation={a}
          accounts={accounts}
          ready={ready}
          sets={sets}
          onCancel={close}
          onSaved={(saved) => {
            setA((cur) => ({ ...saved, runs: cur && !isFailure(cur) ? cur.runs : undefined }));
            close();
            setSaved((n) => ({ text: "Automation saved.", n: (n?.n ?? 0) + 1 }));
          }}
        />
      ) : (
        <section aria-labelledby="summary-heading" className="card grid gap-4 p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid min-w-0 flex-1 basis-64 gap-1">
              <h2 id="summary-heading" className={heading}>
                {a.name}
              </h2>
              <Summary automation={a} accounts={accounts} sets={sets} />
              <p className="text-sm text-ink-soft">{a.active ? `On since ${when(a.activated_at)}.` : "Off."}</p>
            </div>
            <ActiveSwitch automation={a} canManage={canManage} onChange={(x) => setA({ ...x, runs: a.runs })} />
          </div>
          <Stats runs={a.runs} />
          <dl className="grid gap-3 sm:grid-cols-2">
            {a.actions.map((x) => (
              <div key={x.type} className="grid gap-1 rounded-xl bg-canvas p-3">
                <dt className="text-sm font-bold">{actionName[x.type]}</dt>
                <dd className="whitespace-pre-wrap break-words">{x.text}</dd>
              </div>
            ))}
            {a.fallback_public_reply && (
              <div className="grid gap-1 rounded-xl bg-canvas p-3">
                <dt className="text-sm font-bold">Public reply if the DM can&apos;t go</dt>
                <dd className="whitespace-pre-wrap break-words">{a.fallback_public_reply}</dd>
              </div>
            )}
          </dl>
          {canManage &&
            (confirming ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-3">
                <p id="automation-delete-q" className="text-sm">
                  Delete {a.name} and its run history? Replies it sent stay.
                </p>
                <button
                  ref={confirmRef}
                  type="button"
                  autoFocus
                  className="btn btn-primary btn-sm"
                  aria-describedby="automation-delete-q"
                  disabled={del.busy !== null}
                  onClick={() => onDelete(a)}
                >
                  {del.busy ? "Deleting..." : "Yes, delete"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    flushSync(() => setConfirming(false));
                    deleteRef.current?.focus();
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button ref={editRef} type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  <Icon name="edit" className="size-4" />
                  Edit
                </button>
                <button ref={deleteRef} type="button" className="btn btn-quiet btn-danger btn-sm" onClick={() => setConfirming(true)}>
                  <Icon name="trash" className="size-4" />
                  Delete
                </button>
              </div>
            ))}
          <Status problem={del.problem} done={del.done} overrides={automationMessages} />
          {!del.problem && saved && (
            <p key={saved.n} role="status" className="waitlist-done">
              {saved.text}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="runs-heading" className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <h2 id="runs-heading" className={heading}>
          Run history
        </h2>
        {runs === null ? (
          <div role="status" className="h-32 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading runs...</span>
          </div>
        ) : isFailure(runs) ? (
          <p role="alert" className="waitlist-error">
            Runs couldn&apos;t be loaded. {problemText(runs)}
          </p>
        ) : runs.runs.length === 0 ? (
          <p className="card p-5 text-ink-soft">No runs yet. Each time it acts, the run shows here with who it answered and what was sent.</p>
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs text-ink-soft">
                  <tr>
                    {["Status", "Who", "When", "What happened"].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 font-bold">
                        {h}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Inbox</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10 border-t border-ink/10">
                  {runs.runs.map((r) => {
                    const who = people[r.inbox_item_id];
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="px-4 py-3">
                          <span className="badge tone" data-status={r.status === "skipped" ? undefined : r.status}>
                            {statusName[r.status]}
                          </span>
                        </td>
                        <td className="max-w-40 truncate px-4 py-3 font-bold">{who ? authorName(who) : who === null ? "Unknown" : "..."}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                          <time dateTime={r.created_at}>{when(r.created_at)}</time>
                        </td>
                        <td className="px-4 py-3">
                          {r.reason && <p>{reason(r.reason)}</p>}
                          {r.results.length > 0 && (
                            <ul aria-label="Actions" className="text-ink-soft">
                              {r.results.map((x, i) => (
                                <li key={i}>
                                  {actionName[x.type]}: {statusName[x.status].toLowerCase()}
                                  {x.reason && x.reason !== r.reason ? ` (${reason(x.reason)})` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Link href={`/inbox?item=${encodeURIComponent(r.inbox_item_id)}`} className="font-bold underline decoration-signal decoration-2 underline-offset-4">
                            Open in inbox<span className="sr-only">, {when(r.created_at)}</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {runs.next && (
              <button
                type="button"
                className="btn btn-secondary btn-sm justify-self-start"
                disabled={more.busy !== null}
                onClick={() =>
                  more.run("more", () => listRuns(id, runs.next), (p) => {
                    setRuns((cur) => (cur && !isFailure(cur) ? { runs: [...cur.runs, ...p.runs], next: p.next_cursor } : cur));
                  })
                }
              >
                {more.busy ? "Loading..." : "Load more"}
              </button>
            )}
            <Status problem={more.problem} done={null} />
          </>
        )}
      </section>
    </div>
  );
}

// A new automation starts at the template chooser; a picked template (?template=) opens the builder prefilled.
export function NewAutomation() {
  const { user } = useSession();
  const router = useRouter();
  const template = useSearchParams().get("template");
  const { accounts, ready, sets } = useScopeData();
  if (!manages(user.current_team.role)) return <p className="text-ink-soft">Only team owners and admins can create automations.</p>;
  if (!templates.some((t) => t.id === template))
    return (
      <section aria-labelledby="templates-heading" className="grid max-w-4xl gap-4">
        <h2 id="templates-heading" className={heading}>
          Start from a template
        </h2>
        <p className="text-ink-soft">Each one opens the builder filled in. You can change everything, the trigger too.</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/automations/new?template=${t.id}`} className="card grid h-full content-start gap-2 p-5 hover:ring-ink focus-visible:outline-offset-2">
                <span className="grid size-10 place-items-center rounded-xl bg-signal/10 text-signal-deep">
                  <Icon name={triggerIcon[t.draft.trigger ?? "comment_received"]} />
                </span>
                <strong>{t.title}</strong>
                <span className="text-sm text-ink-soft">{t.about}</span>
                <span className="text-xs font-bold text-ink-soft">{triggers[t.draft.trigger ?? "comment_received"].label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="grid gap-5">
      <Link href="/automations/new" className="flex items-center gap-1 justify-self-start text-sm font-bold text-ink-soft hover:text-ink">
        <Icon name="left" className="size-4" />
        Templates
      </Link>
      <AutomationForm key={template} template={template} accounts={accounts} ready={ready} sets={sets} onSaved={(a) => router.push(`/automations/${a.id}`)} />
    </div>
  );
}

// The page header's action, for owners and admins only.
export function NewAutomationLink() {
  const { user } = useSession();
  if (!manages(user.current_team.role)) return null;
  return (
    <Link href="/automations/new" className="btn btn-primary">
      <Icon name="plus" className="size-4" />
      New automation
    </Link>
  );
}
