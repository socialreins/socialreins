"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Failure } from "@/lib/auth";
import { useCurrentSet } from "@/components/app-shell";
import { TeamLink as Link } from "@/components/team-link";
import { platformName } from "@/components/platform-icons";
import { PlatformMark, postMessages } from "@/components/posts";
import { isFailure, linkButton, problemText } from "@/components/team-ui";
import { Icon } from "@/components/ui";
import { failuresCsv, MAX_FILE_BYTES, MAX_ROWS, readCsv, rowInput, templateCsv, validateRow, type BulkRow, type Problem, type Validation } from "@/lib/bulk";
import { listConnections, type Connection } from "@/lib/connections";
import { createPost, createPostGroup, isPlatform, type Platform, type Post } from "@/lib/posts";
import { listSets, type SocialSet } from "@/lib/sets";

const th = "border-b border-ink/10 px-4 py-2 font-bold";
const td = "px-4 py-2.5";

// What brain's answer says, in the words the composer uses.
const say = (code: string, detail?: string): string => {
  const known = postMessages[code as Failure];
  if (typeof known === "string") return known;
  const general = problemText(code as Failure);
  return detail || (typeof general === "string" ? general : "brain refused it.");
};
const problems = (v: Validation | Failure): string[] => {
  if (isFailure(v)) return [`It couldn't be checked: ${say(v)}`];
  if (v.ok) return [];
  const one = (p: Problem) => `${p.part ? `Thread part ${p.part}: ` : ""}${say(p.code, p.detail)}`;
  const out = [...v.problems.map(one), ...v.platforms.filter((p) => !p.ok).flatMap((p) => p.problems.map((q) => `${platformName(p.platform)}: ${one(q)}`))];
  return out.length ? out : ["brain refused it."];
};

// A row's state after brain looked at it: checked (with what is wrong) and, once scheduled, created or not.
type Check = "checking" | string[];
// "unknown": the create got no answer (a timeout or a lost connection), so the post may exist. Such a row is
// never sent again and stays out of the failures CSV, since uploading it again could post it twice.
type Result = { post: Post; count: number } | { error: string } | "unknown";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
function save(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export function BulkUpload() {
  const [setId] = useCurrentSet();
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[] | Failure | null>(null);
  useEffect(() => {
    listSets().then(setSets);
    listConnections().then(setAccounts);
  }, []);
  const failed = [sets, accounts].find(isFailure);
  if (failed)
    return (
      <p role="alert" className="waitlist-error">
        The set couldn&apos;t be loaded. {problemText(failed, postMessages)}
      </p>
    );
  // "" until the top bar picks the Default set.
  if (!setId || !Array.isArray(sets) || !Array.isArray(accounts)) return <p className="text-ink-soft">Loading...</p>;
  const set = sets.find((s) => s.id === setId);
  const available = [...new Set(accounts.filter((a) => a.set_ids.includes(setId)).map((a) => a.provider))].filter(isPlatform);
  // Keyed so a set switch starts over: the rows were checked against the other set's accounts.
  return <Bulk key={setId} setId={setId} setName={set?.name ?? "this set"} available={available} />;
}

function Bulk({ setId, setName, available }: { setId: string; setName: string; available: Platform[] }) {
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [checks, setChecks] = useState<Record<number, Check>>({});
  const [results, setResults] = useState<Record<number, Result>>({});
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  // brain's rate limit paused the checks; the rows not yet checked wait for Retry checks.
  const [paused, setPaused] = useState(false);
  // A new file makes the checks still running for the old one stale.
  const generation = useRef(0);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const gen = ++generation.current;
    setRows(null);
    setChecks({});
    setResults({});
    setStopped(false);
    setPaused(false);
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setFileError("The file is over 1 MB. Split it into smaller files.");
    const read = readCsv(await file.text(), available);
    if (gen !== generation.current) return;
    if (typeof read === "string") return setFileError(read);
    setRows(read);
    await check(read.filter((r) => r.errors.length === 0), gen);
  }

  // brain checks each row, three at a time. A rate limit pauses them all: its row and the ones not yet
  // sent go back to unchecked, for Retry checks.
  async function check(todo: BulkRow[], gen = generation.current) {
    setPaused(false);
    setChecks((c) => ({ ...c, ...Object.fromEntries(todo.map((r) => [r.n, "checking"])) }));
    let next = 0;
    let limited = false;
    const worker = async () => {
      while (next < todo.length && !limited) {
        const row = todo[next++]!;
        const v = await validateRow(row, setId);
        if (gen !== generation.current) return;
        if (v === "rate_limited") limited = true;
        setChecks((c) => {
          if (v !== "rate_limited") return { ...c, [row.n]: problems(v) };
          const rest = { ...c };
          delete rest[row.n];
          return rest;
        });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (gen !== generation.current || !limited) return;
    setPaused(true);
    const left = new Set(todo.slice(next).map((r) => r.n));
    setChecks((c) => Object.fromEntries(Object.entries(c).filter(([n]) => !left.has(Number(n)))));
  }

  const errorsOf = (r: BulkRow) => {
    const c = checks[r.n];
    const res = results[r.n];
    return [...r.errors, ...(Array.isArray(c) ? c : []), ...(typeof res === "object" && "error" in res ? [res.error] : [])];
  };
  const list = rows ?? [];
  const checking = list.filter((r) => checks[r.n] === "checking").length;
  const checked = list.filter((r) => Array.isArray(checks[r.n])).length;
  const ready = list.filter((r) => errorsOf(r).length === 0 && Array.isArray(checks[r.n]) && !results[r.n]);
  const bad = list.filter((r) => errorsOf(r).length > 0);
  const made = list.filter((r) => typeof results[r.n] === "object" && "post" in (results[r.n] as object));
  const unknown = list.filter((r) => results[r.n] === "unknown").length;
  const unchecked = list.filter((r) => r.errors.length === 0 && checks[r.n] === undefined);

  // Creates the ready rows one after another; brain's rate limit stops the run, and Continue picks it up.
  async function schedule() {
    setRunning(true);
    setStopped(false);
    for (const row of ready) {
      const input = rowInput(row, setId);
      const r = "one" in input ? await createPost(input.one) : await createPostGroup(input.group);
      if (r === "rate_limited") {
        setStopped(true);
        break;
      }
      const result: Result =
        r === "timeout" || r === "error" ? "unknown" : isFailure(r) ? { error: say(r) } : "posts" in r ? { post: r.posts[0]!, count: r.posts.length } : { post: r, count: 1 };
      setResults((old) => ({ ...old, [row.n]: result }));
    }
    setRunning(false);
  }

  return (
    <div className="grid min-w-0 gap-6">
      <section aria-labelledby="bulk-file" className="card grid gap-4 p-5">
        <h2 id="bulk-file" className="text-lg font-bold">
          Upload a CSV of posts
        </h2>
        <p className="max-w-prose text-ink-soft">
          Posts go to <strong className="text-ink">{setName}</strong>, the set picked in the top bar. Each row is checked before anything is created; only the rows
          without problems are scheduled.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="grid gap-1 font-bold">
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={running} className="field font-normal" />
          </label>
          <button type="button" className="btn btn-secondary self-end" onClick={() => save("socialreins-posts-template.csv", templateCsv())}>
            <Icon name="download" className="size-4" />
            Download template
          </button>
        </div>
        {fileError && (
          <p role="alert" className="waitlist-error">
            {fileError}
          </p>
        )}
        <details className="text-sm" open={!rows}>
          <summary className="cursor-pointer font-bold">The format</summary>
          <div className="mt-3 grid gap-3">
            <p className="max-w-prose text-ink-soft">
              The first line names the columns, in any order. Up to {MAX_ROWS} posts and 1 MB a file. Put a value with a comma, a quote or a line break in double
              quotes, and write a quote inside as two. A value starting with &apos; and then = @ + or - loses that &apos;, which the download of rows with problems adds
              so spreadsheets don&apos;t run it as a formula.
            </p>
            <dl className="grid max-w-prose gap-2 sm:grid-cols-[9rem_1fr]">
              <dt className="font-mono font-bold">text</dt>
              <dd className="text-ink-soft">Required. The post. On YouTube the first line is the title.</dd>
              <dt className="font-mono font-bold">networks</dt>
              <dd className="text-ink-soft">
                Optional. Network names separated by spaces or commas, such as <code>bluesky linkedin</code>. Empty means every network the set has
                {available.length ? ` (${available.filter((p) => p !== "tiktok" && p !== "pinterest").map(platformName).join(", ")})` : ""}, leaving out Pinterest unless a row names it, and Instagram and YouTube on a row without
                media.
              </dd>
              <dt className="font-mono font-bold">media</dt>
              <dd className="text-ink-soft">Optional. Public https links to images or a video, separated by spaces. YouTube needs a video, and Pinterest an image or a video and a default board on the account.</dd>
              <dt className="font-mono font-bold">time</dt>
              <dd className="text-ink-soft">
                Optional. A time in your zone like <code>2026-11-25 09:30</code>, or <code>queue</code> for the set&apos;s next free queue time. Empty saves a draft.
              </dd>
              <dt className="font-mono font-bold">first_comment</dt>
              <dd className="text-ink-soft">Optional. Posted right after the post on Facebook, Instagram, LinkedIn and YouTube.</dd>
            </dl>
            <p className="max-w-prose text-ink-soft">
              TikTok isn&apos;t offered here: it needs a privacy and disclosure choice for every post, which a spreadsheet can&apos;t make honestly. Post to TikTok from
              the composer.
            </p>
          </div>
        </details>
      </section>

      {rows && (
        <section aria-labelledby="bulk-preview" className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="bulk-preview" className="text-lg font-bold">
              Preview
            </h2>
            <p role="status" className="text-sm text-ink-soft">
              {checking > 0
                ? `Checking ${checked} of ${checked + checking} rows...`
                : `${rows.length} ${rows.length === 1 ? "row" : "rows"}: ${made.length ? `${made.length} created, ` : ""}${unknown ? `${unknown} unknown, ` : ""}${ready.length} ready, ${bad.length} with problems.`}
            </p>
          </div>
          {paused && checking === 0 && (
            <div role="alert" className="flex flex-wrap items-center gap-3">
              <p className="waitlist-error">
                Paused by a rate limit: {unchecked.length} {unchecked.length === 1 ? "row isn't" : "rows aren't"} checked yet. Wait a minute, then retry.
              </p>
              <button type="button" className="btn btn-secondary" disabled={running} onClick={() => check(unchecked)}>
                Retry checks
              </button>
            </div>
          )}
          {stopped && (
            <p role="alert" className="waitlist-error">
              brain&apos;s rate limit stopped the run after {made.length} {made.length === 1 ? "post" : "posts"}. Wait a minute, then continue with the{" "}
              {ready.length} left.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={running || checking > 0 || ready.length === 0} onClick={schedule}>
              <Icon name="clock" className="size-4" />
              {running ? "Scheduling..." : stopped ? `Continue with ${ready.length} ${ready.length === 1 ? "post" : "posts"}` : `Schedule ${ready.length} ${ready.length === 1 ? "post" : "posts"}`}
            </button>
            {bad.length > 0 && checking === 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => save("socialreins-posts-failed.csv", failuresCsv(bad.map((r) => ({ cells: r.cells, error: errorsOf(r).join(" ") }))))}
              >
                <Icon name="download" className="size-4" />
                Download {bad.length} {bad.length === 1 ? "row" : "rows"} with problems
              </button>
            )}
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <caption className="sr-only">Posts in the file, in order</caption>
              <thead>
                <tr className="text-left text-xs text-ink-soft">
                  {["Row", "Text", "Networks", "Media", "Time", "Status"].map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.n} row={r} check={checks[r.n]} unchecked={unchecked.includes(r)} result={results[r.n]} errors={errorsOf(r)} waiting={stopped && ready.includes(r)} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ row, check, unchecked, result, errors, waiting }: { row: BulkRow; check?: Check; unchecked: boolean; result?: Result; errors: string[]; waiting: boolean }) {
  const created = typeof result === "object" && "post" in result ? result : null;
  const at = created?.post.scheduled_at ?? (row.when?.kind === "at" ? row.when.iso : null);
  return (
    <tr className="border-t border-ink/10 align-top first:border-t-0">
      <th scope="row" className={`${td} text-left font-bold`}>
        {row.n}
      </th>
      <td className={`${td} max-w-72`}>
        <p className="line-clamp-3 whitespace-pre-wrap break-words">{row.text || <span className="text-ink-soft">(none)</span>}</p>
        {row.first_comment && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">First comment: {row.first_comment}</p>}
      </td>
      <td className={td}>
        <span className="flex flex-wrap gap-1.5">
          {row.networks.map((p) => (
            <PlatformMark key={p} platform={p} className="size-4" />
          ))}
        </span>
      </td>
      <td className={`${td} whitespace-nowrap`}>{row.media.length ? `${row.media.length} ${row.media.length === 1 ? "link" : "links"}` : "None"}</td>
      <td className={`${td} whitespace-nowrap`}>
        {at ? <time dateTime={at}>{when(at)}</time> : row.when?.kind === "queue" ? "Next queue time" : row.when ? "Draft" : row.cells.time}
      </td>
      <td className={`${td} min-w-56`}>
        {errors.length > 0 ? (
          <>
            <span className="badge tone" data-status="failed">
              {result ? "Not created" : "Problem"}
            </span>
            <ul className="mt-1 grid list-disc gap-1 pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </>
        ) : created ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="badge tone" data-status={created.post.status}>
              {created.post.status === "scheduled" ? "Scheduled" : "Draft saved"}
              {created.count > 1 ? `, ${created.count} posts` : ""}
            </span>
            <Link href={`/posts/${created.post.id}`} className={linkButton}>
              Open post {row.n}
            </Link>
          </span>
        ) : result === "unknown" ? (
          <>
            <span className="badge tone" data-status="queued">
              Unknown
            </span>
            <p className="mt-1">
              It may have been created: check <Link href="/posts" className={linkButton}>Posts</Link> before retrying.
            </p>
          </>
        ) : unchecked ? (
          <span className="badge">Not checked yet</span>
        ) : check === "checking" ? (
          <span className="badge tone" data-status="queued">
            Checking...
          </span>
        ) : waiting ? (
          <span className="badge">Not created yet</span>
        ) : (
          <span className="badge tone" data-status="verified">
            Ready
          </span>
        )}
      </td>
    </tr>
  );
}
