"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Failure } from "@/lib/auth";
import { listWaitlist, parseVerified, type Verified, type Waitlist } from "@/lib/admin";
import { isFailure, problemText } from "@/components/team-ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const filters: { value: Verified; label: string }[] = [
  { value: null, label: "All" },
  { value: true, label: "Verified" },
  { value: false, label: "Not verified" },
];

export function Admin() {
  const verified = parseVerified(useSearchParams().get("verified"));
  // The answer remembers its filter, so a new filter shows loading, not the old rows.
  const [loaded, setLoaded] = useState<{ verified: Verified; data: Waitlist | Failure } | null>(null);

  useEffect(() => {
    let live = true;
    listWaitlist(verified).then((data) => live && setLoaded({ verified, data }));
    return () => {
      live = false;
    };
  }, [verified]);

  const data = loaded?.verified === verified ? loaded.data : null;
  if (data === "forbidden")
    return (
      <p role="alert" className="waitlist-error">
        You don&apos;t have access to the admin panel.
      </p>
    );

  return (
    <section aria-labelledby="waitlist-heading" className="grid gap-4">
      <h2 id="waitlist-heading" className={heading}>
        Waitlist
      </h2>
      {isFailure(data) ? (
        <p role="alert" className="waitlist-error">
          The waitlist couldn&apos;t be loaded. {problemText(data)}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {[
              ["Total", data?.total],
              ["Verified", data?.verified],
              ["Unverified", data && data.total - data.verified],
            ].map(([label, n]) => (
              <div key={label} className="card grid gap-1 p-4">
                <dt className="text-sm font-bold text-ink-soft">{label}</dt>
                <dd className="font-display text-2xl font-extrabold">{typeof n === "number" ? n.toLocaleString() : "..."}</dd>
              </div>
            ))}
          </dl>
          <nav aria-label="Filter" className="flex gap-1 justify-self-start rounded-full bg-ink/5 p-1">
            {filters.map((f) => (
              <Link
                key={f.label}
                aria-current={verified === f.value ? "true" : undefined}
                href={f.value === null ? "/app/admin" : `/app/admin?verified=${f.value}`}
                className={`rounded-full px-3 py-1.5 text-center text-sm font-bold ${verified === f.value ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          {!data ? (
            <p role="status" className="text-ink-soft">
              Loading the waitlist...
            </p>
          ) : data.signups.length === 0 ? (
            <p className="text-ink-soft">No signups here yet.</p>
          ) : (
            // Scrolls sideways on phones rather than squeezing the emails.
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <caption className="sr-only">Waitlist signups, newest first</caption>
                <thead>
                  <tr className="text-left text-xs text-ink-soft">
                    {["Email", "Source", "Joined", "Status"].map((h) => (
                      <th key={h} scope="col" className="border-b border-ink/10 px-4 py-2 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.signups.map((s) => (
                    <tr key={s.id} className="border-t border-ink/10 first:border-t-0">
                      <td className="px-4 py-2.5 font-bold">{s.email}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{s.source}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{day(s.created_at)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="badge tone" data-status={s.verified_at ? "verified" : undefined}>
                          {s.verified_at ? `Verified ${day(s.verified_at)}` : "Not verified"}
                        </span>
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
