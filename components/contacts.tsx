"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { Failure } from "@/lib/auth";
import { contactName, deleteContact, getContact, listContacts, listContactTags, MAX_NOTES, updateContact, type Contact, type ContactDetail, type TagCount } from "@/lib/contacts";
import { relativeTime } from "@/lib/inbox";
import { manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { AuthorAvatar, KindBadge } from "@/components/inbox";
import { platformOf, platformName, PlatformIcon, platforms } from "@/components/platform-icons";
import { TagEditor } from "@/components/tag-editor";
import { TeamLink as Link, useTeamRouter as useRouter } from "@/components/team-link";
import { isFailure, problemText, Status, useAction, useSearchInUrl } from "@/components/team-ui";
import { Icon } from "@/components/ui";

export const contactMessages: Partial<Record<Failure, ReactNode>> = {
  invalid_contact: "That wasn't saved: a tag takes 1 to 30 characters and no commas, a contact 20 tags, and the notes 2000 characters.",
  not_found: "This contact is no longer there. Reload to see the latest.",
  forbidden: "Only team owners and admins can delete a contact.",
};

const enc = encodeURIComponent;
const avatarOf = (c: Contact) => ({ id: c.external_id, handle: c.handle, name: c.display_name, avatar_url: c.avatar_url });
const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-bold ${on ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"}`;

function Network({ id }: { id: string }) {
  const p = platformOf(id);
  return (
    <span className="flex items-center gap-1.5 text-sm text-ink-soft">
      {p && <PlatformIcon platform={p} className="size-4 shrink-0" />}
      {platformName(id)}
    </span>
  );
}

type Loaded = { items: Contact[]; next: string | null };

// The people who wrote to the team's accounts: search, tag and network filters in the address, and a panel for one contact.
export function Contacts() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const tag = params.get("tag") ?? "";
  const platform = params.get("platform") ?? "";
  const openId = params.get("contact");
  const [search, setSearch] = useState(q);
  const [tags, setTags] = useState<TagCount[]>([]);
  // Loaded contacts remember the filters they were loaded for, so new filters show loading, not stale rows.
  const [loaded, setLoaded] = useState<{ key: string; page: Loaded | Failure } | null>(null);
  const [more, setMore] = useState<Failure | "loading" | null>(null);
  useSearchInUrl(search, q);

  const key = JSON.stringify([q, tag, platform]);
  const page = loaded?.key === key ? loaded.page : null;
  const href = (to: { tag?: string; platform?: string; contact?: string | null }) => {
    const s = new URLSearchParams();
    const set = (name: string, v: string | null | undefined) => v && s.set(name, v);
    set("q", search.trim());
    set("tag", to.tag ?? tag);
    set("platform", to.platform ?? platform);
    set("contact", to.contact === undefined ? openId : to.contact);
    return s.size ? `/contacts?${s}` : "/contacts";
  };

  const loadTags = () => listContactTags().then((r) => Array.isArray(r) && setTags(r));
  useEffect(() => {
    loadTags();
  }, []);
  useEffect(() => {
    let live = true;
    listContacts({ q, tag, platform }).then((r) => live && setLoaded({ key, page: isFailure(r) ? r : { items: r.items, next: r.next_cursor } }));
    return () => {
      live = false;
    };
  }, [q, tag, platform, key]);

  async function loadMore() {
    if (isFailure(page) || !page?.next) return;
    setMore("loading");
    const r = await listContacts({ q, tag, platform }, page.next);
    if (isFailure(r)) return setMore(r);
    setMore(null);
    setLoaded((l) => (l?.key === key && !isFailure(l.page) ? { key, page: { items: [...l.page.items, ...r.items], next: r.next_cursor } } : l));
  }
  // A saved contact: its row shows the new tags, and the tag chips are counted again.
  function saved(c: Contact) {
    setLoaded((l) => (l && !isFailure(l.page) ? { ...l, page: { ...l.page, items: l.page.items.map((x) => (x.id === c.id ? { ...x, ...c } : x)) } } : l));
    loadTags();
  }

  // A deleted contact: its row goes, the tags are counted again and the panel closes.
  function deleted(id: string) {
    setLoaded((l) => (l && !isFailure(l.page) ? { ...l, page: { ...l.page, items: l.page.items.filter((x) => x.id !== id) } } : l));
    loadTags();
    router.replace(href({ contact: null }), { scroll: false });
  }

  const suggestions = tags.map((t) => t.tag);
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)] gap-6 ${openId ? "lg:grid-cols-[minmax(0,1fr)_24rem]" : ""} lg:items-start`}>
      <section aria-label="Contacts" className={`${openId ? "hidden lg:grid" : "grid"} content-start gap-3`}>
        <div className="flex flex-wrap gap-3">
          <label className="relative block min-w-56 flex-1">
            <span className="sr-only">Search contacts</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft" />
            <input type="search" maxLength={100} className="field w-full pl-9" placeholder="Search name or handle" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <select aria-label="Network" className="field w-auto" value={platform} onChange={(e) => router.replace(href({ platform: e.target.value }), { scroll: false })}>
            <option value="">All networks</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {tags.length > 0 && (
          <ul aria-label="Tag" className="flex flex-wrap gap-1.5">
            {[{ tag: "", count: 0 }, ...tags].map((t) => (
              <li key={t.tag}>
                <Link href={href({ tag: t.tag })} scroll={false} aria-current={tag === t.tag ? "true" : undefined} className={`block ${chip(tag === t.tag)}`}>
                  {t.tag ? (
                    <>
                      {t.tag} <span className="font-normal tabular-nums opacity-70">{t.count}</span>
                    </>
                  ) : (
                    "All tags"
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {page === null ? (
          <div role="status" className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading contacts...</span>
          </div>
        ) : isFailure(page) ? (
          <p role="alert" className="waitlist-error">
            Contacts couldn&apos;t be loaded. {problemText(page)}
          </p>
        ) : page.items.length === 0 ? (
          <p className="card p-5 text-ink-soft">
            {q || tag || platform ? "No contacts match these filters." : "No contacts yet. Everyone who comments, mentions or messages one of your accounts shows up here."}
          </p>
        ) : (
          <>
            <ul aria-label="Contact list" className="card divide-y divide-ink/10 overflow-hidden">
              {page.items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={href({ contact: c.id })}
                    scroll={false}
                    aria-current={c.id === openId ? "true" : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 focus-visible:outline-offset-[-3px] ${c.id === openId ? "bg-signal/[0.07] shadow-[inset_3px_0_0_var(--color-signal)]" : "hover:bg-ink/[0.03]"}`}
                  >
                    <AuthorAvatar author={avatarOf(c)} size="size-9" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <strong className="min-w-0 truncate">{contactName(c)}</strong>
                        {c.handle && c.display_name && <span className="min-w-0 shrink-[4] truncate text-sm text-ink-soft">@{c.handle}</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Network id={c.platform} />
                        {c.tags.map((t) => (
                          <span key={t} className="badge tone text-ink">
                            {t}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="grid shrink-0 justify-items-end gap-0.5 text-xs text-ink-soft">
                      <span>
                        Seen <time dateTime={c.last_seen_at}>{relativeTime(c.last_seen_at)}</time>
                      </span>
                      <span className="tabular-nums">{c.items_count === 1 ? "1 message" : `${c.items_count} messages`}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {page.next && (
              <button type="button" className="btn btn-secondary btn-sm justify-self-start" disabled={more === "loading"} onClick={loadMore}>
                {more === "loading" ? "Loading..." : "Load more"}
              </button>
            )}
            {isFailure(more) && (
              <p role="alert" className="waitlist-error">
                More contacts couldn&apos;t be loaded. {problemText(more)}
              </p>
            )}
          </>
        )}
      </section>
      {openId && <ContactPanel key={openId} id={openId} suggestions={suggestions} close={href({ contact: null })} onSaved={saved} onDeleted={deleted} />}
    </div>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

function ContactPanel({ id, suggestions, close, onSaved, onDeleted }: { id: string; suggestions: string[]; close: string; onSaved: (c: Contact) => void; onDeleted: (id: string) => void }) {
  const canDelete = manages(useSession().user.current_team.role);
  const [contact, setContact] = useState<ContactDetail | Failure | null>(null);
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { busy, problem, done, run } = useAction();
  useEffect(() => {
    getContact(id).then((r) => {
      setContact(r);
      if (!isFailure(r)) setNotes(r.notes ?? "");
    });
  }, [id]);

  const back = (
    <Link href={close} scroll={false} className="flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink">
      <Icon name="left" className="size-4 lg:hidden" />
      <Icon name="close" className="hidden size-4 lg:block" />
      <span className="lg:sr-only">All contacts</span>
      <span className="hidden lg:inline">Close</span>
    </Link>
  );
  if (contact === null)
    return (
      <div role="status" className="h-80 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
        <span className="sr-only">Loading the contact...</span>
      </div>
    );
  if (isFailure(contact))
    return (
      <div className="grid gap-3">
        {back}
        <p role="alert" className="waitlist-error">
          This contact couldn&apos;t be loaded. {problemText(contact, contactMessages)}
        </p>
      </div>
    );

  const c = contact;
  const save = (patch: { tags?: string[]; notes?: string | null }, said: string) =>
    run("save", () => updateContact(c.id, patch), (r) => {
      setContact({ ...c, ...r });
      onSaved(r);
      return said;
    });
  return (
    <section aria-label="Contact" className="card grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
      <header className="flex items-start gap-3">
        <AuthorAvatar author={avatarOf(c)} size="size-12" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-extrabold tracking-tight">{contactName(c)}</h2>
          {c.handle && c.display_name && <p className="truncate text-sm text-ink-soft">@{c.handle}</p>}
          <Network id={c.platform} />
        </div>
        {back}
      </header>
      <p className="text-sm text-ink-soft">
        First seen {day(c.first_seen_at)}, last seen {day(c.last_seen_at)}, {c.items_count === 1 ? "1 message" : `${c.items_count} messages`}.
      </p>

      <div className="grid gap-1.5">
        <label htmlFor="contact-tags" className="label">
          Tags
        </label>
        <TagEditor id="contact-tags" tags={c.tags} suggestions={suggestions} disabled={busy !== null} onChange={(tags) => save({ tags }, "Tags saved.")} href={(t) => `/inbox?tag=${enc(t)}`} />
        <p className="hint">Up to 20, saved in lower case. A tag opens the inbox items of everyone who has it.</p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="contact-notes" className="label">
          Notes
        </label>
        <textarea id="contact-notes" rows={4} maxLength={MAX_NOTES} className="field resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only your team sees these." />
        <button type="button" className="btn btn-primary btn-sm justify-self-start" disabled={busy !== null || notes === (c.notes ?? "")} onClick={() => save({ notes: notes.trim() || null }, "Notes saved.")}>
          {busy ? "Saving..." : "Save notes"}
        </button>
      </div>
      <Status problem={problem} done={done} overrides={contactMessages} />

      <div className="grid gap-2">
        <h3 className="label">Recent conversations</h3>
        {c.recent.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing from them in the inbox yet.</p>
        ) : (
          <ul aria-label="Recent conversations" className="grid gap-1">
            {c.recent.map((i) => (
              <li key={i.id}>
                <Link href={`/inbox?item=${enc(i.id)}${i.state === "done" ? "&state=done" : ""}`} className="grid gap-1 rounded-xl px-2 py-1.5 hover:bg-ink/[0.04]">
                  <span className="line-clamp-2 text-sm">{i.text || "(no text)"}</span>
                  <span className="flex items-center gap-2 text-xs text-ink-soft">
                    <KindBadge kind={i.kind} />
                    <time dateTime={i.received_at}>{relativeTime(i.received_at)}</time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canDelete && (
        <div className="grid gap-2 border-t border-ink/10 pt-4">
          {confirming ? (
            <div role="alertdialog" aria-labelledby="contact-delete-title" aria-describedby="contact-delete-about" className="grid gap-2">
              <strong id="contact-delete-title">Delete {contactName(c)}?</strong>
              <p id="contact-delete-about" className="text-sm text-ink-soft">
                Their name, tags and notes are removed. Their messages stay in the inbox.
              </p>
              <span className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-danger-solid btn-sm" disabled={busy !== null} onClick={() => run("delete", () => deleteContact(c.id), () => onDeleted(c.id))}>
                  {busy === "delete" ? "Deleting..." : "Yes, delete contact"}
                </button>
                <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => setConfirming(false)}>
                  Keep contact
                </button>
              </span>
            </div>
          ) : (
            <button type="button" className="btn btn-danger-outline btn-sm justify-self-start" onClick={() => setConfirming(true)}>
              Delete contact
            </button>
          )}
        </div>
      )}
    </section>
  );
}
