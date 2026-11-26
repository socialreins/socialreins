"use client";

import { useEffect, useState } from "react";
import { listPageReports, takeDownPage, type PageReport } from "@/lib/admin";
import { isFailure, linkButton, problemText, Status, useAction } from "@/components/team-ui";
import { day, Forbidden, td, th } from "@/components/admin";

// Reports of public pages, newest first. A page with several reports shows the same state on each row.
export function AdminReports() {
  const [rows, setRows] = useState<PageReport[] | null | "forbidden" | "error">(null);
  const { run, busy, problem, done } = useAction();

  useEffect(() => {
    listPageReports().then((r) => setRows(r === "forbidden" ? r : isFailure(r) ? "error" : r.reports));
  }, []);

  if (rows === "forbidden") return <Forbidden />;
  if (rows === "error")
    return (
      <p role="alert" className="waitlist-error">
        The reports couldn&apos;t be loaded. {problemText("error")}
      </p>
    );
  if (rows === null)
    return (
      <p role="status" className="text-ink-soft">
        Loading the reports...
      </p>
    );
  if (rows.length === 0) return <p className="text-ink-soft">No page has been reported.</p>;

  function toggle(code: string, down: boolean) {
    run(`down-${code}`, () => takeDownPage(code, down), () => {
      setRows((all) => (Array.isArray(all) ? all.map((r) => (r.code === code ? { ...r, taken_down: down } : r)) : all));
      return down ? `The page ${code} is down.` : `The page ${code} is back.`;
    });
  }

  return (
    <div className="grid gap-4">
      <Status problem={problem} done={done} />
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Page", "Team", "Reason", "Message", "From", "When", "Reports", ""].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink/10 align-top last:border-0">
                <td className={td}>
                  <a href={`/p/${r.code}`} target="_blank" rel="noopener noreferrer" className={linkButton}>
                    {r.code}
                  </a>
                  {r.taken_down && <span className="ml-2 font-bold text-signal-deep">down</span>}
                </td>
                <td className={td}>{r.team}</td>
                <td className={td}>{r.reason}</td>
                <td className={`${td} max-w-xs whitespace-pre-wrap break-words`}>{r.message || <span className="text-ink-soft">None</span>}</td>
                <td className={td}>{r.contact ?? <span className="text-ink-soft">Not given</span>}</td>
                <td className={`${td} whitespace-nowrap`}>{day(r.created_at)}</td>
                <td className={td}>{r.reports}</td>
                <td className={td}>
                  <button type="button" className={linkButton} disabled={busy !== null} onClick={() => toggle(r.code, !r.taken_down)}>
                    {r.taken_down ? "Bring back" : "Take down"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
