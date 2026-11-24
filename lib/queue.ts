import { api } from "@/lib/auth";

// A weekly posting time: weekday 0 is Sunday, `time` is HH:MM in the queue's time zone.
export type Slot = { weekday: number; time: string };
// `next`: the next 10 slot times (ISO, UTC) with no scheduled post of the set.
export type Queue = { time_zone: string; slots: Slot[]; next: string[] };

const enc = encodeURIComponent;

export const getQueue = (setId: string) => api<Queue>(`/v1/social-sets/${enc(setId)}/queue`);
// Replaces the zone and every slot; brain answers 422 invalid_time_zone, invalid_slot, duplicate_slot or too_many_slots.
export const saveQueue = (setId: string, q: { time_zone: string; slots: Slot[] }) =>
  api<Queue>(`/v1/social-sets/${enc(setId)}/queue`, "PUT", q);

// brain's limit on slots per set.
export const MAX_SLOTS = 50;

// The grid's columns, Monday first, with brain's weekday numbers.
export const DAYS = [
  { weekday: 1, short: "Mon", name: "Monday" },
  { weekday: 2, short: "Tue", name: "Tuesday" },
  { weekday: 3, short: "Wed", name: "Wednesday" },
  { weekday: 4, short: "Thu", name: "Thursday" },
  { weekday: 5, short: "Fri", name: "Friday" },
  { weekday: 6, short: "Sat", name: "Saturday" },
  { weekday: 0, short: "Sun", name: "Sunday" },
];
export const WEEKDAYS = [1, 2, 3, 4, 5];
export const EVERY_DAY = DAYS.map((d) => d.weekday);

// Monday 0 to Sunday 6, so Sunday sorts last like the grid.
const column = (weekday: number) => (weekday + 6) % 7;

// By time, then by day from Monday.
export const sortSlots = (slots: Slot[]) =>
  [...slots].sort((a, b) => a.time.localeCompare(b.time) || column(a.weekday) - column(b.weekday));

// The grid's rows: each distinct time once, earliest first.
export const slotTimes = (slots: Slot[]) => [...new Set(slots.map((s) => s.time))].sort();

export const hasSlot = (slots: Slot[], weekday: number, time: string) => slots.some((s) => s.weekday === weekday && s.time === time);

// `time` on each of `days`, skipping the ones already there.
export const addSlots = (slots: Slot[], time: string, days: number[]) =>
  sortSlots([...slots, ...days.filter((d) => !hasSlot(slots, d, time)).map((weekday) => ({ weekday, time }))]);

export const removeSlot = (slots: Slot[], slot: Slot) => slots.filter((s) => s.weekday !== slot.weekday || s.time !== slot.time);

export const sameSlots = (a: Slot[], b: Slot[]) => a.length === b.length && a.every((s) => hasSlot(b, s.weekday, s.time));

// A queue brain has never saved is UTC with no slots: start it in the browser's zone instead.
export const startZone = (q: Queue, browser: string) => (q.time_zone === "UTC" && q.slots.length === 0 ? browser : q.time_zone);
// The set's time zone as the composer uses it: the browser's when its queue can't be read.
export async function zoneOf(setId: string) {
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const q = await getQueue(setId);
  return typeof q === "string" ? browser : startZone(q, browser);
}

// Every IANA zone the browser knows, with UTC and `extra` (the saved one) in case it is missing.
export function timeZones(extra: string) {
  const all = Intl.supportedValuesOf("timeZone");
  return [...new Set([...all, "UTC", extra])].sort();
}

// An ISO time as a day and time in `zone`, e.g. "Thu 19 Nov, 09:00" in en-GB.
export const slotTime = (iso: string, zone: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(new Date(iso));
