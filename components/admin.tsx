"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Failure } from "@/lib/auth";
import {
  approvalText,
  approveSignup,
  getOverview,
  listWaitlist,
  parseVerified,
  removeSignup,
  waitlistQuery,
  type Signup,
  type Verified,
  type Waitlist,
} from "@/lib/admin";
import { isFailure, linkButton, problemText, Status, useAction } from "@/components/team-ui";

export const heading = "font-display text-xl font-extrabold tracking-tight";
export const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
export const th = "border-b border-ink/10 px-4 py-2 font-bold";
export const td = "px-4 py-2.5";
const filters: { value: Verified; label: string }[] = [
  { value: null, label: "All" },
  { value: true, label: "Verified" },
  { value: false, label: "Not verified" },
];

// brain decides who is a site admin; a stale admin flag still gets its refusal shown.
export function Forbidden() {
  return (
    <p role="alert" className="waitlist-error">
      You don&apos;t have access to the admin panel.
    </p>
  );
}

// A search that lives in the URL: submitting goes to `hrefFor(text)`, so a reload keeps it.
export function SearchBox({ label, q, hrefFor }: { label: string; q: string; hrefFor: (q: string) => string }) {
  const router = useRouter();
  return (
    <form
      role="search"
      className="flex w-full max-w-md items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(hrefFor(String(new FormData(e.currentTarget).get("q") ?? "").trim()));
      }}
    >
      {/* The key resets the box when the URL's search changes (Clear, Back). */}
      <input key={q} type="search" name="q" aria-label={label} placeholder={label} defaultValue={q} maxLength={200} className="field min-w-0 flex-1" />
      <button type="submit" className="btn btn-secondary btn-sm">
        Search
      </button>
      {q && (
        <Link href={hrefFor("")} className={linkButton}>
          Clear
        </Link>
      )}
    </form>
  );
}

export function Admin() {
  const params = useSearchParams();
  const verified = parseVerified(params.get("verified"));
  const q = (params.get("q") ?? "").trim();
  const key = waitlistQuery(verified, q);
  // The answer remembers its filter, so a new filter shows loading, not the old rows.
  const [loaded, setLoaded] = useState<{ key: string; data: Waitlist | Failure } | null>(null);
  // The waitlist answer has no approved total; the overview does. Kept in step with approve and remove below.
  const [approved, setApproved] = useState<number | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    let live = true;
    listWaitlist(verified, q).then((data) => live && setLoaded({ key, data }));
    return () => {
      live = false;
    };
  }, [verified, q, key]);
  useEffect(() => {
    getOverview().then((o) => isFailure(o) || setApproved(o.waitlist.approved));
  }, []);

  const data = loaded?.key === key ? loaded.data : null;
  if (data === "forbidden") return <Forbidden />;

  const change = (f: (w: Waitlist) => Waitlist) => setLoaded((l) => (l && !isFailure(l.data) ? { ...l, data: f(l.data) } : l));

  function onApprove(s: Signup) {
    action.run(`approve:${s.id}`, () => approveSignup(s.id), (r) => {
      change((w) => ({ ...w, signups: w.signups.map((x) => (x.id === s.id ? r.signup : x)) }));
      if (r.mail !== "already_approved") setApproved((n) => (n === null ? n : n + 1));
      return approvalText(r);
    });
  }

  function onRemove(s: Signup) {
    action.run(`remove:${s.id}`, () => removeSignup(s.id), () => {
      setRemoving(null);
      change((w) => ({ total: w.total - 1, verified: w.verified - (s.verified_at ? 1 : 0), signups: w.signups.filter((x) => x.id !== s.id) }));
      if (s.approved_at) setApproved((n) => (n === null ? n : n - 1));
      return `Removed ${s.email} from the waitlist.`;
    });
  }

  // Cancel unmounts the focused button; put focus back on the row's Remove.
  const cancelRemove = (id: string) => {
    flushSync(() => setRemoving(null));
    document.getElementById(`remove-${id}`)?.focus();
  };

  return (
    <section aria-labelledby="waitlist-heading" className="grid gap-4">
      <h2 id="waitlist-heading" className={heading}>
        Signups
      </h2>
      {isFailure(data) ? (
        <p role="alert" className="waitlist-error">
          The waitlist couldn&apos;t be loaded. {problemText(data)}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Total", data?.total],
              ["Verified", data?.verified],
              ["Unverified", data && data.total - data.verified],
              ["Approved", approved],
            ].map(([label, n]) => (
              <div key={label} className="card grid gap-1 p-4">
                <dt className="text-sm font-bold text-ink-soft">{label}</dt>
                <dd className="font-display text-2xl font-extrabold">{typeof n === "number" ? n.toLocaleString() : "..."}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Filter" className="flex gap-1 rounded-full bg-ink/5 p-1">
              {filters.map((f) => (
                <Link
                  key={f.label}
                  aria-current={verified === f.value ? "true" : undefined}
                  href={`/admin/waitlist${waitlistQuery(f.value, q)}`}
                  className={`rounded-full px-3 py-1.5 text-center text-sm font-bold ${verified === f.value ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
            <SearchBox label="Search by email" q={q} hrefFor={(text) => `/admin/waitlist${waitlistQuery(verified, text)}`} />
          </div>
          <Status problem={action.problem} done={action.done} />
          {!data ? (
            <p role="status" className="text-ink-soft">
              Loading the waitlist...
            </p>
          ) : data.signups.length === 0 ? (
            <p className="text-ink-soft">{q ? `No signups match "${q}".` : "No signups here yet."}</p>
          ) : (
            // Scrolls sideways on phones rather than squeezing the emails.
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-sm">
                <caption className="sr-only">Waitlist signups, newest first</caption>
                <thead>
                  <tr className="text-left text-xs text-ink-soft">
                    {["Email", "Source", "Joined", "Status", "Actions"].map((h) => (
                      <th key={h} scope="col" className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.signups.map((s) => (
                    <tr key={s.id} className="border-t border-ink/10 first:border-t-0">
                      <th scope="row" className={`${td} text-left font-bold`}>
                        {s.email}
                      </th>
                      <td className={`${td} text-ink-soft`}>{s.source}</td>
                      <td className={`${td} whitespace-nowrap`}>{day(s.created_at)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="flex flex-wrap gap-1">
                          <span className="badge tone" data-status={s.verified_at ? "verified" : undefined}>
                            {s.verified_at ? `Verified ${day(s.verified_at)}` : "Not verified"}
                          </span>
                          {s.approved_at && (
                            <span className="badge tone" data-status="approved">
                              Approved {day(s.approved_at)}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={td}>
                        {removing === s.id ? (
                          <div className="flex min-w-64 flex-wrap items-center gap-x-4 gap-y-1">
                            <p id={`remove-q-${s.id}`} className="basis-full">
                              Remove {s.email} from the waitlist?
                              {s.approved_at && " It is approved: removing it takes the approval away, so this person may no longer be able to sign up."}
                            </p>
                            <button
                              type="button"
                              autoFocus
                              className={linkButton}
                              aria-describedby={`remove-q-${s.id}`}
                              disabled={action.busy !== null}
                              onClick={() => onRemove(s)}
                            >
                              {action.busy === `remove:${s.id}` ? "Removing..." : "Yes, remove"}
                            </button>
                            <button type="button" className={linkButton} disabled={action.busy !== null} onClick={() => cancelRemove(s.id)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-4 whitespace-nowrap">
                            {!s.approved_at && (
                              <button
                                type="button"
                                className={linkButton}
                                disabled={action.busy !== null}
                                aria-label={`Approve ${s.email}`}
                                onClick={() => onApprove(s)}
                              >
                                {action.busy === `approve:${s.id}` ? "Approving..." : "Approve"}
                              </button>
                            )}
                            <button
                              id={`remove-${s.id}`}
                              type="button"
                              className={linkButton}
                              disabled={action.busy !== null}
                              aria-label={`Remove ${s.email}`}
                              onClick={() => setRemoving(s.id)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
