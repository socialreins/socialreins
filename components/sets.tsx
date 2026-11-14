"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { Failure } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import { listConnections, type Connection } from "@/lib/connections";
import { createSet, deleteSet, listSets, purgeDate, renameSet, RESTORE_DAYS, restoreSet, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { accountName, NetworkAvatar } from "@/components/connections";
import { platformName, platforms } from "@/components/platform-icons";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

const date = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
const count = (n: number) => `${n} ${n === 1 ? "account" : "accounts"}`;
// A set with more accounts than this shows a row of avatars and opens on request.
const FOLD = 8;
// Networks in the order they are listed everywhere else; an unknown one goes last.
const networkOrder = (c: Connection) => {
  const i = platforms.findIndex((p) => p.id === c.provider);
  return i < 0 ? platforms.length : i;
};

// One account: its picture with the network's mark, its name, and the network in words.
function Account({ account: a }: { account: Connection }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5">
      <NetworkAvatar connection={a} small />
      <span className="min-w-0">
        <span className="block truncate font-medium" title={accountName(a)}>
          {accountName(a)}
        </span>
        <span className="block truncate text-sm text-ink-soft">
          {platformName(a.provider)}
          {a.handle && a.display_name ? `, @${a.handle}` : ""}
        </span>
      </span>
    </li>
  );
}

export function Sets() {
  const { user } = useSession();
  return <SetsPage canManage={manages(user.current_team.role)} />;
}

function SetsPage({ canManage }: { canManage: boolean }) {
  const [live, setLive] = useState<SocialSet[] | Failure | null>(null);
  const [deleted, setDeleted] = useState<SocialSet[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[]>([]);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const main = useAction();
  const bin = useAction();
  const buttons = useRef(new Map<string, HTMLElement>());
  const openRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const reload = () => {
    listSets().then(setLive);
    listSets(true).then(setDeleted);
  };
  useEffect(() => {
    listSets().then(setLive);
    listSets(true).then(setDeleted);
    listConnections().then((r) => Array.isArray(r) && setAccounts(r));
  }, []);

  const keep = (key: string) => (el: HTMLElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  function open(kind: "rename" | "delete", s: SocialSet | null) {
    flushSync(() => {
      setRenaming(kind === "rename" && s ? s.id : null);
      setDeleting(kind === "delete" && s ? s.id : null);
      setNewName(s?.name ?? "");
    });
    openRef.current?.focus();
  }

  function close(key: string) {
    flushSync(() => {
      setRenaming(null);
      setDeleting(null);
    });
    buttons.current.get(key)?.focus();
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    main.run("create", () => createSet(name), (s) => {
      setLive((l) => (Array.isArray(l) ? [...l, s] : [s]));
      setName("");
      return `Created ${s.name}.`;
    });
  }

  async function onRename(e: FormEvent<HTMLFormElement>, s: SocialSet) {
    e.preventDefault();
    const ok = await main.run("rename", () => renameSet(s.id, newName), (updated) => {
      setLive((l) => (Array.isArray(l) ? l.map((x) => (x.id === updated.id ? updated : x)) : l));
      setRenaming(null);
      return `Renamed to ${updated.name}.`;
    });
    if (!ok) openRef.current?.focus();
  }

  async function onDelete(s: SocialSet) {
    let gone = false;
    const call = async () => {
      const r = await deleteSet(s.id);
      gone = r === "not_found";
      return r;
    };
    const ok = await main.run("delete", call, () => {
      setDeleting(null);
      reload();
      return `Deleted ${s.name}. You can restore it for ${RESTORE_DAYS} days.`;
    });
    if (gone) {
      // Deleted elsewhere: its confirm and buttons go, so focus the section heading; the alert says why.
      flushSync(() => setDeleting(null));
      reload();
      headingRef.current?.focus();
    } else if (!ok) openRef.current?.focus();
  }

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const first = Array.isArray(live) ? live.find((s) => s.is_default) : undefined;

  return (
    <>
      <section aria-labelledby="sets-heading" className="grid gap-4">
        {/* The page title already says Sets; this names the region and takes focus after a set vanishes. */}
        <h2 id="sets-heading" ref={headingRef} tabIndex={-1} className="sr-only text-lg font-semibold focus:not-sr-only">
          Sets
        </h2>
        <p className="max-w-prose text-ink-soft">
          Sets group connected accounts.
          {first && ` Every account is always in ${first.name}.`}
        </p>
        {canManage ? (
          <form onSubmit={onCreate} className="grid gap-1.5">
            <label htmlFor="new-set-name" className="label">
              New set name
            </label>
            <div className="flex gap-2">
              <input
                id="new-set-name"
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field min-w-0 sm:max-w-xs"
                aria-invalid={
                  (main.failedKey === "create" && (main.problem === "name_taken" || main.problem === "invalid_name")) || undefined
                }
              />
              <button type="submit" className="btn btn-primary" disabled={main.busy !== null}>
                {main.busy === "create" ? "Creating..." : "Create set"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-ink-soft">Only team owners and admins can change sets.</p>
        )}
        <Status problem={main.problem} done={main.done} />
        {live === null ? (
          <p className="text-ink-soft">Loading sets...</p>
        ) : isFailure(live) ? (
          <p role="alert" className="waitlist-error">
            Sets couldn&apos;t be loaded. {problemText(live)}
          </p>
        ) : (
          <ul className="card divide-y divide-[var(--line)]">
            {live.map((s) => {
              const members = s.account_ids.flatMap((id) => byId.get(id) ?? []).sort((a, b) => networkOrder(a) - networkOrder(b));
              const list = (
                <ul aria-label={`Accounts in ${s.name}`} className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-3">
                  {members.map((a) => (
                    <Account key={a.id} account={a} />
                  ))}
                </ul>
              );
              return (
                <li key={s.id} className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
                  {canManage && renaming === s.id ? (
                    <form className="grid gap-1.5" onSubmit={(e) => onRename(e, s)}>
                      <label htmlFor={`rename-${s.id}`} className="label">
                        New name for {s.name}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={(el) => {
                            openRef.current = el;
                          }}
                          id={`rename-${s.id}`}
                          required
                          maxLength={60}
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="field min-w-0 flex-1 sm:max-w-xs"
                        />
                        <button type="submit" className="btn btn-primary" disabled={main.busy !== null}>
                          {main.busy === "rename" ? "Saving..." : "Save name"}
                        </button>
                        <button type="button" className="btn btn-quiet" disabled={main.busy !== null} onClick={() => close(`rename:${s.id}`)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex min-h-8 items-center gap-2">
                      <h3 className="min-w-0 truncate text-lg font-semibold" title={s.name}>
                        {s.name}
                      </h3>
                      {s.is_default && <span className="badge tone shrink-0">Every account</span>}
                      <p className="shrink-0 text-sm text-ink-soft">{count(s.account_count)}</p>
                      {canManage && deleting !== s.id && (
                        <div className="ml-auto flex shrink-0 gap-1.5">
                          <button
                            ref={keep(`rename:${s.id}`)}
                            type="button"
                            className="icon-btn"
                            disabled={main.busy !== null}
                            aria-label={`Rename ${s.name}`}
                            title="Rename"
                            onClick={() => open("rename", s)}
                          >
                            <Icon name="edit" />
                          </button>
                          {!s.is_default && (
                            <button
                              ref={keep(`delete:${s.id}`)}
                              type="button"
                              className="icon-btn enabled:hover:text-signal-deep"
                              disabled={main.busy !== null}
                              aria-label={`Delete ${s.name}`}
                              title="Delete"
                              onClick={() => open("delete", s)}
                            >
                              <Icon name="trash" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {canManage && deleting === s.id && (
                    <form
                      className="grid gap-2 rounded-md bg-signal-deep/[0.07] p-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        onDelete(s);
                      }}
                    >
                      <p id={`delete-q-${s.id}`}>
                        Delete {s.name}? You can restore it for {RESTORE_DAYS} days. This needs a sign-in from the last 10 minutes.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          ref={(el) => {
                            openRef.current = el;
                          }}
                          type="submit"
                          className="btn btn-primary btn-sm"
                          aria-describedby={`delete-q-${s.id}`}
                          disabled={main.busy !== null}
                        >
                          {main.busy === "delete" ? "Deleting..." : "Yes, delete"}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={main.busy !== null} onClick={() => close(`delete:${s.id}`)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                  {s.account_count === 0 && !s.is_default ? (
                    <p className="text-sm text-ink-soft">No accounts yet. Add some from an account&apos;s settings on the Accounts page.</p>
                  ) : members.length === 0 ? null : members.length > FOLD ? (
                    <details className="group grid gap-3">
                      <summary className="flex cursor-pointer list-none items-center gap-2 justify-self-start rounded-md text-sm font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                        <span aria-hidden="true" className="flex items-center gap-2 group-open:hidden">
                          {members.slice(0, 5).map((a) => (
                            <NetworkAvatar key={a.id} connection={a} small />
                          ))}
                        </span>
                        <span className="group-open:hidden">Show all {members.length}</span>
                        <span className="hidden group-open:inline">Hide accounts</span>
                        <span className="sr-only"> in {s.name}</span>
                        <Icon name="down" className="size-4 group-open:rotate-180" />
                      </summary>
                      <div className="mt-3">{list}</div>
                    </details>
                  ) : (
                    list
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="deleted-heading" className="grid gap-2">
        <h2 id="deleted-heading" className="text-sm font-semibold text-ink-soft">
          Recently deleted
        </h2>
        <p className="hint">A deleted set can be restored for {RESTORE_DAYS} days.</p>
        <Status problem={bin.problem} done={bin.done} />
        {deleted === null ? (
          <p className="text-sm text-ink-soft">Loading deleted sets...</p>
        ) : isFailure(deleted) ? (
          <p role="alert" className="waitlist-error">
            Deleted sets couldn&apos;t be loaded. {problemText(deleted)}
          </p>
        ) : deleted.length === 0 ? (
          <p className="text-sm text-ink-soft">No recently deleted sets.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {deleted.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                  <p className="truncate font-medium" title={s.name}>
                    {s.name}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {count(s.account_count)}. Gone for good on {date(purgeDate(s.deleted_at!))}.
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm shrink-0"
                    disabled={bin.busy !== null}
                    aria-label={`Restore ${s.name}`}
                    onClick={() =>
                      bin.run(`restore:${s.id}`, () => restoreSet(s.id), (r) => {
                        reload();
                        return `Restored ${r.name}.`;
                      })
                    }
                  >
                    {bin.busy === `restore:${s.id}` ? "Restoring..." : "Restore"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
