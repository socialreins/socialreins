"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { MY_TEAM, teamPath, teamSegment } from "@/lib/team-path";
import { getProviders, type Failure, type Role, type Team, type User } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import { useTurnstile } from "@/components/turnstile";
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
  setAutomationsPaused,
  setRequireApproval,
  setPublicPages,
  listSubscribers,
  removeSubscriber,
  roleArticle,
  revokeInvitation,
  setRole,
  setSlug,
  type Invitation,
  type Member,
  type Subscribers,
} from "@/lib/teams";
import { reachable, subscribersCsv } from "@/lib/newsletter";
import { TeamLink as Link } from "@/components/team-link";
import { SlugField, slugOk, useSlugCheck } from "@/components/slug-field";
import { isFailure, linkButton, problemText, roleName, Status, useAction } from "@/components/team-ui";
import { cappedLine, LoadFailed, SkeletonRows } from "@/components/ui";

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
      <Rename team={team} onRenamed={setTeam} />
      <Members me={user} mine={mine} onChanged={() => setVersion((v) => v + 1)} />
      {manages(mine) && <Invitations version={version} />}
      {manages(mine) && (
        <Card id="sharing-heading" title="Sharing" help="Public pages for posts, and a newsletter sign-up on them.">
          <PublicPages team={team} onChanged={setTeam} />
          {team.public_pages && <Newsletter team={team} onChanged={setTeam} />}
        </Card>
      )}
      {manages(mine) && <Approvals team={team} onChanged={setTeam} />}
      {manages(mine) && <PauseAutomations team={team} onChanged={setTeam} />}
      {mine === "owner" && <DeleteTeam team={team} />}
    </>
  );
}

function Rename({ team, onRenamed }: { team: Team; onRenamed: (t: Team) => void }) {
  const [name, setName] = useState(team.name);
  const { busy, problem, done, run } = useAction();
  const changed = name.trim() !== team.name;
  const address = `${window.location.host}/t/`;
  // Members read the address; owners and admins change the name; only owners change the address.
  if (!manages(team.role))
    return (
      <Card id="rename-heading" title="General" help="The team's address, the start of every link to it.">
        <p>
          <span className="label">Team address</span> <code>{address + teamSegment(team)}</code>
        </p>
      </Card>
    );
  return (
    <Card id="rename-heading" title="General" help={team.role === "owner" ? "The name everyone in the team sees, and the team's address." : "The name everyone in the team sees. Only an owner changes the address."}>
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
      {team.role === "owner" ? (
        <Address team={team} prefix={address} onChanged={onRenamed} />
      ) : (
        <p>
          <span className="label">Team address</span> <code>{address + teamSegment(team)}</code>
        </p>
      )}
    </Card>
  );
}

// Owners change the address, with a sign-in from the last 10 minutes (brain says reauth_required). Changing it is asked about
// first, since every link to the team changes; the old address keeps leading to the team for a year.
function Address({ team, prefix, onChanged }: { team: Team; prefix: string; onChanged: (t: Team) => void }) {
  const [slug, setSlugText] = useState(team.slug ?? "");
  const [asking, setAsking] = useState<"set" | "default" | null>(null);
  const { busy, problem, done, run } = useAction();
  const state = useSlugCheck(slug, team.code);
  const confirmRef = useRef<HTMLDivElement>(null);
  // The question takes focus, so a screen reader reads it.
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);
  const changed = slug !== (team.slug ?? "");
  const save = (to: string | null) =>
    run("slug", () => setSlug(to), (t) => {
      onChanged(t);
      setSlugText(t.slug ?? "");
      setAsking(null);
      return t.slug
        ? `The team address is now ${prefix}${t.slug}. Old links keep working and lead here.`
        : `The team is back on its default address, ${prefix}${t.code}.`;
    });
  const target = asking === "set" ? slug : team.code;
  return (
    <>
      <form
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed && slug && slugOk(state)) setAsking("set");
        }}
      >
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-[1_1_14rem]">
            <SlugField
              id="team-slug"
              label="Team address"
              value={slug}
              onChange={(v) => {
                setSlugText(v);
                setAsking(null);
              }}
              state={state}
              prefix={prefix}
              placeholder={team.code}
              help={`3 to 32 lowercase letters, digits or dashes. Short is best: it is in every link. Links with the team's code (${team.code}) always keep working.`}
            />
          </div>
          <button
            type="submit"
            className={`btn mt-6 h-9 ${changed && slug ? "btn-primary" : "btn-secondary"}`}
            disabled={busy !== null || !changed || !slug || !slugOk(state)}
          >
            Save address
          </button>
          {team.slug && (
            <button type="button" className="btn btn-secondary mt-6 h-9" disabled={busy !== null} onClick={() => setAsking("default")}>
              Use the default address
            </button>
          )}
        </div>
      </form>
      {asking && (
        <div ref={confirmRef} tabIndex={-1} role="group" aria-label="Confirm the address change" className="grid gap-2 rounded-md border border-[var(--line)] p-3">
          <p>
            Change the team address to <code>{prefix + target}</code>? Every link to the team changes. Links with the old address keep
            working for a year and lead to the new one. You can change it 3 times in 30 days, and it needs a sign-in from the last 10 minutes.
          </p>
          <div className={confirmRow}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => save(asking === "set" ? slug : null)}>
              {busy ? "Saving..." : "Change the address"}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => setAsking(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <Status problem={problem} done={done} />
    </>
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

function Approvals({ team, onChanged }: { team: Team; onChanged: (t: Team) => void }) {
  const { busy, problem, done, run } = useAction();
  return (
    <Card id="approvals-heading" title="Approvals" help="Have an owner or admin look at members' posts before they are published.">
      <label className="flex cursor-pointer items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={!!team.require_approval}
          disabled={busy !== null}
          onChange={() =>
            run("approval", () => setRequireApproval(!team.require_approval), (t) => {
              onChanged(t);
              return t.require_approval ? "Members' posts now wait for an owner or admin to approve them." : "Members' posts go out without approval again.";
            })
          }
        />
        Members&apos; posts need an owner or admin to approve them before they go out
      </label>
      <p className="hint pl-6">A member&apos;s scheduled post shows as Needs approval on the Posts page. Approve it or ask for changes there or on the post. Posts by owners and admins go out as before.</p>
      <Status problem={problem} done={done} />
    </Card>
  );
}

function PauseAutomations({ team, onChanged }: { team: Team; onChanged: (t: Team) => void }) {
  const { busy, problem, done, run } = useAction();
  return (
    <Card id="pause-heading" title="Automations" help="Stop every automation of this team at once.">
      <label className="flex cursor-pointer items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={!!team.automations_paused}
          disabled={busy !== null}
          onChange={() =>
            run("pause", () => setAutomationsPaused(!team.automations_paused), (t) => {
              onChanged(t);
              return t.automations_paused ? "All automations are paused. Nothing is sent until you switch this off." : "Automations run again, on messages that come from now on.";
            })
          }
        />
        Pause all automations
      </label>
      <p className="hint pl-6">While this is on, no automation sends a reply or a DM, and flows waiting at a wait end. Every run it holds back is kept in the run history as paused. Items that arrive while paused are not answered later.</p>
      <Status problem={problem} done={done} />
    </Card>
  );
}

function Newsletter({ team, onChanged }: { team: Team; onChanged: (t: Team) => void }) {
  const [list, setList] = useState<Subscribers | Failure | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    listSubscribers().then(setList);
  }, []);

  const rows = list !== null && !isFailure(list) ? list.subscribers : null;
  const confirmed = rows ? rows.filter(reachable).length : 0;
  const unsubscribed = rows ? rows.filter((s) => s.unsubscribed_at).length : 0;

  function download() {
    if (!rows) return;
    const url = URL.createObjectURL(new Blob([subscribersCsv(rows)], { type: "text/csv" }));
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
      <p className="hint pl-6">Visitors give their email and confirm it with a link we send. Write to the confirmed ones from{" "}
        <Link href="/newsletters" className={linkButton}>
          Newsletters
        </Link>
        , or download the list for your own mailing tool.
      </p>
      <Status problem={problem} done={done} />
      {list === null ? (
        <SkeletonRows label="Loading subscribers..." rows={2} className="" />
      ) : isFailure(list) ? (
        <LoadFailed
          className=""
          what="subscribers"
          retry={() => {
            setList(null);
            listSubscribers().then(setList);
          }}
        >
          Subscribers couldn&apos;t be loaded. {problemText(list)}
        </LoadFailed>
      ) : list.subscribers.length === 0 ? (
        <p className="hint">No subscribers yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              {confirmed} confirmed, {list.subscribers.filter((s) => !s.confirmed && !s.unsubscribed_at).length} waiting for the email link{unsubscribed > 0 && `, ${unsubscribed} unsubscribed`}.
            </p>
            <button type="button" className="btn btn-secondary btn-sm" disabled={confirmed === 0} onClick={download}>
              Download the confirmed ones (CSV)
            </button>
          </div>
          {cappedLine(list.subscribers.length, list.total ?? list.subscribers.length, "subscribers") && (
            <p className="text-sm text-ink-soft">{cappedLine(list.subscribers.length, list.total ?? list.subscribers.length, "subscribers")}</p>
          )}
          <ul className="divide-y divide-[var(--line)]">
            {list.subscribers.map((s) => (
              <li key={s.id} className={row}>
                <div className="min-w-0 flex-[1_1_12rem]">
                  <p className="truncate font-medium">{s.email}</p>
                  <p className="hint">Signed up {date(s.subscribed_at)}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="badge tone" data-status={reachable(s) ? "verified" : undefined}>
                    {s.unsubscribed_at ? "Unsubscribed" : s.confirmed ? "Confirmed" : "Not confirmed yet"}
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
                          setList((l) =>
                            l && !isFailure(l)
                              ? {
                                  ...l,
                                  subscribers: l.subscribers.filter((x) => x.id !== s.id),
                                  total: l.total === undefined ? undefined : l.total - 1,
                                }
                              : l,
                          );
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
        <SkeletonRows label="Loading members..." rows={3} tall className="" />
      ) : isFailure(members) ? (
        <LoadFailed
          className=""
          what="members"
          retry={() => {
            setMembers(null);
            listMembers().then(setMembers);
          }}
        >
          Members couldn&apos;t be loaded. {problemText(members)}
        </LoadFailed>
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
  const [siteKey, setSiteKey] = useState<string | null>();
  const turnstile = useTurnstile(siteKey, "invite");

  useEffect(() => {
    listInvitations().then(setList);
  }, [version]);
  useEffect(() => {
    getProviders().then((p) => setSiteKey(p.turnstileSiteKey));
  }, []);

  function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run("invite", async () => {
      const sent = await invite(email.trim(), role, turnstile.token);
      turnstile.reset();
      return sent;
    }, (inv) => {
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
        {turnstile.widget}
        <button type="submit" className="btn btn-primary h-9" disabled={busy !== null || siteKey === undefined || turnstile.missing}>
          {busy === "invite" ? "Sending..." : "Send invitation"}
        </button>
      </form>
      <Status problem={problem} done={done} />
      {list === null ? (
        <SkeletonRows label="Loading invitations..." rows={1} className="" />
      ) : isFailure(list) ? (
        <LoadFailed
          className=""
          what="invitations"
          retry={() => {
            setList(null);
            listInvitations().then(setList);
          }}
        >
          Invitations couldn&apos;t be loaded. {problemText(list)}
        </LoadFailed>
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
