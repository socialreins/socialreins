"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type { Failure } from "@/lib/auth";
import { useCurrentSet, useSession } from "@/components/app-shell";
import {
  attention,
  cancelMetaPick,
  connectBluesky,
  connectResult,
  connectResultText,
  connectUrl,
  disconnect,
  endDate,
  getMetaPick,
  listConnections,
  listProviders,
  metaName,
  metaPickPending,
  oauthProviders,
  pickMeta,
  rememberConnect,
  takeConnect,
  providerState,
  safeAvatar,
  type Connection,
  type MetaChoice,
  type MetaChoices,
  type Provider,
} from "@/lib/connections";
import { joinSet, listSets, setAccountSets, setNames, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { PlatformIcon, platformOf, platforms } from "@/components/platform-icons";
import { PlatformMark } from "@/components/posts";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

const connectMessages: Partial<Record<Failure, string>> = {
  invalid_handle: "That handle wasn't found on Bluesky. Check it, for example alice.bsky.social.",
  invalid_credentials:
    "Bluesky didn't accept that password. Use an app password made in Bluesky settings, not your main Bluesky password.",
  unsupported_pds: "That account is hosted on a server SocialReins can't connect to.",
  bluesky_unreachable: "Bluesky couldn't be reached. Try again in a moment.",
  timeout: "Bluesky is taking a long time to answer. The account may still connect, so close this and check your accounts before trying again.",
  rate_limited: "Too many connection attempts. Wait a while, then try again.",
  forbidden: "Only team owners and admins can connect or disconnect accounts.",
  not_found: "That account was already disconnected.",
};

export const accountName = (c: Connection) => c.display_name || (c.handle ? `@${c.handle}` : c.external_id);

// Accounts that need reconnecting or soon will, each with what is wrong and a Reconnect link for owners and admins. Used on Home and in the post editor.
export function ReconnectNotice({ accounts, title, lead, canManage }: { accounts: Connection[]; title: string; lead: string; canManage: boolean }) {
  if (accounts.length === 0) return null;
  return (
    <section aria-label={title} className="card grid gap-2 border-signal/40 p-4">
      <p>
        <strong className="block">{title}</strong>
        <span className="text-ink-soft">{lead}</span>
      </p>
      <ul className="grid gap-2">
        {accounts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0">
              <PlatformMark platform={c.provider} className="size-4" />
              <strong>{accountName(c)}</strong>{" "}
              <span className="text-ink-soft">{attention(c) === "expiring" ? `stops working on ${endDate(c)}` : "needs reconnecting"}</span>
            </span>
            {canManage && (
              oauthProviders.has(c.provider) ? (
                <a href={connectUrl(c.provider)} className="btn btn-secondary btn-sm">
                  Reconnect {accountName(c)}
                </a>
              ) : (
                <Link href="/connections" className="btn btn-secondary btn-sm">
                  Open Connections
                </Link>
              )
            )}
          </li>
        ))}
      </ul>
      {!canManage && <p className="text-sm text-ink-soft">Ask a team owner or admin to reconnect it.</p>}
    </section>
  );
}

// The account's avatar from Bluesky's CDN, else its initial. Decorative: the name is always next to it.
export function Avatar({ connection: c, size = "size-10" }: { connection: Connection; size?: string }) {
  return <Picture url={c.avatar_url} name={accountName(c)} size={size} />;
}

// The avatar with its network's mark on the corner, so one name on two networks reads as two accounts.
export function NetworkAvatar({ connection: c, small = false }: { connection: Connection; small?: boolean }) {
  const platform = platformOf(c.provider);
  return (
    <span className="relative shrink-0">
      <Avatar connection={c} size={small ? "size-8" : "size-12"} />
      {platform && (
        <span
          className={`absolute -right-1 -bottom-1 grid ${small ? "size-4" : "size-5"} place-items-center rounded-full bg-paper ring-2 ring-paper`}
          style={{ color: platform.color }}
        >
          <PlatformIcon platform={platform} className={small ? "size-2.5" : "size-3.5"} />
        </span>
      )}
    </span>
  );
}

// A remote picture, else the name's initial: also when it fails to load, as Meta's signed CDN links expire.
function Picture({ url, name, size, bg = "bg-canvas" }: { url: string | null; name: string; size: string; bg?: string }) {
  const [broken, setBroken] = useState(false);
  const picture = broken ? null : safeAvatar(url);
  return picture ? (
    // eslint-disable-next-line @next/next/no-img-element -- a remote avatar, no Next image loader configured
    <img
      src={picture}
      alt=""
      width={40}
      height={40}
      referrerPolicy="no-referrer"
      className={`${size} rounded-full`}
      onError={() => setBroken(true)}
    />
  ) : (
    <span aria-hidden="true" className={`grid ${size} place-items-center rounded-full ${bg} font-bold`}>
      {name.replace(/^@/, "").charAt(0).toUpperCase()}
    </span>
  );
}

// Accounts under their network, in the order the networks are listed everywhere else.
function byNetwork(list: Connection[]) {
  const known = platforms.map((p) => ({ id: p.id, name: p.name, items: list.filter((c) => c.provider === p.id) }));
  const other = list.filter((c) => !platformOf(c.provider));
  return [...known, ...(other.length ? [{ id: "other", name: "Other", items: other }] : [])].filter((g) => g.items.length > 0);
}

export function Connections() {
  const { user } = useSession();
  return <ConnectionsPage canManage={manages(user.current_team.role)} team={user.current_team.name} />;
}

function ConnectionsPage({ canManage, team }: { canManage: boolean; team: string }) {
  const [list, setList] = useState<Connection[] | Failure | null>(null);
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [adding, setAdding] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [currentSet] = useCurrentSet();
  const { problem, done, run } = useAction();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // How an OAuth connect went, from brain's redirect back here. The shell renders this page in the browser only.
  const [returned] = useState(() => connectResult(window.location.search));
  // brain sent the browser back from a Meta login with Pages and Instagram accounts to pick.
  const [picking] = useState(() => canManage && metaPickPending(window.location.search));
  // brain names Facebook and Instagram together as "meta"; their tabs start at Facebook.
  const [tab, setTab] = useState<string | null>(() => (returned?.error === null ? (returned.provider === "meta" ? "facebook" : returned.provider) : null));

  const reload = () => listConnections().then(setList);
  // An account connected on this page: load it and open its network's tab, so it is on screen.
  const connectedTo = (network: string) => {
    setTab(network);
    reload();
  };
  useEffect(() => {
    const search = window.location.search;
    const before = takeConnect();
    listConnections().then(async (l) => {
      // Back from a connect that worked: the account that wasn't here before joins the set picked when it started.
      if (before && connectResult(search)?.error === null && Array.isArray(l)) {
        const joined = await joinSet(before.set, l.filter((c) => !before.ids.includes(c.id)));
        if (joined.length) l = await listConnections();
      }
      setList(l);
    });
    // Drop the flags so a reload doesn't show the message again.
    if (connectResult(search) || metaPickPending(search)) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  // Loaded again on each pick, like the top bar's menu, so a set made or renamed elsewhere is known here too.
  useEffect(() => {
    listSets().then(setSets);
  }, [currentSet]);

  // What a closed dialog did, shown (and focused) on the page behind it.
  const announce = (text: string) => run("notice", async () => "ok" as const, () => text);
  const opened = Array.isArray(list) ? list.find((c) => c.id === settingsId) : undefined;
  // One network at a time, as tabs. The first one, or the one just connected, until a tab is picked.
  // Only the accounts of the set picked in the top bar. The default set holds every account, so it shows
  // them all; until the sets load, or if the picked one is gone, nothing is filtered.
  const picked = Array.isArray(sets) ? sets.find((s) => s.id === currentSet) : undefined;
  // The default set under the name the team gave it, for the hints on how to see every account.
  const everything = Array.isArray(sets) ? sets.find((s) => s.is_default)?.name : undefined;
  const shown = Array.isArray(list) ? (picked && !picked.is_default ? list.filter((c) => c.set_ids.includes(picked.id)) : list) : [];
  const groups = byNetwork(shown);
  const group = groups.find((g) => g.id === tab) ?? groups[0];
  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = groups[(groups.indexOf(group) + step + groups.length) % groups.length];
    flushSync(() => setTab(next.id));
    document.getElementById(`network-tab-${next.id}`)?.focus();
  }

  return (
    <section aria-labelledby="accounts-heading" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="accounts-heading" ref={headingRef} tabIndex={-1} className={heading}>
            Connected accounts
          </h2>
          <p className="text-ink-soft">
            {picked && !picked.is_default
              ? `Accounts in the ${picked.name} set.${everything ? ` Pick ${everything} at the top to see every account in ${team}.` : ""}`
              : `Accounts connected to ${team}.`}
          </p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            Add account
          </button>
        )}
      </div>
      {returned && (
        <p role={returned.error ? "alert" : "status"} className={returned.error ? "waitlist-error" : "waitlist-done"}>
          {connectResultText(
            returned,
            returned.provider === "meta" ? metaName : (platformOf(returned.provider)?.name ?? returned.provider),
          )}
        </p>
      )}
      {picking && <MetaPicker team={team} onConnected={() => connectedTo("facebook")} />}
      <Status problem={problem} done={done} overrides={connectMessages} />
      {list === null ? (
        <div role="status" className="h-28 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
          <span className="sr-only">Loading accounts...</span>
        </div>
      ) : isFailure(list) ? (
        <p role="alert" className="waitlist-error">
          Accounts couldn&apos;t be loaded. {problemText(list)}
        </p>
      ) : list.length === 0 ? (
        <p className="card p-5 text-ink-soft">No accounts connected yet.{canManage ? " Use Add account to connect one." : ""}</p>
      ) : !group ? (
        <p className="card p-5 text-ink-soft">
          No accounts in the {picked?.name} set yet.
          {canManage ? ` Use Add account to connect one to it${everything ? `, or pick ${everything} at the top and add an existing account from the account's settings` : ""}.` : ""}
        </p>
      ) : (
        <div className="grid gap-4">
          <div role="tablist" aria-label="Networks" className="flex gap-1 overflow-x-auto border-b border-[var(--line)]" onKeyDown={onTabKey}>
            {groups.map((g) => {
              const platform = platformOf(g.id);
              const on = g.id === group.id;
              return (
                <button
                  key={g.id}
                  id={`network-tab-${g.id}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="network-panel"
                  // Arrow keys move between tabs, so only the picked one is a Tab stop.
                  tabIndex={on ? 0 : -1}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 font-bold focus-visible:-outline-offset-2 ${on ? "border-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
                  onClick={() => setTab(g.id)}
                >
                  {platform && (
                    <span style={{ color: platform.color }}>
                      <PlatformIcon platform={platform} className="size-4" />
                    </span>
                  )}
                  {g.name}
                  <span className="text-sm font-normal text-ink-soft">{g.items.length}</span>
                </button>
              );
            })}
          </div>
          <div id="network-panel" role="tabpanel" aria-labelledby={`network-tab-${group.id}`}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.items.map((c) => {
                const platform = platformOf(c.provider);
                const name = accountName(c);
                return (
                  <li key={c.id} className="card grid content-start gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <NetworkAvatar connection={c} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2">
                          <span className="min-w-0 truncate font-bold">{name}</span>
                          {attention(c) && (
                            <span className="badge tone shrink-0" data-status={attention(c) === "reconnect" ? "failed" : "scheduled"}>
                              {attention(c) === "reconnect" ? "Reconnect needed" : `Ends ${endDate(c)}`}
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-ink-soft">
                          {platform?.name ?? c.provider}
                          {c.handle && c.display_name ? `, @${c.handle}` : ""}. Connected {date(c.created_at)}.
                        </p>
                      </div>
                      <button type="button" className="icon-btn shrink-0" aria-label={`Settings for ${name}`} onClick={() => setSettingsId(c.id)}>
                        <Icon name="settings" />
                      </button>
                    </div>
                    {Array.isArray(sets) && (
                      <ul aria-label={`Sets for ${name}`} className="flex flex-wrap gap-1.5">
                        {setNames(c.set_ids, sets).map((n) => (
                          <li key={n} className="badge tone">
                            {n}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      {!canManage && <p className="text-ink-soft">Only team owners and admins can connect or disconnect accounts.</p>}
      {opened && (
        <AccountSettings
          key={opened.id}
          connection={opened}
          sets={Array.isArray(sets) ? sets : []}
          canManage={canManage}
          onClose={() => setSettingsId(null)}
          onStale={() => listSets().then(setSets)}
          onSaved={(updated) => {
            setList((l) => (Array.isArray(l) ? l.map((x) => (x.id === updated.id ? updated : x)) : l));
            announce(`Sets saved for ${accountName(updated)}.`);
          }}
          onGone={(c, already) => {
            setList((l) => (Array.isArray(l) ? l.filter((x) => x.id !== c.id) : l));
            if (already) {
              run("notice", async () => "not_found" as const, () => {});
              headingRef.current?.focus();
            } else announce(`${accountName(c)} was disconnected.`);
          }}
        />
      )}
      {adding && (
        <AddAccount
          connected={Array.isArray(list) ? list : []}
          loaded={Array.isArray(list)}
          onClose={() => setAdding(false)}
          onConnected={() => connectedTo("bluesky")}
          announce={announce}
        />
      )}
    </section>
  );
}

// A modal with a title and a close button. `dialogRef` lets the caller close it after an action.
function Modal({
  title,
  dialogRef,
  busy,
  onClose,
  children,
}: {
  title: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
  // While a request runs the modal stays open, so its failure has somewhere to show.
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    dialogRef.current?.showModal();
  }, [dialogRef]);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => busy && e.preventDefault()}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <div className="grid gap-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="min-w-0 truncate font-display text-xl font-extrabold tracking-tight">
            {title}
          </h2>
          <button type="button" className="icon-btn shrink-0" aria-label="Close" disabled={busy} onClick={() => dialogRef.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

// Everything about one account: its sets, renewing its sign-in, and disconnecting it.
function AccountSettings({
  connection: c,
  sets,
  canManage,
  onClose,
  onStale,
  onSaved,
  onGone,
}: {
  connection: Connection;
  sets: SocialSet[];
  canManage: boolean;
  onClose: () => void;
  onStale: () => void;
  onSaved: (c: Connection) => void;
  onGone: (c: Connection, already: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<string[]>(c.set_ids);
  const [confirming, setConfirming] = useState(false);
  const disconnectRef = useRef<HTMLButtonElement>(null);
  const { busy, problem, done, run } = useAction();
  const name = accountName(c);
  const platform = platformOf(c.provider)?.name ?? c.provider;
  const state = attention(c);
  const oauth = oauthProviders.has(c.provider);

  function closeConfirm() {
    flushSync(() => setConfirming(false));
    disconnectRef.current?.focus();
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ids = sets.filter((s) => s.is_default || checked.includes(s.id)).map((s) => s.id);
    const call = async () => {
      const r = await setAccountSets(c.id, ids);
      // A set was deleted meanwhile: reload them so the checkboxes match what is left.
      if (r === "invalid_sets") onStale();
      return r;
    };
    await run("sets", call, (updated) => {
      onSaved(updated);
      ref.current?.close();
    });
  }

  async function onDisconnect() {
    let gone = false;
    const call = async () => {
      const r = await disconnect(c.id);
      gone = r === "not_found";
      return r;
    };
    const ok = await run("disconnect", call, () => {
      ref.current?.close();
      onGone(c, false);
    });
    if (gone) {
      ref.current?.close();
      onGone(c, true);
    } else if (!ok) closeConfirm();
  }

  return (
    <Modal title={`Settings for ${name}`} dialogRef={ref} busy={busy !== null} onClose={onClose}>
      <p className="text-ink-soft">
        {platform}
        {c.handle && c.display_name ? `, @${c.handle}` : ""}. Connected {date(c.created_at)}.
      </p>
      {c.provider === "bluesky" && c.dm_access === false && (
        <p className="rounded-xl bg-canvas p-3 text-sm">
          <strong>DMs off.</strong>{" "}
          <span className="text-ink-soft">
            Comments and mentions still reach the inbox, but DMs can&apos;t be read or sent. Make a new app password with &quot;Allow
            access to your direct messages&quot; ticked, then connect @{c.handle ?? name} again with Add account.
          </span>
        </p>
      )}
      <form onSubmit={onSave} className="grid gap-3">
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 font-bold">Sets</legend>
          {sets.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.is_default || checked.includes(s.id)}
                disabled={s.is_default || !canManage}
                onChange={(e) => setChecked((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id)))}
              />
              {s.name}
              {s.is_default && <span className="text-sm text-ink-soft">(every account stays here)</span>}
            </label>
          ))}
          <Link href="/sets" className="justify-self-start text-sm underline decoration-2 underline-offset-4">
            Manage sets
          </Link>
        </fieldset>
        {canManage && sets.length > 1 && (
          <button type="submit" className="btn btn-primary btn-sm justify-self-start" disabled={busy !== null}>
            {busy === "sets" ? "Saving..." : "Save sets"}
          </button>
        )}
      </form>
      <div className="grid gap-2">
        <p className="font-bold">Connection</p>
        {state && (
          <p className="rounded-xl bg-canvas p-3 text-sm">
            <strong>{state === "reconnect" ? "Reconnect needed." : "Reconnect soon."}</strong>{" "}
            <span className="text-ink-soft">
              {state === "reconnect"
                ? `${platform} no longer accepts this account's sign-in, so posts to it fail until it is connected again.`
                : `${platform} gives no way to extend this account's sign-in. It ends on ${endDate(c)}, and posts to it fail after that unless it is connected again.`}
            </span>
          </p>
        )}
        {!canManage ? (
          state && <p className="text-sm text-ink-soft">Ask a team owner or admin to reconnect it.</p>
        ) : oauth ? (
          <a href={connectUrl(c.provider)} className={`btn btn-sm justify-self-start ${state ? "btn-primary" : "btn-secondary"}`}>
            Reconnect {name}
          </a>
        ) : (
          <p className="text-sm text-ink-soft">To renew it, connect it again with a new app password through Add account.</p>
        )}
      </div>
      {canManage &&
        (confirming ? (
          <div className="grid gap-2 rounded-xl bg-canvas p-3">
            <p id="confirm-disconnect" className="text-sm">
              Disconnect {name}? SocialReins will forget its stored {c.provider === "bluesky" ? "password" : "sign-in"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                autoFocus
                type="button"
                className="btn btn-primary btn-sm"
                aria-describedby="confirm-disconnect"
                disabled={busy !== null}
                onClick={onDisconnect}
              >
                {busy === "disconnect" ? "Disconnecting..." : "Yes, disconnect"}
              </button>
              <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={closeConfirm}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button ref={disconnectRef} type="button" className="btn btn-quiet btn-danger btn-sm justify-self-start" disabled={busy !== null} onClick={() => setConfirming(true)}>
            Disconnect
          </button>
        ))}
      <Status problem={problem} done={done} overrides={connectMessages} />
    </Modal>
  );
}

const pickMessages: Partial<Record<Failure, string>> = {
  not_found: `That Facebook sign-in expired. Connect ${metaName} again.`,
  invalid_pick: `Those accounts are no longer offered. Connect ${metaName} again.`,
  forbidden: "Only team owners and admins can connect or disconnect accounts.",
};

// The Pages and Instagram accounts a Meta login shared that the team doesn't have yet. brain holds their tokens.
function MetaPicker({ team, onConnected }: { team: string; onConnected: () => void }) {
  const [choices, setChoices] = useState<MetaChoices | Failure | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  // open: the form; stale: brain no longer holds the pick, so only the error stays; finished: only the outcome stays.
  const [stage, setStage] = useState<"open" | "stale" | "finished">("open");
  const [currentSet] = useCurrentSet();
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    getMetaPick().then((r) => {
      setChoices(r);
      // Everything starts picked: connecting what Facebook just shared is the usual intent.
      if (!isFailure(r)) setChecked([...r.facebook.map((c) => `facebook:${c.id}`), ...r.instagram.map((c) => `instagram:${c.id}`)]);
    });
  }, []);

  const ids = (platform: string) => checked.filter((k) => k.startsWith(`${platform}:`)).map((k) => k.slice(platform.length + 1));

  async function onPick(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const call = async () => {
      const r = await pickMeta(ids("facebook"), ids("instagram"));
      if (r === "not_found" || r === "invalid_pick") setStage("stale");
      // The picker only offers accounts the team doesn't have, so every one saved is new.
      if (Array.isArray(r)) await joinSet(currentSet, r);
      return r;
    };
    await run("pick", call, (saved) => {
      setStage("finished");
      onConnected();
      return saved.length === 1 ? "Connected 1 account." : `Connected ${saved.length} accounts.`;
    });
  }

  async function onCancel() {
    await run("cancel", cancelMetaPick, () => {
      setStage("finished");
      return "Nothing was connected.";
    });
  }

  const group = (platform: "facebook" | "instagram", legend: string, list: MetaChoice[]) => {
    const p = platformOf(platform);
    return (
      list.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-bold">{legend}</legend>
          {list.map((c) => {
            const key = `${platform}:${c.id}`;
            return (
              <label key={key} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2">
                <input
                  type="checkbox"
                  checked={checked.includes(key)}
                  onChange={(e) => setChecked((ks) => (e.target.checked ? [...ks, key] : ks.filter((k) => k !== key)))}
                />
                <span className="relative shrink-0">
                  <Picture url={c.picture_url} name={c.name} size="size-8" bg="bg-paper" />
                  {p && (
                    <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-paper" style={{ color: p.color }}>
                      <PlatformIcon platform={p} className="size-3" />
                    </span>
                  )}
                </span>
                <span className="truncate font-bold">{c.name}</span>
              </label>
            );
          })}
        </fieldset>
      )
    );
  };

  const status = <Status problem={problem} done={done} overrides={pickMessages} />;
  if (stage === "finished") return status;
  return (
    <section aria-labelledby="meta-pick-heading" className="card grid gap-4 p-5">
      <div>
        <h3 id="meta-pick-heading" className="font-display text-lg font-extrabold tracking-tight">
          Pick accounts to connect
        </h3>
        <p className="text-ink-soft">Facebook shared these with SocialReins. Pick the ones {team} should post to.</p>
      </div>
      {stage === "open" &&
        (choices === null ? (
          <div role="status" className="h-24 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading Pages...</span>
          </div>
        ) : isFailure(choices) ? (
          <p role="alert" className="waitlist-error">
            {problemText(choices, pickMessages)}
          </p>
        ) : choices.facebook.length + choices.instagram.length === 0 ? (
          <p className="text-ink-soft">Every Page and Instagram account from that sign-in is already connected.</p>
        ) : (
          <form onSubmit={onPick} className="grid gap-4">
            {group("facebook", "Facebook Pages", choices.facebook)}
            {group("instagram", "Instagram accounts", choices.instagram)}
            <p className="hint">Instagram accounts post through the Facebook Page they are linked to.</p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy !== null || checked.length === 0}>
                {busy === "pick" ? "Connecting..." : "Connect selected"}
              </button>
              <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={onCancel}>
                Cancel
              </button>
            </div>
          </form>
        ))}
      {status}
    </section>
  );
}

const stateText = { coming_soon: "Coming soon", not_configured: "Not set up" };
const tile = "flex items-center gap-3 rounded-xl border border-ink/15 px-3 py-3 font-bold";

// Pick a network, then follow what it needs: a sign-in on the network, or Bluesky's app password.
function AddAccount({
  connected,
  loaded,
  onClose,
  onConnected,
  announce,
}: {
  connected: Connection[];
  // False while the list is loading or failed: then `connected` can't tell a new account from an old one.
  loaded: boolean;
  onClose: () => void;
  onConnected: () => void;
  announce: (text: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [providers, setProviders] = useState<Provider[] | Failure | null>(null);
  const [step, setStep] = useState<"choose" | "bluesky">("choose");
  const [handle, setHandle] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const { busy, problem, done, run } = useAction();
  const blueskyRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const [currentSet] = useCurrentSet();

  useEffect(() => {
    listProviders().then(setProviders);
  }, []);

  // The button pressed goes away with its step, so focus moves with it.
  function go(next: "choose" | "bluesky") {
    flushSync(() => setStep(next));
    (next === "bluesky" ? handleRef : blueskyRef).current?.focus();
  }

  async function onConnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = appPassword;
    // The app password is only kept for the request: cleared before the answer arrives.
    setAppPassword("");
    const call = async () => {
      const r = await connectBluesky(handle.trim(), password);
      // brain may finish after the browser stops waiting, so the list could hold the account.
      if (r === "timeout") onConnected();
      else if (loaded && !isFailure(r) && !connected.some((x) => x.id === r.id)) await joinSet(currentSet, [r]);
      return r;
    };
    await run("connect", call, (c) => {
      onConnected();
      const known = connected.some((x) => x.id === c.id);
      announce(known ? `Updated the app password for @${c.handle}.` : `Connected @${c.handle}.`);
      ref.current?.close();
    });
  }

  const known = Array.isArray(providers) ? providers : [];
  return (
    <Modal title={step === "bluesky" ? "Connect Bluesky" : "Add account"} dialogRef={ref} busy={busy !== null} onClose={onClose}>
      {providers === null ? (
        <div role="status" className="h-40 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
          <span className="sr-only">Loading platforms...</span>
        </div>
      ) : isFailure(providers) ? (
        <p role="alert" className="waitlist-error">
          Platforms couldn&apos;t be loaded. {problemText(providers)}
        </p>
      ) : step === "choose" ? (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {platforms.map((p) => {
              const state = providerState(p.id, known);
              const icon = <PlatformIcon platform={p} className="size-6" />;
              return (
                <li key={p.id}>
                  {state !== "available" ? (
                    <span className={`${tile} border-dashed text-ink-soft`}>
                      <span className="opacity-60">{icon}</span>
                      {p.name}
                      <span className="ml-auto text-xs font-normal">{stateText[state]}</span>
                    </span>
                  ) : p.id === "bluesky" ? (
                    <button ref={blueskyRef} type="button" className={`${tile} w-full hover:border-ink`} onClick={() => go("bluesky")}>
                      <span style={{ color: p.color }}>{icon}</span>
                      {p.name}
                    </button>
                  ) : (
                    <a
                      href={connectUrl(p.id)}
                      className={`${tile} hover:border-ink`}
                      onClick={() => loaded && rememberConnect(currentSet, connected.map((c) => c.id))}
                    >
                      <span style={{ color: p.color }}>{icon}</span>
                      {p.name}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="hint">
            Facebook and Instagram connect together: you sign in with Facebook, then pick your Pages and linked Instagram professional
            accounts. Connecting an account again renews its sign-in and keeps its posts and sets.
          </p>
        </>
      ) : (
        <form onSubmit={onConnect} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="bluesky-handle" className="label">
              Bluesky handle
            </label>
            <input
              ref={handleRef}
              id="bluesky-handle"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="alice.bsky.social"
              className="field"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              aria-invalid={problem === "invalid_handle" || undefined}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="bluesky-app-password" className="label">
              App password
            </label>
            <input
              id="bluesky-app-password"
              type="password"
              required
              autoComplete="off"
              className="field"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              aria-invalid={problem === "invalid_credentials" || undefined}
              aria-describedby="bluesky-app-password-note"
            />
          </div>
          <p id="bluesky-app-password-note" className="hint">
            Use an app password, not your main password: make one in Bluesky under Settings, Privacy and security, App passwords (
            <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-4">
              open App passwords
            </a>
            ). Tick &quot;Allow access to your direct messages&quot; so the inbox can read and send DMs; reconnecting an account with a new
            app password keeps its posts and sets.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy !== null}>
              {busy ? "Connecting..." : "Connect Bluesky"}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => go("choose")}>
              Back
            </button>
          </div>
          <Status problem={problem} done={done} overrides={connectMessages} />
        </form>
      )}
    </Modal>
  );
}
