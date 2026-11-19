"use client";

import type { Repeat, RepeatForm } from "@/lib/posts";

const units: Repeat["every"][] = ["day", "week", "month"];

// The Repeat control of the editor's schedule row: how often, and when it ends. `onCommit` fires once a
// choice is complete (a select changed, a number or date box left), for a saved post that saves each change.
export function RepeatControl({ value, disabled, onChange, onCommit }: { value: RepeatForm; disabled?: boolean; onChange: (f: RepeatForm) => void; onCommit?: (f: RepeatForm) => void }) {
  // "On a date" waits for its date before it is saved.
  const commit = (f: RepeatForm) => !(f.ends === "date" && !f.until) && onCommit?.(f);
  const pick = (patch: Partial<RepeatForm>) => {
    const f = { ...value, ...patch };
    onChange(f);
    commit(f);
  };
  const type = (patch: Partial<RepeatForm>) => onChange({ ...value, ...patch });
  const small = "field w-auto py-1 text-sm";
  return (
    <>
      <label htmlFor="post-repeat" className="text-xs font-bold whitespace-nowrap">
        Repeat
      </label>
      <select id="post-repeat" className={small} disabled={disabled} value={value.every} onChange={(e) => pick({ every: e.target.value as RepeatForm["every"] })} aria-describedby="post-repeat-note">
        <option value="none">Does not repeat</option>
        <option value="day">Every day</option>
        <option value="week">Every week</option>
        <option value="month">Every month</option>
        <option value="custom">Custom</option>
      </select>
      {value.every === "custom" && (
        <>
          <label htmlFor="post-repeat-interval" className="text-xs whitespace-nowrap">
            every
          </label>
          <input id="post-repeat-interval" type="number" min={1} max={12} className={`${small} w-16`} disabled={disabled} value={value.interval} onChange={(e) => type({ interval: e.target.value })} onBlur={() => commit(value)} />
          <select aria-label="Repeat unit" className={small} disabled={disabled} value={value.unit} onChange={(e) => pick({ unit: e.target.value as Repeat["every"] })}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}s
              </option>
            ))}
          </select>
        </>
      )}
      {value.every !== "none" && (
        <>
          <label htmlFor="post-repeat-ends" className="text-xs font-bold whitespace-nowrap">
            Ends
          </label>
          <select id="post-repeat-ends" className={small} disabled={disabled} value={value.ends} onChange={(e) => pick({ ends: e.target.value as RepeatForm["ends"] })}>
            <option value="never">Never</option>
            <option value="count">After a number of posts</option>
            <option value="date">On a date</option>
          </select>
          {value.ends === "count" && (
            <>
              <input id="post-repeat-count" type="number" min={1} max={100} aria-label="More posts" className={`${small} w-20`} disabled={disabled} value={value.count} onChange={(e) => type({ count: e.target.value })} onBlur={() => commit(value)} />
              <span className="text-xs whitespace-nowrap">more posts</span>
            </>
          )}
          {value.ends === "date" && (
            <input type="date" aria-label="Repeat until" className={small} disabled={disabled} value={value.until} onChange={(e) => type({ until: e.target.value })} onBlur={() => commit(value)} />
          )}
        </>
      )}
    </>
  );
}
