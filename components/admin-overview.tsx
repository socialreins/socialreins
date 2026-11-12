"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Failure } from "@/lib/auth";
import { getOverview, type Overview } from "@/lib/admin";
import { isFailure, problemText } from "@/components/team-ui";
import { Forbidden } from "@/components/admin";
import { PlatformIcon, platformOf, platforms } from "@/components/platform-icons";

// The three brain always sends come first; the rest show only when a post has that status.
const postStatuses = ["scheduled", "published", "failed", "draft", "queued", "deleted"];
const title = (s: string) => s[0].toUpperCase() + s.slice(1);

// One number with its breakdown; the title links to the page that lists it, when there is one.
function Card({ id, name, href, total, children }: { id: string; name: string; href?: string; total: number; children?: ReactNode }) {
  return (
    <section aria-labelledby={`overview-${id}`} className="card grid content-start gap-2 p-4">
      <h2 id={`overview-${id}`} className="text-sm font-bold text-ink-soft">
        {href ? (
          <Link href={href} className="underline decoration-signal decoration-2 underline-offset-4 hover:text-ink">
            {name}
          </Link>
        ) : (
          name
        )}
      </h2>
      <p className="font-display text-3xl font-extrabold">{total.toLocaleString()}</p>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [label: ReactNode, n: number, key: string][] }) {
  return (
    <dl className="grid gap-1 text-sm">
      {rows.map(([label, n, key]) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-ink-soft">{label}</dt>
          <dd className="font-bold">{n.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminOverview() {
  const [data, setData] = useState<Overview | Failure | null>(null);
  useEffect(() => {
    getOverview().then(setData);
  }, []);

  if (data === "forbidden") return <Forbidden />;
  if (isFailure(data))
    return (
      <p role="alert" className="waitlist-error">
        The overview couldn&apos;t be loaded. {problemText(data)}
      </p>
    );
  if (!data)
    return (
      <p role="status" className="text-ink-soft">
        Loading the overview...
      </p>
    );

  const { accounts, posts, waitlist } = data;
  // Known networks in the app's own order, then anything brain knows that this build doesn't.
  const providers = [...platforms.map((p) => p.id), ...Object.keys(accounts.by_provider).filter((id) => !platformOf(id))].filter((id) => accounts.by_provider[id]);
  const statuses = [...postStatuses, ...Object.keys(posts).filter((s) => !postStatuses.includes(s))].filter((s) => s in posts);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Card id="users" name="Users" href="/admin/users" total={data.users}>
        <Rows rows={[["New in 7 days", data.new_users_7d, "new"]]} />
      </Card>
      <Card id="teams" name="Teams" href="/admin/teams" total={data.teams} />
      <Card id="waitlist" name="Waitlist" href="/admin/waitlist" total={waitlist.total}>
        <Rows
          rows={[
            ["Verified", waitlist.verified, "verified"],
            ["Approved", waitlist.approved, "approved"],
          ]}
        />
      </Card>
      <Card id="accounts" name="Connected accounts" total={accounts.total}>
        {providers.length === 0 ? (
          <p className="text-sm text-ink-soft">None connected yet.</p>
        ) : (
          <Rows
            rows={providers.map((id) => {
              const p = platformOf(id);
              return [
                <>
                  {p && (
                    <span style={{ color: p.color }}>
                      <PlatformIcon platform={p} className="size-4" />
                    </span>
                  )}
                  {p?.name ?? id}
                </>,
                accounts.by_provider[id],
                id,
              ];
            })}
          />
        )}
      </Card>
      <Card id="posts" name="Posts" total={Object.values(posts).reduce((a, b) => a + b, 0)}>
        <Rows
          rows={statuses.map((s) => [
            <span className="badge tone" data-status={s}>
              {title(s)}
            </span>,
            posts[s],
            s,
          ])}
        />
      </Card>
    </div>
  );
}
