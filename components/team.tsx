"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { MY_TEAM, teamPath } from "@/lib/team-path";
import type { Failure, Role, Team, User } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import {
  deleteTeam,
  grantable,
  invite,
  listInvitations,
  listMembers,
  manages,
  mayChange,
  removeMember,
  renameTeam,
  setNewsletter,
  setPublicPages,
  listSubscribers,
  removeSubscriber,
  roleArticle,
  revokeInvitation,
  setRole,
  type Invitation,
  type Member,
} from "@/lib/teams";
import { subscribersCsv, type Subscriber } from "@/lib/newsletter";
import { isFailure, problemText, roleName, Status, useAction } from "@/components/team-ui";

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

const row = "flex flex-wrap items-center gap-x-4 gap-y-2 py-3";
const confirmRow = "flex basis-full flex-wrap items-center gap-2";

// One card per area: a title, one short line of help, then its controls.
function Card({ id, title, help, danger, children }: { id: string; title: string; help: ReactNode; danger?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`card grid min-w-0 grid-cols-1 gap-4 p-5 ${danger ? "card-danger" : ""}`}>
      <div className="grid gap-0.5">
        <h2 id={id} className={`text-base font-semibold ${danger ? "text-danger" : ""}`}>
          {title}
        </h2>
        <p className="hint">{help}</p>
      </div>
      {children}
    </section>
  );
}

const Initial = ({ text }: { text: string }) => (
  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/8 text-sm font-semibold uppercase text-ink-soft">
    {text.trim().charAt(0) || "?"}
  </span>
);

export function TeamSettings() {
  return <TeamPage user={useSession().user} />;
}

function TeamPage({ user }: { user: User }) {
  const { setTeam } = useSession();
  const team = user.current_team;
  // brain drops the invitations a member sent once they are removed or can no longer invite.
  const [version, setVersion] = useState(0);
  const mine = team.role;
  return (
    <>
      <p className="text-ink-soft">
        You are {roleArticle(mine)} {roleName[mine].toLowerCase()} of <strong className="text-ink">{team.name}</strong>.
      </p>
      {manages(mine) && <Rename team={team} onRenamed={setTeam} />}
      <Members me={user} mine={mine} onChanged={() => setVersion((v) => v + 1)} />
      {manages(mine) && <Invitations version={version} />}
      {manages(mine) && (
        <Card id="sharing-heading" title="Sharing" help="Public pages for posts, and a newsletter sign-up on them.">
          <PublicPages team={team} onChanged={setTeam} />
          {team.public_pages && <Newsletter team={team} onChanged={setTeam} />}
        </Card>
      )}
      {mine === "owner" && <DeleteTeam team={team} />}
    </>
  );
}

function Rename({ team, onRenamed }: { team: Team; onRenamed: (t: Team) => void }) {
  const [name, setName] = useState(team.name);
  const { busy, problem, done, run } = useAction();
  const changed = name.trim() !== team.name;
  return (
    <Card id="rename-heading" title="General" help="The name everyone in the team sees.">
      <form
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          run("rename", () => renameTeam(name), (t) => {
            onRenamed(t);
            return `The team is now called ${t.name}.`;
          });
        }}
      >
        <label htmlFor="team-name" className="label">
          Name
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="team-name"
            className="field min-w-0 flex-[1_1_14rem]"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={problem === "invalid_name" || undefined}
          />
          <button type="submit" className={`btn h-9 ${changed ? "btn-primary" : "btn-secondary"}`} disabled={busy !== null}>
            {busy ? "Saving..." : "Save name"}
          </button>
        </div>
      </form>
      <Status problem={problem} done={done} />
    </Card>
  );
}

function PublicPages({ team, onChanged }: { team: Team; onChanged: (t: Team) => void }) {
  const { busy, problem, done, run } = useAction();
  return (
    <section aria-labelledby="pages-heading" className="grid min-w-0 grid-cols-1 gap-2">
      <h3 id="pages-heading" className="text-sm font-semibold">
        Public pages
      </h3>
      <label className="flex cursor-pointer items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={!!team.public_pages}
          disabled={busy !== null}
          onChange={() =>
            run("pages", () => setPublicPages(!team.public_pages), (t) => {
              onChanged(t);
              return t.public_pages ? "Public pages are on. Switch one on for a post from its page." : "Public pages are off. No post page can be opened now.";
            })
          }
        />
        Posts can have a public page
      </label>
      <p className="hint pl-6">A public page shows a published post with extra details and links to anyone who has its link. Each post is switched on by itself.</p>
      <Status problem={problem} done={done} />
    </section>
  );
}

function Newsletter({ team, onChanged }: { team: Team; onChanged: (t: Team) => void }) {
  const [list, setList] = useState<Subscriber[] | Failure | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    listSubscribers().then((r) => setList(isFailure(r) ? r : r.subscribers));
  }, []);

  const confirmed = Array.isArray(list) ? list.filter((s) => s.confirmed).length : 0;

  function download() {
    if (!Array.isArray(list)) return;
    const url = URL.createObjectURL(new Blob([subscribersCsv(list)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "subscribers.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    // Nested under public pages: the sign-up only shows on them.
    <section aria-labelledby="newsletter-heading" className="ml-2 grid min-w-0 grid-cols-1 gap-2 border-l-2 border-[var(--line)] pl-4 sm:ml-6">
      <h3 id="newsletter-heading" className="text-sm font-semibold">
        Newsletter
      </h3>
      <label className="flex cursor-pointer items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={!!team.newsletter}
          disabled={busy !== null}
          onChange={() =>
            run("newsletter", () => setNewsletter(!team.newsletter), (t) => {
              onChanged(t);
              return t.newsletter ? "Public pages now offer a newsletter sign-up." : "Public pages no longer offer a newsletter sign-up.";
            })
          }
        />
        Public pages offer a newsletter sign-up
      </label>
      <p className="hint pl-6">Visitors give their email and confirm it with a link we send. Nothing is sent to them yet: you get the list to use in your own mailing tool.</p>
      <Status problem={problem} done={done} />
      {list === null ? (
        <p className="hint">Loading subscribers...</p>
      ) : isFailure(list) ? (
        <p role="alert" className="waitlist-error">
          Subscribers couldn&apos;t be loaded. {problemText(list)}
        </p>
      ) : list.length === 0 ? (
        <p className="hint">No subscribers yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              {confirmed} confirmed, {list.length - confirmed} waiting for the email link.
            </p>
            <button type="button" className="btn btn-secondary btn-sm" disabled={confirmed === 0} onClick={download}>
              Download the confirmed ones (CSV)
            </button>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {list.map((s) => (
              <li key={s.id} className={row}>
                <div className="min-w-0 flex-[1_1_12rem]">
                  <p className="truncate font-medium">{s.email}</p>
                  <p className="hint">Signed up {date(s.subscribed_at)}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="badge tone" data-status={s.confirmed ? "verified" : undefined}>
                    {s.confirmed ? "Confirmed" : "Not confirmed yet"}
                  </span>
                  {confirming !== s.id && (
                    <button type="button" className="btn btn-quiet btn-danger btn-sm" disabled={busy !== null} aria-label={`Remove ${s.email}`} onClick={() => setConfirming(s.id)}>
                      Remove
                    </button>
                  )}
                </div>
                {confirming === s.id && (
                  <div className={confirmRow}>
                    <span>Remove {s.email}? They can sign up again.</span>
                    <button
                      type="button"
                      className="btn btn-danger-solid btn-sm"
                      disabled={busy !== null}
                      onClick={() =>
                        run(`remove:${s.id}`, () => removeSubscriber(s.id), () => {
                          setConfirming(null);
                          setList((l) => (Array.isArray(l) ? l.filter((x) => x.id !== s.id) : l));
                          return `${s.email} was removed.`;
                        })
                      }
                    >
                      {busy === `remove:${s.id}` ? "Removing..." : "Yes, remove"}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Members({ me, mine, onChanged }: { me: User; mine: Role; onChanged: () => void }) {
  const router = useRouter();

  const [members, setMembers] = useState<Member[] | Failure | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const { busy, problem, done, run } = useAction();
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listMembers().then(setMembers);
  }, []);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function cancel(id: string) {
    flushSync(() => setConfirming(null));
    removeRefs.current.get(id)?.focus();
  }

  async function remove(m: Member) {
    const leaving = m.id === me.id;
    const ok = await run("remove", () => removeMember(m.id), () => {
      if (leaving) return;
      setMembers((list) => (Array.isArray(list) ? list.filter((x) => x.id !== m.id) : list));
      onChanged();
      return `${m.name} was removed from the team.`;
    });
    // Leaving changes the current team; the address of "my team" makes the shell load the new one.
    if (ok && leaving) return router.push(teamPath(MY_TEAM, "/home"));
    flushSync(() => setConfirming(null));
    if (!ok) removeRefs.current.get(m.id)?.focus();
  }

  function changeRole(e: FormEvent<HTMLFormElement>, m: Member) {
    e.preventDefault();
    const role = roles[m.id] ?? m.role;
    run(`role:${m.id}`, () => setRole(m.id, role), (updated) => {
      setMembers((list) => (Array.isArray(list) ? list.map((x) => (x.id === m.id ? updated : x)) : list));
      onChanged();
      return `${m.name} is now ${roleName[updated.role].toLowerCase()}.`;
    });
  }

  return (
    <Card id="members-heading" title="Members" help={manages(mine) ? "Everyone in the team. Change a role or remove someone." : "Everyone in the team."}>
      <Status problem={problem} done={done} />
      {members === null ? (
        <p className="hint">Loading members...</p>
      ) : isFailure(members) ? (
        <p role="alert" className="waitlist-error">
          Members couldn&apos;t be loaded. {problemText(members)}
        </p>
      ) : (
        <ul className="-my-3 divide-y divide-[var(--line)]">
          {members.map((m) => {
            const self = m.id === me.id;
            const editable = !self && manages(mine) && mayChange(mine, m.role);
            return (
              <li key={m.id} className={row}>
                <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-3">
                  <Initial text={m.name || m.email} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {m.name}
                      {self && <span className="font-normal text-ink-soft"> (you)</span>}
                    </p>
                    <p className="hint truncate">
                      {m.email} · Joined {date(m.joined_at)}
                    </p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {editable ? (
                    <form className="flex items-center gap-2" onSubmit={(e) => changeRole(e, m)}>
                      <label htmlFor={`role-${m.id}`} className="sr-only">
                        Role for {m.name}
                      </label>
                      <select
                        id={`role-${m.id}`}
                        className="field w-auto"
                        value={roles[m.id] ?? m.role}
                        onChange={(e) => setRoles((r) => ({ ...r, [m.id]: e.target.value as Role }))}
                      >
                        {grantable(mine).map((r) => (
                          <option key={r} value={r}>
                            {roleName[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="btn btn-secondary btn-sm"
                        aria-label={`Change ${m.name}'s role`}
                        disabled={busy !== null || (roles[m.id] ?? m.role) === m.role}
                      >
                        {busy === `role:${m.id}` ? "Saving..." : "Change role"}
                      </button>
                    </form>
                  ) : (
                    <span className="badge tone">{roleName[m.role]}</span>
                  )}
                  {(editable || self) && confirming !== m.id && (
                    <button
                      ref={(el) => {
                        if (el) removeRefs.current.set(m.id, el);
                        else removeRefs.current.delete(m.id);
                      }}
                      type="button"
                      className="btn btn-quiet btn-danger btn-sm"
                      disabled={busy !== null}
                      aria-label={self ? undefined : `Remove ${m.name}`}
                      onClick={() => setConfirming(m.id)}
                    >
                      {self ? "Leave team" : "Remove"}
                    </button>
                  )}
                </div>
                {(editable || self) && confirming === m.id && (
                  <div className={confirmRow}>
                    <p id={`confirm-${m.id}`}>{self ? "Leave this team? You will lose access to it." : `Remove ${m.name} from the team?`}</p>
                    <button
                      ref={confirmRef}
                      type="button"
                      className="btn btn-danger-solid btn-sm"
                      aria-describedby={`confirm-${m.id}`}
                      disabled={busy !== null}
                      onClick={() => remove(m)}
                    >
                      {busy === "remove" ? (self ? "Leaving..." : "Removing...") : self ? "Yes, leave" : "Yes, remove"}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => cancel(m.id)}>
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Invitations({ version }: { version: number }) {
  const [list, setList] = useState<Invitation[] | Failure | null>(null);
  const [email, setEmail] = useState("");
  const [role, setInviteRole] = useState<Invitation["role"]>("member");
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    listInvitations().then(setList);
  }, [version]);

  function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run("invite", () => invite(email.trim(), role), (inv) => {
      // A new invitation for a pending email replaces the old one.
      setList((l) => [...(Array.isArray(l) ? l.filter((x) => x.email !== inv.email) : []), inv]);
      setEmail("");
      return `Invitation sent to ${inv.email}.`;
    });
  }

  return (
    <Card id="invitations-heading" title="Invitations" help="The link works for 7 days and only for that email.">
      <form onSubmit={onInvite} className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-[1_1_14rem] gap-1.5">
          <label htmlFor="invite-email" className="label">
            Email
          </label>
          <input
            id="invite-email"
            className="field"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={problem === "invalid_email" || problem === "already_member" || undefined}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="invite-role" className="label">
            Role
          </label>
          <select id="invite-role" className="field w-auto" value={role} onChange={(e) => setInviteRole(e.target.value as Invitation["role"])}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary h-9" disabled={busy !== null}>
          {busy === "invite" ? "Sending..." : "Send invitation"}
        </button>
      </form>
      <Status problem={problem} done={done} />
      {list === null ? (
        <p className="hint">Loading invitations...</p>
      ) : isFailure(list) ? (
        <p role="alert" className="waitlist-error">
          Invitations couldn&apos;t be loaded. {problemText(list)}
        </p>
      ) : list.length === 0 ? (
        <p className="hint">No pending invitations.</p>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-1">
          <h3 className="text-sm font-semibold">Pending</h3>
          <ul className="divide-y divide-[var(--line)]">
            {list.map((inv) => (
              <li key={inv.id} className={row}>
                <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-3">
                  <Initial text={inv.email} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="hint">Expires {date(inv.expires_at)}</p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="badge tone">{roleName[inv.role]}</span>
                  <button
                    type="button"
                    className="btn btn-quiet btn-danger btn-sm"
                    disabled={busy !== null}
                    aria-label={`Revoke the invitation for ${inv.email}`}
                    onClick={() =>
                      run(`revoke:${inv.id}`, () => revokeInvitation(inv.id), () => {
                        setList((l) => (Array.isArray(l) ? l.filter((x) => x.id !== inv.id) : l));
                        return `The invitation for ${inv.email} was revoked.`;
                      })
                    }
                  >
                    {busy === `revoke:${inv.id}` ? "Revoking..." : "Revoke"}
                  </button>
                </div>
              </li>
            ))}
            </ul>
        </div>
      )}
    </Card>
  );
}

function DeleteTeam({ team }: { team: Team }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const { busy, problem, done, run } = useAction();

  async function onDelete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!(await run("delete", deleteTeam, () => undefined))) return;
    router.push(teamPath(MY_TEAM, "/home"));
  }

  return (
    <Card id="danger-heading" title="Danger zone" help="These actions can't be undone." danger>
      <section aria-labelledby="delete-heading" className="grid gap-2">
        <h3 id="delete-heading" className="text-sm font-semibold">
          Delete team
        </h3>
        <p className="hint">
          This removes the team, its members and its invitations. For your safety it needs a sign-in from the last 10 minutes.
        </p>
        <form onSubmit={onDelete} className="grid gap-1.5">
          <label htmlFor="delete-confirm" className="label">
            Type {team.name} to confirm
          </label>
          <div className="flex flex-wrap gap-2">
            <input id="delete-confirm" className="field min-w-0 flex-[1_1_14rem]" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            {/* Solid only once the name is typed: that is the final confirm. */}
            <button type="submit" className={`btn h-9 ${typed.trim() === team.name ? "btn-danger-solid" : "btn-danger-outline"}`} disabled={busy !== null || typed.trim() !== team.name}>
              {busy ? "Deleting..." : "Delete team"}
            </button>
          </div>
        </form>
        <Status problem={problem} done={done} />
      </section>
    </Card>
  );
}
