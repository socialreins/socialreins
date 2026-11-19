import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionsSummary,
  automationInput,
  changeTrigger,
  conditionNotes,
  draftOf,
  postLink,
  postUri,
  reason,
  sample,
  switchAutomation,
  templateLength,
  templates,
  TRIGGERS,
  triggers,
  type Automation,
  type Draft,
} from "@/lib/automations";
import { apiUrl } from "@/lib/waitlist";

const accounts = [{ provider: "bluesky", handle: "alice.bsky.social", external_id: "did:plc:alice" }];

afterEach(() => vi.unstubAllGlobals());

describe("post links", () => {
  it("turns Bluesky post links of connected accounts into at:// URIs", () => {
    expect(postUri("https://bsky.app/profile/alice.bsky.social/post/3abc", accounts)).toBe("at://did:plc:alice/app.bsky.feed.post/3abc");
    expect(postUri(" https://bsky.app/profile/Alice.bsky.social/post/3abc/?ref=x ", accounts)).toBe("at://did:plc:alice/app.bsky.feed.post/3abc");
    expect(postUri("https://bsky.app/profile/did:plc:bob/post/3abc", accounts)).toBe("at://did:plc:bob/app.bsky.feed.post/3abc");
    expect(postUri("at://did:plc:bob/app.bsky.feed.post/3abc", accounts)).toBe("at://did:plc:bob/app.bsky.feed.post/3abc");
  });

  it("refuses anything else", () => {
    expect(postUri("https://bsky.app/profile/stranger.bsky.social/post/3abc", accounts)).toBeNull();
    expect(postUri("https://bsky.app/profile/alice.bsky.social", accounts)).toBeNull();
    expect(postUri("http://bsky.app/profile/did:plc:bob/post/3abc", accounts)).toBeNull();
    expect(postUri("https://evil.com/profile/did:plc:bob/post/3abc", accounts)).toBeNull();
    expect(postUri("at://bob.bsky.social/app.bsky.feed.post/3abc", accounts)).toBeNull();
    expect(postUri("at://did:plc:bob/app.bsky.feed.like/3abc", accounts)).toBeNull();
  });

  it("links an at:// URI back to bsky.app", () => {
    expect(postLink("at://did:plc:bob/app.bsky.feed.post/3abc")).toBe("https://bsky.app/profile/did:plc:bob/post/3abc");
  });
});

describe("texts", () => {
  it("counts {name} at its longest and previews it", () => {
    expect(templateLength("Hi {name}")).toBe(3 + 64);
    expect(sample("Hi {name}, {name}")).toBe("Hi Sam, Sam");
    expect(templateLength("See {page}")).toBe(4 + 100);
    expect(sample("See {page}")).toBe("See (link to the public page)");
  });

  it("summarizes conditions, actions and reasons in plain words", () => {
    expect(conditionNotes({ account_ids: [], keywords: ["price"] })).toEqual([]);
    expect(conditionNotes({ account_ids: [], post_remote_ids: ["a", "b"], first_per_author: true })).toEqual(["On 2 posts", "First comment per person"]);
    expect(conditionNotes({ account_ids: [], first_message: true })).toEqual(["First message only"]);
    const dm = { type: "send_dm" as const, text: "x" };
    const reply = { type: "reply_publicly" as const, text: "y" };
    expect(actionsSummary({ actions: [dm], fallback_public_reply: null })).toBe("Sends a DM");
    expect(actionsSummary({ actions: [dm], fallback_public_reply: "z" })).toBe("Sends a DM, or replies publicly if it can't");
    expect(actionsSummary({ actions: [dm, reply], fallback_public_reply: "z" })).toBe("Sends a DM and replies publicly");
    expect(actionsSummary({ actions: [reply], fallback_public_reply: null })).toBe("Replies publicly");
    expect(reason("dm_not_allowed")).toBe("They only accept DMs from people they follow");
    expect(reason("already_replied")).toBe("This comment already got its one private reply");
    expect(reason("outside_window")).toContain("within 24 hours");
    expect(reason("daily_cap")).toBe("The team reached 500 automation runs today");
    expect(reason("something_new")).toBe("something new");
    expect(reason(null)).toBeNull();
  });
});

// Every field set, so a builder that forgets its trigger's limits would send too much.
const full: Draft = {
  name: "Everything",
  trigger: "comment_received",
  keywords: ["price"],
  specific: true,
  posts: "at://did:plc:bob/app.bsky.feed.post/3abc",
  firstPerAuthor: true,
  firstMessage: true,
  dm: "Hi {name}, see {page}",
  publicReply: "Sent you a DM",
  fallbackOn: true,
  fallback: "Check your DMs",
  active: true,
};
const scope = { social_set_id: null, account_ids: ["c1"] };
const uris = ["at://did:plc:bob/app.bsky.feed.post/3abc"];

describe("triggers", () => {
  it("mirrors what brain's validate takes for each trigger", () => {
    const row = (t: keyof typeof triggers) => {
      const c = triggers[t];
      return [c.keywords, c.posts, c.firstPerAuthor, c.firstMessage, c.publicReply];
    };
    expect(TRIGGERS).toEqual(["comment_received", "dm_received", "mention_received", "new_follower", "story_reply"]);
    expect(row("comment_received")).toEqual([true, true, true, false, true]);
    expect(row("dm_received")).toEqual([true, false, false, true, false]);
    expect(row("mention_received")).toEqual([true, false, false, false, true]);
    expect(row("new_follower")).toEqual([false, false, false, false, false]);
    expect(row("story_reply")).toEqual([true, false, false, false, false]);
    expect(triggers.new_follower.note).toContain("Bluesky only");
    expect(triggers.story_reply.note).toContain("Instagram only");
  });

  it("sends only the conditions and actions the trigger takes", () => {
    const both = [
      { type: "send_dm", text: "Hi {name}, see {page}" },
      { type: "reply_publicly", text: "Sent you a DM" },
    ];
    expect(automationInput(full, scope, uris)).toEqual({
      name: "Everything",
      trigger: "comment_received",
      conditions: { ...scope, keywords: ["price"], post_remote_ids: uris, first_per_author: true },
      actions: both,
      active: true,
      fallback_public_reply: "Check your DMs",
    });
    expect(automationInput({ ...full, trigger: "mention_received" }, scope, uris)).toMatchObject({
      conditions: { ...scope, keywords: ["price"] },
      actions: both,
      fallback_public_reply: "Check your DMs",
    });
    const dmOnly = [{ type: "send_dm", text: "Hi {name}, see {page}" }];
    const dm = automationInput({ ...full, trigger: "dm_received" }, scope, uris);
    expect(dm.conditions).toEqual({ ...scope, keywords: ["price"], first_message: true });
    expect(dm).toMatchObject({ actions: dmOnly, fallback_public_reply: null });
    const follower = automationInput({ ...full, trigger: "new_follower" }, scope, uris);
    expect(follower.conditions).toEqual(scope);
    expect(follower).toMatchObject({ actions: dmOnly, fallback_public_reply: null });
    const story = automationInput({ ...full, trigger: "story_reply" }, scope, uris);
    expect(story.conditions).toEqual({ ...scope, keywords: ["price"] });
    expect(story).toMatchObject({ actions: dmOnly, fallback_public_reply: null });
  });

  it("leaves out an empty text, and a fallback with no DM", () => {
    const reply = automationInput({ ...full, dm: " " }, scope, uris);
    expect(reply.actions).toEqual([{ type: "reply_publicly", text: "Sent you a DM" }]);
    expect(reply.fallback_public_reply).toBeNull();
    expect(automationInput({ ...full, fallbackOn: false }, scope, uris).fallback_public_reply).toBeNull();
    expect(automationInput({ ...full, specific: false }, scope, uris).conditions.post_remote_ids).toEqual([]);
  });

  it("drops what a new trigger does not take and names it", () => {
    const toDm = changeTrigger(full, "dm_received");
    expect(toDm.dropped).toEqual(["specific posts", "first comment per person", "public reply", "fallback reply", "{page} in the DM"]);
    expect(toDm.draft).toMatchObject({ trigger: "dm_received", keywords: ["price"], firstMessage: true, specific: false, posts: "", publicReply: "", fallbackOn: false, dm: "Hi {name}, see" });
    const toFollower = changeTrigger(full, "new_follower");
    expect(toFollower.dropped).toContain("keywords");
    expect(toFollower.dropped).toContain("first message only");
    expect(toFollower.draft.keywords).toEqual([]);
    expect(changeTrigger({ ...full, firstMessage: false }, "comment_received").dropped).toEqual([]);
    expect(changeTrigger(toDm.draft, "mention_received")).toMatchObject({ dropped: ["first message only"], draft: { keywords: ["price"] } });
  });

  it("opens each template on its trigger, and a saved automation with a reply and a fallback keeps both", () => {
    expect(templates.map((t) => [t.id, t.draft.trigger])).toEqual([
      ["comment-to-dm", "comment_received"],
      ["dm-keyword", "dm_received"],
      ["welcome", "dm_received"],
      ["new-follower", "new_follower"],
      ["mention-reply", "mention_received"],
      ["story-reply", "story_reply"],
    ]);
    expect(draftOf(undefined, "welcome")).toMatchObject({ trigger: "dm_received", firstMessage: true, active: true });
    expect(draftOf(undefined, "nope")).toMatchObject({ trigger: "comment_received", name: "" });
    const saved = {
      name: "Both",
      trigger: "comment_received",
      active: false,
      conditions: { social_set_id: null, account_ids: [], post_remote_ids: uris, keywords: ["k"], first_per_author: false },
      actions: [
        { type: "send_dm", text: "dm" },
        { type: "reply_publicly", text: "reply" },
      ],
      fallback_public_reply: "fallback",
    } as unknown as Automation;
    const again = automationInput(draftOf(saved), { social_set_id: null, account_ids: [] }, uris);
    expect(again).toEqual({ name: "Both", trigger: "comment_received", active: false, conditions: saved.conditions, actions: saved.actions, fallback_public_reply: "fallback" });
  });
});

it("switches with enable and disable", async () => {
  const fetch = vi.fn(async () => Response.json({ id: "a1", active: false }));
  vi.stubGlobal("fetch", fetch);
  await switchAutomation("a1", false);
  expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(`${apiUrl}/v1/automations/a1/disable`);
  expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ method: "POST", credentials: "include" });
});
