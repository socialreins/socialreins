import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl } from "@/lib/waitlist";
import { addSlots, browserZone, getQueue, saveQueue, DAYS, EVERY_DAY, removeSlot, sameSlots, slotTime, slotTimes, sortSlots, startZone, timeZones, WEEKDAYS, zoneTag } from "@/lib/queue";

describe("queue slots", () => {
  it("sorts by time, then Monday first with Sunday last", () => {
    const slots = [
      { weekday: 0, time: "09:00" },
      { weekday: 3, time: "08:30" },
      { weekday: 1, time: "09:00" },
      { weekday: 6, time: "09:00" },
    ];
    expect(sortSlots(slots)).toEqual([
      { weekday: 3, time: "08:30" },
      { weekday: 1, time: "09:00" },
      { weekday: 6, time: "09:00" },
      { weekday: 0, time: "09:00" },
    ]);
    expect(slotTimes(slots)).toEqual(["08:30", "09:00"]);
  });

  it("maps the Mon..Sun columns to brain's weekdays, 0 being Sunday", () => {
    expect(DAYS.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(DAYS[6]).toMatchObject({ weekday: 0, name: "Sunday" });
    expect(WEEKDAYS).toEqual([1, 2, 3, 4, 5]);
    expect(EVERY_DAY).toHaveLength(7);
  });

  it("adds a time on chosen days without duplicates, and removes one", () => {
    const one = [{ weekday: 1, time: "09:00" }];
    const added = addSlots(one, "09:00", [0, 1, 2]);
    expect(added).toEqual([
      { weekday: 1, time: "09:00" },
      { weekday: 2, time: "09:00" },
      { weekday: 0, time: "09:00" },
    ]);
    expect(removeSlot(added, { weekday: 2, time: "09:00" })).toEqual([
      { weekday: 1, time: "09:00" },
      { weekday: 0, time: "09:00" },
    ]);
    expect(sameSlots(added, [...added].reverse())).toBe(true);
    expect(sameSlots(added, one)).toBe(false);
  });
});

describe("queue zones", () => {
  it("starts an unsaved UTC queue in the browser's zone and keeps a saved one", () => {
    expect(startZone({ time_zone: "UTC", slots: [], next: [] }, "Asia/Dhaka")).toBe("Asia/Dhaka");
    expect(startZone({ time_zone: "UTC", slots: [{ weekday: 1, time: "09:00" }], next: [] }, "Asia/Dhaka")).toBe("UTC");
    expect(startZone({ time_zone: "Europe/Berlin", slots: [], next: [] }, "Asia/Dhaka")).toBe("Europe/Berlin");
  });

  it("lists IANA zones with UTC and the saved one", () => {
    const zones = timeZones("Etc/GMT+5");
    expect(zones).toContain("UTC");
    expect(zones).toContain("Europe/Berlin");
    expect(zones).toContain("Etc/GMT+5");
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("formats a slot in the queue's zone", () => {
    expect(slotTime("2026-11-19T03:00:00Z", "Asia/Dhaka", "en-GB")).toBe("Thu 19 Nov, 09:00");
    expect(slotTime("2026-11-19T03:00:00Z", "UTC", "en-GB")).toBe("Thu 19 Nov, 03:00");
  });
});

describe("queue calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads and replaces a set's queue", async () => {
    const q = { time_zone: "UTC", slots: [], next: [] };
    const fetch = vi.fn(async () => Response.json(q));
    vi.stubGlobal("fetch", fetch);
    expect(await getQueue("s 1")).toEqual(q);
    await saveQueue("s1", { time_zone: "Asia/Dhaka", slots: [{ weekday: 1, time: "09:00" }] });
    const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(`${apiUrl}/v1/social-sets/s%201/queue`);
    expect(url).toBe(`${apiUrl}/v1/social-sets/s1/queue`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ time_zone: "Asia/Dhaka", slots: [{ weekday: 1, time: "09:00" }] });
  });

  it("passes brain's validation codes through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "too_many_slots" }, { status: 422 })));
    expect(await saveQueue("s1", { time_zone: "UTC", slots: [] })).toBe("too_many_slots");
  });
});

describe("zoneTag", () => {
  const d = new Date("2026-11-12T10:00:00Z");
  it("is null in the browser's zone and a short name elsewhere", () => {
    expect(zoneTag(browserZone(), d)).toBeNull();
    expect(zoneTag(browserZone() === "Asia/Dhaka" ? "UTC" : "Asia/Dhaka", d)).toMatch(/^(UTC|GMT\+6)$/);
  });
});
