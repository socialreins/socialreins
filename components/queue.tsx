"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Failure } from "@/lib/auth";
import { useCurrentSet } from "@/components/app-shell";
import { listSets, type SocialSet } from "@/lib/sets";
import {
  addSlots,
  DAYS,
  EVERY_DAY,
  getQueue,
  hasSlot,
  MAX_SLOTS,
  removeSlot,
  sameSlots,
  saveQueue,
  slotTime,
  slotTimes,
  startZone,
  timeZones,
  WEEKDAYS,
  type Queue,
  type Slot,
} from "@/lib/queue";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

export const queueMessages: Partial<Record<Failure, ReactNode>> = {
  invalid_time_zone: "That time zone isn't one brain knows. Pick another from the list.",
  invalid_slot: "One of the times isn't valid. Each needs a day and a time like 09:00.",
  duplicate_slot: "The same day and time is in the queue twice. Remove one and save again.",
  too_many_slots: `A queue holds at most ${MAX_SLOTS} times a week. Remove some and save again.`,
  not_found: "This set no longer exists. Pick another one in the top bar.",
};

export function QueuePage() {
  const [setId] = useCurrentSet();
  const [sets, setSets] = useState<SocialSet[]>([]);
  useEffect(() => {
    listSets().then((r) => Array.isArray(r) && setSets(r));
  }, []);
  const name = sets.find((s) => s.id === setId)?.name;
  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-ink-soft">
        Add to queue in the composer schedules a post at the next free time below{name ? `, for ${name}` : ""}.
      </p>
      {/* "" until the top bar picks the Default set; keyed so a set switch starts from that set's saved queue. */}
      {setId ? <QueueEditor key={setId} setId={setId} /> : <p className="text-ink-soft">Loading the queue...</p>}
    </div>
  );
}

function QueueEditor({ setId }: { setId: string }) {
  const [saved, setSaved] = useState<Queue | Failure | null>(null);
  const [zone, setZone] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>(WEEKDAYS);
  const [local, setLocal] = useState<string | null>(null);
  const { busy, problem, done, run } = useAction();

  function load(q: Queue | Failure) {
    setSaved(q);
    if (isFailure(q)) return;
    setZone(startZone(q, Intl.DateTimeFormat().resolvedOptions().timeZone));
    setSlots(q.slots);
  }
  useEffect(() => {
    getQueue(setId).then(load);
  }, [setId]);

  if (saved === null) return <p className="text-ink-soft">Loading the queue...</p>;
  if (isFailure(saved))
    return (
      <p role="alert" className="waitlist-error">
        The queue couldn&apos;t be loaded. {problemText(saved, queueMessages)}
      </p>
    );

  const dirty = zone !== saved.time_zone || !sameSlots(slots, saved.slots);
  const times = slotTimes(slots);

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^\d\d:\d\d$/.test(time)) return setLocal("Pick a time to add.");
    if (days.length === 0) return setLocal("Pick at least one day.");
    const next = addSlots(slots, time, days);
    if (next.length > MAX_SLOTS) return setLocal(queueMessages.too_many_slots as string);
    setLocal(null);
    setSlots(next);
  }

  function onSave() {
    setLocal(null);
    run("save", async () => {
      const r = await saveQueue(setId, { time_zone: zone, slots });
      // Read it back for `next`, which follows the new slots.
      return isFailure(r) ? r : getQueue(setId);
    }, (q) => {
      load(q);
      return "Queue saved.";
    });
  }

  const toggle = (d: number) => setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]));
  const preset = (label: string, list: number[]) => (
    <button type="button" className="btn btn-quiet btn-sm" aria-pressed={list.length === days.length && list.every((d) => days.includes(d))} onClick={() => setDays(list)}>
      {label}
    </button>
  );

  return (
    <>
      <section aria-labelledby="queue-times" className="card grid min-w-0 gap-5 p-5">
        <div className="grid gap-0.5">
          <h2 id="queue-times" className="text-base font-semibold">
            Weekly times
          </h2>
          <p className="hint">Posts go out at these times each week, in the time zone below.</p>
        </div>
        <div className="grid gap-1.5 sm:max-w-sm">
          <label htmlFor="queue-zone" className="label">
            Time zone
          </label>
          <select id="queue-zone" className="field" value={zone} onChange={(e) => setZone(e.target.value)}>
            {timeZones(zone).map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        {times.length === 0 ? (
          <p className="rounded-md bg-ink/[0.03] p-4 text-sm text-ink-soft">No times yet. Add one below, then save.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <caption className="sr-only">Queue times by day</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-14 pb-2 text-left text-xs font-bold text-ink-soft sm:w-20">
                    Time
                  </th>
                  {DAYS.map((d) => (
                    <th key={d.weekday} scope="col" className="pb-2 text-center text-xs font-bold text-ink-soft">
                      <abbr title={d.name} className="no-underline">
                        {d.short}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((t) => (
                  <tr key={t} className="border-t border-[var(--line)]">
                    <th scope="row" className="py-1.5 text-left font-semibold tabular-nums">
                      {t}
                    </th>
                    {DAYS.map((d) => (
                      <td key={d.weekday} className="py-1.5 text-center">
                        {hasSlot(slots, d.weekday, t) && (
                          <button
                            type="button"
                            className="group inline-flex h-7 items-center justify-center gap-1 rounded-md bg-signal/12 px-1.5 text-xs font-bold text-signal-deep tabular-nums hover:bg-danger/12 hover:text-danger sm:px-2"
                            aria-label={`Remove ${d.name} at ${t}`}
                            title={`Remove ${d.name} at ${t}`}
                            onClick={() => setSlots((s) => removeSlot(s, { weekday: d.weekday, time: t }))}
                          >
                            <span className="hidden md:inline">{t}</span>
                            <Icon name="close" className="size-3.5" />
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={onAdd} className="grid gap-3 rounded-md border border-[var(--line)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="queue-time" className="label">
                Time
              </label>
              <input id="queue-time" type="time" required className="field w-auto" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {preset("Weekdays", WEEKDAYS)}
              {preset("Every day", EVERY_DAY)}
            </div>
          </div>
          <fieldset>
            <legend className="label mb-1.5">Days</legend>
            <ul className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <li key={d.weekday}>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ring-1 ring-[var(--line)] hover:ring-[var(--edge)] has-checked:bg-ink/[0.04] has-checked:ring-[var(--color-ink)]/40">
                    <input type="checkbox" className="size-3.5 accent-[var(--color-signal-deep)]" checked={days.includes(d.weekday)} onChange={() => toggle(d.weekday)} aria-label={d.name} />
                    <span aria-hidden="true">{d.short}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div>
            <button type="submit" className="btn btn-secondary">
              <Icon name="plus" className="size-4" />
              Add time
            </button>
          </div>
        </form>
        {local && (
          <p role="alert" className="waitlist-error">
            {local}
          </p>
        )}
        <Status problem={problem} done={done} overrides={queueMessages} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={`btn ${dirty ? "btn-primary" : "btn-secondary"}`} disabled={busy !== null} onClick={onSave}>
            {busy === "save" ? "Saving..." : "Save queue"}
          </button>
          {dirty && <p className="hint">Unsaved changes.</p>}
        </div>
      </section>
      <section aria-labelledby="queue-next" className="card grid min-w-0 gap-3 p-5">
        <div className="grid gap-0.5">
          <h2 id="queue-next" className="text-base font-semibold">
            Next free slots
          </h2>
          <p className="hint">In {saved.time_zone.replaceAll("_", " ")}. A time already taken by a scheduled post of this set is skipped.</p>
        </div>
        {saved.next.length === 0 ? (
          <p className="text-sm text-ink-soft">No free slots: the saved queue has no times.</p>
        ) : (
          <ol className="gap-x-6 text-sm tabular-nums sm:columns-2">
            {saved.next.map((iso) => (
              <li key={iso} className="flex items-center gap-2 py-0.5">
                <Icon name="clock" className="size-4 text-ink-soft" />
                <time dateTime={iso}>{slotTime(iso, saved.time_zone)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
