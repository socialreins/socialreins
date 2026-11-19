// The calendar's zone is the browser's; pin it to one with a DST change (Node rereads TZ when it is set).
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import { editInput, moveToDay, type Post } from "@/lib/posts";

describe("moveToDay", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("keeps the local time of day and changes the date", () => {
    const when = new Date("2026-10-21T13:30:00Z"); // 9:30 AM EDT
    const to = moveToDay(when, new Date(2026, 9, 23), now)!;
    expect(to.toISOString()).toBe("2026-10-23T13:30:00.000Z");
    expect([to.getHours(), to.getMinutes()]).toEqual([9, 30]);
  });

  it("keeps the wall clock time across the end of DST", () => {
    const when = new Date("2026-10-30T13:30:00Z"); // Friday 9:30 AM EDT
    const to = moveToDay(when, new Date(2026, 10, 2), now)!; // Monday after the 1 November change
    expect(to.toISOString()).toBe("2026-11-02T14:30:00.000Z"); // 9:30 AM EST
  });

  it("moves to a DST change day itself", () => {
    const when = new Date("2026-10-30T13:30:00Z");
    expect(moveToDay(when, new Date(2026, 10, 1), now)!.toISOString()).toBe("2026-11-01T14:30:00.000Z");
  });

  it("refuses a past day, and a past time on today", () => {
    const when = new Date("2026-10-21T13:30:00Z");
    expect(moveToDay(when, new Date(2026, 9, 19), now)).toBeNull();
    // 20 October 9:30 AM EDT is 13:30Z, after now at 12:00Z; 7:00 AM EDT is before it.
    expect(moveToDay(when, new Date(2026, 9, 20), now)).not.toBeNull();
    expect(moveToDay(new Date("2026-10-21T11:00:00Z"), new Date(2026, 9, 20), now)).toBeNull();
  });
});

describe("editInput", () => {
  const post = {
    id: "p1",
    social_set_id: "s1",
    platform: "tiktok",
    body: "Hi",
    media: ["https://x.test/v.mp4"],
    thread: [{ body: "no", media: [] }],
    first_comment: null,
    cover: null,
    tiktok: { privacy_level: "SELF_ONLY", allow_comment: true, allow_duet: false, allow_stitch: false, commercial_content: false, your_brand: false, branded_content: false, ai_generated: false },
    youtube: null,
  } as unknown as Post;

  it("sends the post back as it is with the new time", () => {
    expect(editInput(post, "2026-11-21T14:30:00.000Z")).toEqual({
      social_set_id: "s1",
      platform: "tiktok",
      body: "Hi",
      media: ["https://x.test/v.mp4"],
      thread: [],
      first_comment: undefined,
      cover: undefined,
      tiktok: post.tiktok,
      youtube: undefined,
      scheduled_at: "2026-11-21T14:30:00.000Z",
    });
  });

  it("keeps YouTube private when no privacy was saved", () => {
    expect(editInput({ ...post, platform: "youtube", tiktok: null }, null).youtube).toEqual({ privacy: "private" });
  });
});
