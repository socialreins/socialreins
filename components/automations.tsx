"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import { TeamLink as Link } from "@/components/team-link";
import { useTeamRouter as useRouter } from "@/components/team-link";
import type { Failure } from "@/lib/auth";
import {
  actionName,
  actionsSummary,
  BLANK,
  canEdit,
  conditionNotes,
  deleteAutomation,
  filterRuns,
  getAutomation,
  listAutomations,
  listMisses,
  listRuns,
  retryRun,
  proportions,
  reason,
  reasonLabel,
  reasonWhy,
  RUN_FILTERS,
  sameSteps,
  switchAutomation,
  TEMPLATE_GROUPS,
  templates,
  whyNot,
  TRIGGERS,
  triggers,
  type Automation,
  type Miss,
  type Run,
  type RunFilter,
  type Step,
  type Trigger,
} from "@/lib/automations";
import { authorName, getItem, relativeTime, type Author } from "@/lib/inbox";
import { listConnections, type Connection } from "@/lib/connections";
import { address, addressOf, moveToNumber } from "@/lib/ref";
import { listSets, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { FlowTimeline } from "@/components/automation-flow";
import { AutomationForm, automationMessages, triggerIcon } from "@/components/automation-form";
import { ActionMenu, menuItem } from "@/components/menu";
import { PlatformIcon, platformName, platformOf } from "@/components/platform-icons";
import { scopeSummary } from "@/components/scope-fields";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Icon, Skeleton } from "@/components/ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const statusName: Record<Run["status"], string> = { running: "Running", waiting: "Waiting", sent: "Sent", failed: "Failed", skipped: "Skipped" };
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

// A row of toggle chips, with how many each one holds.
function Chips<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; name: string; count: number }[]; onPick: (v: T) => void }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <li key={o.id}>
          <button
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onPick(o.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${value === o.id ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"}`}
          >
            {o.name}
            <span className={`tabular-nums ${value === o.id ? "opacity-75" : "font-normal"}`}>{o.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Switching on or off shows at once and goes back if brain refuses. `onChange` gets the new state, then brain's answer.
// `onSettled` runs once brain has answered, with what to say when it worked.
function useSwitch(a: Automation, onChange: (a: Automation) => void, onSettled?: (said?: string) => void) {
  const { busy, problem, done, run } = useAction();
  const toggle = async () => {
    const to = !a.active;
    let said: string | undefined;
    onChange({ ...a, active: to });
    await run(
      "switch",
      async () => {
        const r = await switchAutomation(a.id, to);
        if (isFailure(r)) onChange(a);
        return r;
      },
      (r) => {
        onChange(r);
        return (said = `${r.name} is ${r.active ? "on" : "off"}.`);
      },
    );
    onSettled?.(said);
  };
  return { toggle, busy: busy !== null, problem, done };
}

// On and off as a switch with its state in words. Members see the state only.
function ActiveSwitch({ automation: a, canManage, state }: { automation: Automation; canManage: boolean; state: ReturnType<typeof useSwitch> }) {
  if (!canManage) return <span className="badge tone" data-status={a.active ? "sent" : undefined}>{a.active ? "On" : "Off"}</span>;
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className={`text-sm font-bold ${a.active ? "" : "text-ink-soft"}`}>
        {a.active ? "On" : "Off"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={a.active}
        aria-label={a.name}
        disabled={state.busy}
        onClick={state.toggle}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:cursor-progress ${a.active ? "bg-ink" : "bg-ink/20"}`}
      >
        <span aria-hidden="true" className={`absolute top-1 left-1 size-4 rounded-full bg-paper transition-transform motion-reduce:transition-none ${a.active ? "translate-x-4 bg-signal" : ""}`} />
      </button>
    </span>
  );
}

// What the switch last did: said to a screen reader when it worked, shown when it did not.
function SwitchStatus({ state }: { state: ReturnType<typeof useSwitch> }) {
  return (
    <>
      <span role="status" className="sr-only">
        {state.done?.text}
      </span>
      {state.problem && (
        <p role="alert" className="waitlist-error">
          Not switched. {problemText(state.problem, automationMessages)}
        </p>
      )}
    </>
  );
}

const barTone = { sent: "bg-[#2f9e5b]", skipped: "bg-ink/25", failed: "bg-[#d63a2f]" };

// Sent, Skipped and Failed as small figures (and Waiting while a flow has runs at a wait), a thin bar of their shares, and when it last ran.
function Stats({ runs }: { runs: Automation["runs"] }) {
  if (!runs) return null;
  const share = proportions(runs);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <dl aria-label="Runs" className="flex gap-5">
          {(["sent", "skipped", "failed", ...(runs.waiting ? (["waiting"] as const) : [])] as const).map((k) => (
            <div key={k}>
              <dt className="text-xs text-ink-soft">{statusName[k]}</dt>
              <dd className={`font-bold tabular-nums ${k === "failed" && runs.failed ? "text-signal-deep" : ""}`}>{runs[k]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-soft">
          {runs.last_at ? (
            <>
              Last run{" "}
              <time dateTime={runs.last_at} title={when(runs.last_at)}>
                {relativeTime(runs.last_at) === "now" ? "just now" : relativeTime(runs.last_at)}
              </time>
            </>
          ) : (
            "No runs yet"
          )}
        </p>
      </div>
      {(runs.reasons?.length ?? 0) > 0 && (
        <p className="text-xs text-ink-soft">
          Held back or failed:{" "}
          {runs.reasons!.slice(0, 4).map((r, i) => (
            <span key={r.reason}>
              {i > 0 && ", "}
              {r.count} {reasonLabel(r.reason)}
            </span>
          ))}
        </p>
      )}
      <div
        role="img"
        aria-label={share ? `${Math.round(share.sent)}% sent, ${Math.round(share.skipped)}% skipped, ${Math.round(share.failed)}% failed` : "No runs yet"}
        className="flex h-1.5 gap-px overflow-hidden rounded-full bg-ink/10"
      >
        {share && (["sent", "skipped", "failed"] as const).map((k) => share[k] > 0 && <span key={k} className={`min-w-1 ${barTone[k]}`} style={{ width: `${share[k]}%` }} />)}
      </div>
    </div>
  );
}

// The trigger in words with its icon, the keywords, then scope, conditions and what it does.
function Summary({ automation: a, accounts, sets }: { automation: Automation; accounts: Connection[]; sets: SocialSet[] }) {
  // A trigger or shape from a newer brain: nothing here can be read safely but its name, switch and counts.
  if (!canEdit(a))
    return (
      <p className="flex items-center gap-2 text-[0.95rem]">
        <Icon name="automations" className="size-4 text-ink-soft" />
        Made over the API
      </p>
    );
  // A button automation shows the payloads it listens for where the others show their keywords.
  const keywords = a.conditions.keywords?.length ? a.conditions.keywords : (a.conditions.payloads ?? []);
  return (
    <>
      <p className="flex items-center gap-2 text-[0.95rem]">
        <Icon name={triggerIcon[a.trigger] ?? "automations"} className="size-4 text-ink-soft" />
        {triggers[a.trigger]?.label ?? a.trigger}
      </p>
      {keywords.length > 0 && (
        <ul aria-label={a.conditions.payloads?.length ? "Button payloads" : "Keywords"} className="flex flex-wrap gap-1.5">
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

// The templates under their groups, then the empty builder. The groups are h3: put an h2 above.
export function TemplateGallery() {
  const card = "card lift flex h-full flex-col items-start gap-2 p-4 focus-visible:outline-offset-2";
  // A group is as wide as its cards, so two short ones share a row on a wide screen.
  const span = ["", "", "lg:col-span-2", "lg:col-span-3"];
  const inner = ["", "", "sm:grid-cols-2", "sm:grid-cols-2 lg:grid-cols-3"];
  return (
    <div className="grid gap-x-3 gap-y-6 lg:grid-cols-3">
      {TEMPLATE_GROUPS.map((group) => {
        const mine = templates.filter((t) => t.group === group);
        return (
          <section key={group} aria-label={group} className={`grid content-start gap-2 ${span[mine.length]}`}>
            <h3 className="text-xs font-bold tracking-wide text-ink-soft uppercase">{group}</h3>
            <ul className={`grid gap-3 ${inner[mine.length]}`}>
              {mine.map((t) => {
                const trigger = t.draft.trigger ?? "comment_received";
                return (
                  <li key={t.id}>
                    <Link href={`/automations/new?template=${t.id}`} className={card}>
                      <span className="flex items-center justify-between gap-2 self-stretch">
                        <span className="grid size-9 place-items-center rounded-lg bg-signal/10 text-signal-deep">
                          <Icon name={triggerIcon[trigger]} />
                        </span>
                        {t.popular && <span className="badge tone" data-status="scheduled">Popular</span>}
                      </span>
                      <strong>{t.title}</strong>
                      <span className="text-sm text-ink-soft">{t.about}</span>
                      <span className="mt-auto flex items-center gap-2 pt-1 text-ink-soft">
                        <span className="sr-only">Works on {triggers[trigger].networks.map(platformName).join(", ")}</span>
                        {triggers[trigger].networks.map((n) => {
                          const platform = platformOf(n);
                          return platform && <span key={n} title={platform.name} className="grid"><PlatformIcon platform={platform} className="size-3.5" /></span>;
                        })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <section aria-label="Your own" className="grid content-start gap-2">
        <h3 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Your own</h3>
        <Link href={`/automations/new?template=${BLANK}`} className={`${card} border border-dashed border-ink/25 shadow-none`}>
          <span className="grid size-9 place-items-center rounded-lg bg-ink/5 text-ink-soft">
            <Icon name="plus" />
          </span>
          <strong>Start from scratch</strong>
          <span className="text-sm text-ink-soft">An empty builder: pick the trigger and write the reply yourself.</span>
        </Link>
      </section>
    </div>
  );
}

const triggerShort: Record<Trigger, string> = { comment_received: "Comments", dm_received: "DMs", mention_received: "Mentions", new_follower: "Followers", story_reply: "Story replies", story_mention: "Story mentions", like_received: "Likes", repost_received: "Reposts", button_clicked: "Button taps" };
type ListFilter = "all" | "on" | "off" | Trigger;

// One automation on the list: what starts it, what it does, its switch, its numbers and a menu.
function AutomationCard({ automation: a, canManage, accounts, sets, onChange, onSwitching, onDeleted }: { automation: Automation; canManage: boolean; accounts: Connection[]; sets: SocialSet[]; onChange: (a: Automation) => void; onSwitching: (on: boolean, said?: string) => void; onDeleted: () => void }) {
  const state = useSwitch(a, onChange, (said) => onSwitching(false, said));
  const del = useAction();
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const failed = a.runs?.failed ?? 0;
  const toggle = () => {
    onSwitching(true);
    return state.toggle();
  };
  // The menu closes on a choice and the confirm goes away, so focus goes back to the menu's button.
  const focusMenu = () => ref.current?.querySelector("summary")?.focus();
  return (
    <li ref={ref} className="card enter grid gap-3 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`hidden size-10 shrink-0 place-items-center rounded-xl sm:grid ${a.active ? "bg-signal/10 text-signal-deep" : "bg-ink/5 text-ink-soft"}`}>
          <Icon name={triggerIcon[a.trigger] ?? "automations"} />
        </span>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <span className="flex min-w-0 items-center gap-2">
            <Link href={`/automations/${address(a)}`} className="truncate font-bold hover:underline">
              {a.name}
            </Link>
            {failed > 0 && (
              <Link href={`/automations/${address(a)}?runs=failed`} title={`${failed} failed ${failed === 1 ? "run" : "runs"}: see why`} className="shrink-0 rounded text-signal-deep hover:text-ink">
                <Icon name="warning" className="size-4" />
                <span className="sr-only">
                  {failed} failed {failed === 1 ? "run" : "runs"}: see why
                </span>
              </Link>
            )}
          </span>
          <Summary automation={a} accounts={accounts} sets={sets} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ActiveSwitch automation={a} canManage={canManage} state={{ ...state, toggle }} />
          {canManage && (
            <ActionMenu label={`Actions for ${a.name}`} className="icon-btn" trigger={<Icon name="more" />}>
              {canEdit(a) && (
                <>
                  <Link href={`/automations/${address(a)}?edit=1`} className={menuItem}>
                    <Icon name="edit" className="size-4 text-ink-soft" />
                    Edit
                  </Link>
                  <Link href={`/automations/new?from=${address(a)}`} className={menuItem}>
                    <Icon name="copy" className="size-4 text-ink-soft" />
                    Duplicate
                  </Link>
                </>
              )}
              <button
                type="button"
                className={menuItem}
                disabled={state.busy}
                onClick={() => {
                  focusMenu();
                  toggle();
                }}
              >
                <Icon name="automations" className="size-4 text-ink-soft" />
                Turn {a.active ? "off" : "on"}
              </button>
              <button
                type="button"
                className={`${menuItem} text-signal-deep`}
                onClick={() => {
                  flushSync(() => setConfirming(true));
                  document.getElementById(`delete-${a.id}`)?.focus();
                }}
              >
                <Icon name="trash" className="size-4" />
                Delete
              </button>
            </ActionMenu>
          )}
        </div>
      </div>
      <Stats runs={a.runs} />
      <SwitchStatus state={state} />
      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-3">
          <p id={`delete-${a.id}-q`} className="basis-full text-sm sm:basis-auto">
            Delete {a.name} and its run history? Replies it sent stay.
          </p>
          <button id={`delete-${a.id}`} type="button" className="btn btn-primary btn-sm" aria-describedby={`delete-${a.id}-q`} disabled={del.busy !== null} onClick={() => del.run("delete", () => deleteAutomation(a.id), onDeleted)}>
            {del.busy ? "Deleting..." : "Yes, delete"}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => {
              flushSync(() => setConfirming(false));
              focusMenu();
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <Status problem={del.problem} done={null} overrides={automationMessages} />
    </li>
  );
}

export function Automations() {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const [list, setList] = useState<Automation[] | Failure | null>(null);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [said, setSaid] = useState("");
  // Cards whose switch waits for brain: they stay in view under any filter, so a refusal shows on the card.
  const [switching, setSwitching] = useState<string[]>([]);
  const { accounts, sets } = useScopeData();

  useEffect(() => {
    listAutomations().then(setList);
  }, []);

  // Switching on or off answers without run counts, so the listed ones stay.
  const replace = (a: Automation) => setList((l) => (Array.isArray(l) ? l.map((x) => (x.id === a.id ? { ...a, runs: x.runs } : x)) : l));
  const all = Array.isArray(list) ? list : [];
  const fits = (a: Automation, f: ListFilter) => f === "all" || (f === "on" ? a.active : f === "off" ? !a.active : a.trigger === f);
  const shown = all.filter((a) => fits(a, filter) || switching.includes(a.id));
  const chip = (id: ListFilter, name: string) => ({ id, name, count: all.filter((a) => fits(a, id)).length });

  return (
    <section aria-labelledby="automations-heading" className="grid gap-4">
      <h2 id="automations-heading" className="sr-only">
        Your automations
      </h2>
      {!canManage && <p className="text-ink-soft">Only team owners and admins can create or change automations.</p>}
      <PausedNotice />
      <p role="status" className="sr-only">
        {said}
      </p>
      {list === null ? (
        <div className="grid gap-3">
          <p role="status" className="sr-only">
            Loading automations...
          </p>
          {[0, 1, 2].map((n) => (
            <div key={n} className="card grid gap-3 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="hidden size-10 rounded-xl sm:block" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3.5 w-56 max-w-full" />
                  <Skeleton className="h-3.5 w-72 max-w-full" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
              <Skeleton className="h-8 w-48 max-w-full" />
              <Skeleton className="h-1.5 rounded-full" />
            </div>
          ))}
        </div>
      ) : isFailure(list) ? (
        <p role="alert" className="waitlist-error">
          Automations couldn&apos;t be loaded. {problemText(list)}
        </p>
      ) : list.length === 0 ? (
        <div className="enter grid gap-5">
          <p>
            <strong className="block text-base">No automations yet</strong>
            <span className="text-ink-soft">
              Answer comments, DMs, mentions, new followers and story replies on your own: one reply, or a flow of steps with waits and buttons.{canManage && " Pick one to start from. You can change everything, the trigger too."}
            </span>
          </p>
          {canManage && <TemplateGallery />}
        </div>
      ) : (
        <>
          {list.length > 6 && (
            <Chips
              label="Show"
              value={filter}
              onPick={setFilter}
              options={[chip("all", "All"), chip("on", "On"), chip("off", "Off"), ...TRIGGERS.filter((t) => all.some((a) => a.trigger === t)).map((t) => chip(t, triggerShort[t]))]}
            />
          )}
          {shown.length === 0 && <p className="card p-5 text-ink-soft">No automation fits this filter.</p>}
          <ul className="grid gap-3">
            {shown.map((a) => (
              <AutomationCard
                key={a.id}
                automation={a}
                canManage={canManage}
                accounts={accounts}
                sets={sets}
                onChange={replace}
                onSwitching={(on, text) => {
                  setSwitching((ids) => (on ? [...ids, a.id] : ids.filter((x) => x !== a.id)));
                  // Under On or Off a switched card leaves the list, and its own status with it.
                  if (text && (filter === "on" || filter === "off")) setSaid(text);
                }}
                onDeleted={() => {
                  setList((l) => (Array.isArray(l) ? l.filter((x) => x.id !== a.id) : l));
                  setSaid(`${a.name} was deleted.`);
                }}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// Shown while the team's "Pause all automations" is on: nothing goes out, whatever each switch says.
function PausedNotice() {
  const { user } = useSession();
  if (!user.current_team.automations_paused) return null;
  return (
    <p className="card border-signal-deep p-4 text-sm">
      <strong>All automations are paused.</strong> Nothing is sent, whatever each switch says.{" "}
      {manages(user.current_team.role) && (
        <Link href="/team" className="underline">
          Switch it off on the Team page
        </Link>
      )}
    </p>
  );
}

// One reply as the steps of a timeline, in the order brain runs them.
const asSteps = (a: Automation): Step[] => a.steps ?? a.actions;

// One automation read-only: its name and switch, what it does as a timeline, then its numbers.
function Overview({ automation: a, canManage, accounts, sets, onChange, actions, children }: { automation: Automation; canManage: boolean; accounts: Connection[]; sets: SocialSet[]; onChange: (a: Automation) => void; actions: ReactNode; children: ReactNode }) {
  const state = useSwitch(a, onChange);
  return (
    <section aria-labelledby="summary-heading" className="card grid gap-5 p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid min-w-0 flex-1 basis-64 gap-1">
          <h2 id="summary-heading" className={heading}>
            {a.name}
          </h2>
          <Summary automation={a} accounts={accounts} sets={sets} />
          <p className="text-sm text-ink-soft">{a.active ? `On since ${when(a.activated_at)}.` : "Off."}</p>
        </div>
        <ActiveSwitch automation={a} canManage={canManage} state={state} />
      </div>
      <SwitchStatus state={state} />
      {canEdit(a) ? (
        <div className="rounded-lg bg-canvas p-4">
          <FlowTimeline icon={triggerIcon[a.trigger]} trigger={triggers[a.trigger].label} steps={asSteps(a)} fallback={a.fallback_public_reply} />
        </div>
      ) : (
        <p role="note" className="rounded-xl bg-canvas p-3 text-sm">
          This automation was made over the API with a trigger or steps this page doesn&apos;t know yet, so it can&apos;t be edited here yet. You can still switch it on or off, read its runs and delete it.
        </p>
      )}
      <Stats runs={a.runs} />
      {actions}
      {children}
    </section>
  );
}

export function AutomationDetail({ id }: { id: string }) {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const router = useRouter();
  const params = useSearchParams();
  const [a, setA] = useState<Automation | Failure | null>(null);
  const [runs, setRuns] = useState<{ runs: Run[]; next: string | null } | Failure | null>(null);
  // Recent items it listens for but did not run on, with why (brain keeps them 14 days).
  const [misses, setMisses] = useState<Miss[] | Failure | null>(null);
  // The list's Edit opens the builder at once (?edit=1), and its warning mark the failed runs (?runs=failed).
  const [editing, setEditing] = useState(params.get("edit") === "1");
  const [filter, setFilter] = useState<RunFilter>(RUN_FILTERS.find((f) => f === params.get("runs")) ?? "all");
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<{ text: string; n: number } | null>(null);
  // Who each run answered: the author of its inbox item, null when the item can't be read.
  const [people, setPeople] = useState<Record<string, Author | null>>({});
  const asked = useRef(new Set<string>());
  const { accounts, ready, sets } = useScopeData();
  const del = useAction();
  const more = useAction();
  const retrying = useAction();
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getAutomation(id).then((r) => {
      if (!isFailure(r)) moveToNumber(id, r);
      setA(r);
    });
    listRuns(id).then((r) => setRuns(isFailure(r) ? r : { runs: r.runs, next: r.next_cursor }));
    listMisses(id).then((m) => setMisses(isFailure(m) ? m : m.misses));
  }, [id]);

  // shortcut: one request per run's item (50 a page), 4 at a time, since brain's runs carry no author; ask brain for it in the run if this gets slow.
  // A lookup that failed is forgotten, so the next Load more (or opening the page again) tries it once more.
  useEffect(() => {
    if (!runs || isFailure(runs)) return;
    const queue = [...new Set(runs.runs.map((r) => r.inbox_item_id))].filter((x) => !asked.current.has(x));
    for (const x of queue) asked.current.add(x);
    const worker = async () => {
      for (let x = queue.shift(); x; x = queue.shift()) {
        const item = x;
        const i = await getItem(item);
        if (isFailure(i)) asked.current.delete(item);
        setPeople((p) => ({ ...p, [item]: isFailure(i) ? null : i.author }));
      }
    };
    for (let n = 0; n < 4; n++) worker();
  }, [runs]);

  if (a === null)
    return (
      <div className="card grid gap-3 p-5">
        <p role="status" className="sr-only">
          Loading the automation...
        </p>
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-24" />
      </div>
    );
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
  const loaded = runs && !isFailure(runs) ? runs.runs : [];
  const shown = filterRuns(loaded, filter);

  return (
    <div className="enter grid grid-cols-[minmax(0,1fr)] gap-10">
      <PausedNotice />
      {editing && canManage && canEdit(a) ? (
        <AutomationForm
          automation={a}
          accounts={accounts}
          ready={ready}
          sets={sets}
          onCancel={close}
          onSaved={(saved) => {
            // brain stops the runs that wait when the steps change, so nobody waits after such a save.
            setA((cur) => {
              const runs = cur && !isFailure(cur) ? cur.runs : undefined;
              return { ...saved, runs: runs && !sameSteps(cur && !isFailure(cur) ? cur.steps : null, saved.steps) ? { ...runs, waiting: 0 } : runs };
            });
            close();
            setSaved((n) => ({ text: "Automation saved.", n: (n?.n ?? 0) + 1 }));
          }}
        />
      ) : (
        <Overview
          automation={a}
          canManage={canManage}
          accounts={accounts}
          sets={sets}
          onChange={(x) => setA({ ...x, runs: a.runs })}
          actions={
            canManage &&
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
                {canEdit(a) && (
                  <>
                    <button ref={editRef} type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                      <Icon name="edit" className="size-4" />
                      Edit
                    </button>
                    <Link href={`/automations/new?from=${address(a)}`} className="btn btn-secondary btn-sm">
                      <Icon name="copy" className="size-4" />
                      Duplicate
                    </Link>
                  </>
                )}
                <button ref={deleteRef} type="button" className="btn btn-quiet btn-danger btn-sm" onClick={() => setConfirming(true)}>
                  <Icon name="trash" className="size-4" />
                  Delete
                </button>
              </div>
            ))
          }
        >
          <Status problem={del.problem} done={del.done} overrides={automationMessages} />
          {!del.problem && saved && (
            <p key={saved.n} role="status" className="waitlist-done">
              {saved.text}
            </p>
          )}
        </Overview>
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
            <Chips
              label="Show runs"
              value={filter}
              onPick={setFilter}
              options={RUN_FILTERS.map((f) => ({ id: f, name: f === "all" ? "All" : statusName[f], count: filterRuns(loaded, f).length }))}
            />
            {shown.length === 0 && (
              <p className="card p-5 text-ink-soft">
                No {statusName[filter as Run["status"]].toLowerCase()} runs among the {loaded.length} loaded{runs.next ? ". Load more to look further back." : "."}
              </p>
            )}
            {/* relative: the sr-only texts inside are absolute, and would otherwise widen the page past the scroller. */}
            <div className="card relative overflow-x-auto" hidden={shown.length === 0}>
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
                  {shown.map((r) => {
                    const who = people[r.inbox_item_id];
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="px-4 py-3">
                          <span className="badge tone" data-status={r.status === "skipped" ? undefined : r.status === "waiting" ? "scheduled" : r.status}>
                            {statusName[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="max-w-40 truncate px-4 py-3 font-bold">{who ? authorName(who) : who === null ? "Unknown" : "..."}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                          <time dateTime={r.created_at}>{when(r.created_at)}</time>
                        </td>
                        <td className="px-4 py-3">
                          {r.status === "waiting" && r.resume_at && (
                            <p>
                              Waiting until <time dateTime={r.resume_at}>{when(r.resume_at)}</time>
                            </p>
                          )}
                          {r.reason && <p>{reason(r.reason)}</p>}
                          {r.reason && reasonWhy[r.reason] && (
                            <p className="hint">
                              <strong>Why:</strong> {reasonWhy[r.reason]}
                            </p>
                          )}
                          {typeof r.step_index === "number" && (
                            <p className="text-ink-soft">
                              Step {r.step_index + 1}
                              {canEdit(a) && a.steps && r.step_index < a.steps.length ? ` of ${a.steps.length}` : ""}
                            </p>
                          )}
                          {r.results.length > 0 && (
                            <ul aria-label="Actions" className="text-ink-soft">
                              {r.results.map((x, i) => (
                                <li key={i}>
                                  {actionName[x.type] ?? String(x.type).replaceAll("_", " ")}: {(x.status === "done" ? "done" : (statusName[x.status] ?? x.status)).toLowerCase()}
                                  {x.reason && x.reason !== r.reason ? ` (${reason(x.reason)})` : ""}
                                  {x.model ? `, written by ${x.model}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {r.can_retry && canManage && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm mb-1.5"
                              disabled={retrying.busy !== null}
                              onClick={() =>
                                retrying.run(
                                  `retry-${r.id}`,
                                  async () => {
                                    const res = await retryRun(id, r.id);
                                    // A refusal means it can't be retried now: take the button away so it isn't tried again.
                                    if (isFailure(res) && res !== "error" && res !== "timeout" && res !== "signed_out")
                                      setRuns((cur) => (cur && !isFailure(cur) ? { ...cur, runs: cur.runs.map((x) => (x.id === r.id ? { ...x, can_retry: false } : x)) } : cur));
                                    return res;
                                  },
                                  (next) => {
                                    setRuns((cur) => (cur && !isFailure(cur) ? { ...cur, runs: cur.runs.map((x) => (x.id === next.id ? next : x)) } : cur));
                                    // The button is gone: the focus goes to the row's link instead of the page.
                                    requestAnimationFrame(() => document.getElementById(`run-${r.id}-open`)?.focus());
                                  },
                                )
                              }
                            >
                              {retrying.busy === `retry-${r.id}` ? "Retrying..." : "Retry"}
                              <span className="sr-only"> the run of {when(r.created_at)}, which the network refused for rate limiting and sent nothing</span>
                            </button>
                          )}
                          <Link id={`run-${r.id}-open`} href={`/inbox?item=${addressOf(r.inbox_item_id, r.inbox_item_number)}`} className="font-bold underline decoration-signal decoration-2 underline-offset-4">
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
            <Status problem={retrying.problem} done={null} overrides={{ not_retryable: "This run can't be retried: it did not end on a rate limit, it was retried already, or the automation is switched off.", paused: "Your automations are paused. Resume them first.", daily_cap: "The team's 500 automation runs for today are used." }} />
          </>
        )}
      </section>

      <section aria-labelledby="misses-heading" className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <h2 id="misses-heading" className={heading}>
          Items it did not run on
        </h2>
        <p className="hint">
          Recent items this automation listens for but did not match, with why, kept for 14 days. Items it was held back on (paused, cool-down, daily limit) are in the run history as skipped.
        </p>
        {misses === null ? (
          <div role="status" className="h-20 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading...</span>
          </div>
        ) : isFailure(misses) ? (
          <p role="alert" className="waitlist-error">
            This couldn&apos;t be loaded. {problemText(misses)}
          </p>
        ) : misses.length === 0 ? (
          <p className="card p-5 text-ink-soft">No item it listens for failed to match in the last 14 days.</p>
        ) : (
          <ul aria-label="Items it did not run on" className="card divide-y divide-ink/10">
            {misses.map((m) => (
              <li key={m.inbox_item_id} className="grid gap-1 p-4">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <strong>{m.author ?? "Someone"}</strong>
                  <span className="text-ink-soft">{missKind[m.kind] ?? m.kind}</span>
                  <time className="text-ink-soft" dateTime={m.created_at}>
                    {when(m.created_at)}
                  </time>
                </p>
                {m.text && <p className="line-clamp-2 break-words text-ink-soft">{m.text}</p>}
                <p>
                  <strong>Not run:</strong> {m.reasons.map(whyNot).join("; ")}
                </p>
                <Link href={`/inbox?item=${addressOf(m.inbox_item_id, m.inbox_item_number)}`} className="justify-self-start text-sm font-bold underline decoration-signal decoration-2 underline-offset-4">
                  Open in inbox
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const missKind: Record<string, string> = { comment: "commented", mention: "mentioned you", dm: "sent a DM", follow: "followed you", like: "liked a post", repost: "reposted a post" };

// A new automation starts at the template gallery; a picked template (?template=) opens the builder prefilled,
// and Duplicate (?from=<id>) opens it as a copy of that automation.
export function NewAutomation() {
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const template = params.get("template");
  const from = params.get("from");
  // Kept with the id it was read for, so another ?from in place loads again and never shows the old copy.
  const [loaded, setLoaded] = useState<{ from: string; source: Automation | Failure } | null>(null);
  const source = loaded?.from === from ? loaded.source : null;
  const { accounts, ready, sets } = useScopeData();
  const canManage = manages(user.current_team.role);
  useEffect(() => {
    if (from && canManage) getAutomation(from).then((source) => setLoaded({ from, source }));
  }, [from, canManage]);

  if (!canManage) return <p className="text-ink-soft">Only team owners and admins can create automations.</p>;
  const form = { accounts, ready, sets, onSaved: (a: Automation) => router.push(`/automations/${address(a)}`), onCancel: () => router.push("/automations") };
  if (from) {
    if (source === null)
      return (
        <div className="card grid max-w-2xl gap-3 p-5">
          <p role="status" className="sr-only">
            Loading the automation to copy...
          </p>
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-32" />
        </div>
      );
    if (isFailure(source) || !canEdit(source))
      return (
        <p role="alert" className="waitlist-error">
          This automation can&apos;t be copied. {isFailure(source) ? problemText(source, automationMessages) : "It was made over the API in a shape this page doesn't know yet."}
        </p>
      );
    return <AutomationForm key={from} copyOf={source} {...form} />;
  }
  if (template !== BLANK && !templates.some((t) => t.id === template))
    return (
      <section aria-labelledby="templates-heading" className="enter grid max-w-4xl gap-4">
        <div>
          <h2 id="templates-heading" className={heading}>
            Start from a template
          </h2>
          <p className="text-ink-soft">Each one opens the builder filled in. You can change everything, the trigger too.</p>
        </div>
        <TemplateGallery />
      </section>
    );
  return (
    <div className="grid gap-5">
      <Link href="/automations/new" className="flex items-center gap-1 justify-self-start text-sm font-bold text-ink-soft hover:text-ink">
        <Icon name="left" className="size-4" />
        Templates
      </Link>
      <AutomationForm
        key={template}
        template={template}
        payload={params.get("payload")}
        keyword={params.get("keywords")}
        startScope={{ social_set_id: params.get("set"), account_ids: params.get("accounts")?.split(",").filter(Boolean) ?? [] }}
        {...form}
      />
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
