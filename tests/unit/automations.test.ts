import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionsSummary,
  automationInput,
  canEdit,
  changeTrigger,
  conditionNotes,
  draftOf,
  duplicateDraft,
  filterRuns,
  proportions,
  sameSteps,
  TEMPLATE_GROUPS,
  flowOutline,
  flowProblems,
  replyLimit,
  threadsProblems,
  newStep,
  payloadOk,
  postIds,
  postLink,
  postUri,
  reason,
  sample,
  slug,
  stepsBody,
  switchAutomation,
  toFlow,
  toSimple,
  uniquePayload,
  waitMinutes,
  waitParts,
  waitText,
  templateLength,
  templates,
  TRIGGERS,
  triggers,
  effectFits,
  isActivity,
  whyNot,
  type Automation,
  type Run,
  type Draft,
  type StepDraft,
  limitOf,
  timeProblems,
  whenOf,
  reasonLabel,
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

describe("saved post ids", () => {
  it("keeps the ids an automation was loaded with and reads only new lines as Bluesky links", () => {
    const loaded = ["1234567890_987654321", "at://did:plc:bob/app.bsky.graph.list/3abc", "at://did:plc:bob/app.bsky.feed.post/3xyz"];
    const lines = ["1234567890_987654321", "at://did:plc:bob/app.bsky.graph.list/3abc", "https://bsky.app/profile/did:plc:bob/post/3xyz", "https://bsky.app/profile/alice.bsky.social/post/3new", "999_888"];
    expect(postIds(lines, loaded, accounts)).toEqual([...loaded, "at://did:plc:alice/app.bsky.feed.post/3new", null]);
    expect(postIds(["1234567890_987654321"], [], accounts)).toEqual([null]);
  });
});

describe("automations from a newer brain", () => {
  const known = { trigger: "comment_received", conditions: { account_ids: [] }, actions: [{ type: "send_dm", text: "x" }] };
  it("edits only a trigger it knows with plain actions or steps it knows", () => {
    const can = (x: object) => canEdit({ ...known, ...x } as unknown as Automation);
    expect(can({})).toBe(true);
    expect(can({ steps: null })).toBe(true);
    expect(can({ trigger: "button_clicked" })).toBe(false);
    expect(can({ trigger: "button_clicked", conditions: { account_ids: [], payloads: ["yes"] } })).toBe(true);
    expect(can({ trigger: "toString" })).toBe(false);
    const steps = [{ type: "send_dm", text: "Hi", buttons: [{ label: "Yes", payload: "yes" }] }, { type: "wait", minutes: 5 }, { type: "send_dm", text: "Bye" }];
    expect(can({ actions: [], steps })).toBe(true);
    expect(can({ actions: [], steps: [{ type: "reply_publicly", text: "Hi" }] })).toBe(true);
    // Both at once, or a step with something this page would drop on save.
    expect(can({ steps })).toBe(false);
    expect(can({ actions: [], steps: [] })).toBe(false);
    expect(can({ actions: [], steps: [{ type: "send_dm" }] })).toBe(false);
    expect(can({ actions: [], steps: [{ type: "send_dm", text: "Hi", buttons: [{ id: "b1", label: "More" }] }] })).toBe(false);
    expect(can({ actions: [], steps: [{ type: "send_dm", text: "Hi", image: "x" }] })).toBe(false);
    expect(can({ actions: [], steps: [{ type: "branch", on: "x" }] })).toBe(false);
    expect(can({ actions: [], steps: [{ type: "wait", minutes: "5" }] })).toBe(false);
    expect(canEdit({ ...known, steps: [{}] } as unknown as Automation)).toBe(false);
    expect(canEdit({ ...known, actions: undefined } as unknown as Automation)).toBe(false);
    expect(canEdit({ ...known, conditions: null } as unknown as Automation)).toBe(false);
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
    expect(conditionNotes({ account_ids: [], post_remote_ids: ["a", "b"], first_per_author: true })).toEqual(["On 2 posts", "First one per person"]);
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
    expect(reason("already_tagged")).toBe("They already had this tag");
    expect(reason("tag_limit")).toContain("20 tags");
    expect(reason("no_contact")).toContain("no contact");
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
  tags: [],
  also: [],
  hasLink: "any",
  sentiment: [],
  active: true,
  flow: false,
  steps: [],
  payloads: [],
  cooldown: "",
  dailyCap: "",
  question: false,
  languages: [],
  timed: false,
  zone: "UTC",
  weekdays: [],
  fromHour: "",
  toHour: "",
};
const scope = { social_set_id: null, account_ids: ["c1"] };
const uris = ["at://did:plc:bob/app.bsky.feed.post/3abc"];

describe("limits", () => {
  it("reads a limit as a whole number in range, or none", () => {
    expect(limitOf("", 500)).toBeNull();
    expect(limitOf(" 60 ", 10080)).toBe(60);
    for (const bad of ["0", "-1", "1.5", "abc", "501"]) expect(limitOf(bad, 500)).toBeNaN();
  });

  it("sends the cool-down and the daily limit, and reads them back", () => {
    const input = automationInput({ ...full, cooldown: "60", dailyCap: "25" }, scope, uris);
    expect(input).toMatchObject({ cooldown_minutes: 60, daily_cap: 25 });
    const saved = { ...input, id: "a1", activated_at: "", created_by: null, created_at: "", updated_at: "" } as Automation;
    expect(draftOf(saved)).toMatchObject({ cooldown: "60", dailyCap: "25" });
  });

  it("never sends a wrong limit as none", () => {
    // NaN would be written as null by JSON.stringify and clear a working limit: the form stops before that.
    expect(Number.isNaN(limitOf("0", 500))).toBe(true);
    expect(JSON.stringify({ n: limitOf("0", 500) })).toBe('{"n":null}');
  });

  it("names why runs were held back", () => {
    for (const code of ["paused", "own_account", "connected_account", "cooldown", "automation_cap"]) expect(reason(code)).not.toBe(code.replaceAll("_", " "));
    expect(reasonLabel("automation_cap")).toBe("daily limit");
    expect(reasonLabel("something_new")).toBe("something new");
  });
});

describe("conditions", () => {
  it("sends question, languages and times only where they apply", () => {
    const base = { ...full, trigger: "comment_received" as const };
    const input = automationInput({ ...base, question: true, languages: ["en"], timed: true, zone: "Asia/Dhaka", weekdays: [4, 0], fromHour: "9", toHour: "17" }, scope, uris);
    expect(input.conditions).toMatchObject({ question: true, languages: ["en"], when: { zone: "Asia/Dhaka", weekdays: [0, 4], from_hour: 9, to_hour: 17 } });
    // A follow has no text to judge; its times still apply.
    const follow = automationInput({ ...base, trigger: "new_follower", question: true, languages: ["en"], timed: true, weekdays: [1] }, scope, uris);
    expect(follow.conditions).toEqual({ ...scope, when: { zone: "UTC", weekdays: [1] } });
    // Nothing named means no time limit.
    expect(automationInput({ ...base, timed: true }, scope, uris).conditions).not.toHaveProperty("when");
    expect(automationInput({ ...base, timed: false, weekdays: [1] }, scope, uris).conditions).not.toHaveProperty("when");
  });

  it("reads them back and says them in words", () => {
    const c = { account_ids: [], question: true, languages: ["bn", "en"], when: { zone: "Asia/Dhaka", weekdays: [0, 1], from_hour: 9, to_hour: 17 } };
    expect(conditionNotes(c)).toEqual(["Only questions", "In Bangla, English", "Only Mon, Tue 9:00 to 17:00 Asia/Dhaka"]);
    const back = draftOf({ conditions: c, actions: [], steps: null, trigger: "mention_received", name: "n", active: true } as unknown as Automation);
    expect(back).toMatchObject({ question: true, languages: ["bn", "en"], timed: true, zone: "Asia/Dhaka", weekdays: [0, 1], fromHour: "9", toHour: "17" });
  });

  it("drops the text conditions under a trigger with no text", () => {
    const { draft, dropped } = changeTrigger({ ...full, question: true, languages: ["en"] }, "new_follower");
    expect(draft).toMatchObject({ question: false, languages: [] });
    expect(dropped).toEqual(expect.arrayContaining(["only questions", "languages"]));
  });
});

describe("time conditions", () => {
  it("names what keeps the times from being saved", () => {
    const timed = { ...full, timed: true, zone: "Asia/Dhaka" };
    expect(timeProblems({ ...full, timed: false })).toEqual([]);
    expect(timeProblems(timed)).toEqual(["Pick the days or the hours it may run, or untick Only at certain times."]);
    expect(timeProblems({ ...timed, weekdays: [1] })).toEqual([]);
    expect(timeProblems({ ...timed, fromHour: "9" })).toEqual(["Set both the start and the end hour, or neither."]);
    expect(timeProblems({ ...timed, fromHour: "9", toHour: "9" })).toEqual(["The start and the end of the hours must differ."]);
    // 0 to 24 is the whole day, which brain takes.
    expect(timeProblems({ ...timed, fromHour: "0", toHour: "24" })).toEqual([]);
    expect(timeProblems({ ...timed, weekdays: [1], zone: "Dhaka" })[0]).toContain("is not a time zone");
    expect(whenOf({ ...timed, fromHour: "9" })).toBeUndefined();
    expect(whenOf({ ...timed, fromHour: "22", toHour: "6" })).toEqual({ zone: "Asia/Dhaka", weekdays: [], from_hour: 22, to_hour: 6 });
  });

  it("says every day when all seven are named", () => {
    expect(conditionNotes({ account_ids: [], when: { zone: "UTC", weekdays: [0, 1, 2, 3, 4, 5, 6] } })).toEqual(["Only every day UTC"]);
  });
});

describe("triggers", () => {
  it("mirrors what brain's validate takes for each trigger", () => {
    const row = (t: keyof typeof triggers) => {
      const c = triggers[t];
      return [c.keywords, c.posts, c.firstPerAuthor, c.firstMessage, c.publicReply];
    };
    expect(TRIGGERS).toEqual(["comment_received", "dm_received", "mention_received", "new_follower", "like_received", "repost_received", "story_reply", "story_mention", "button_clicked"]);
    // A like or repost names posts but has no text, no "first" and nothing to reply under.
    expect([triggers.like_received, triggers.repost_received].map((c) => [c.keywords, c.posts, c.firstPerAuthor, c.firstMessage, c.publicReply, c.text])).toEqual([[false, true, false, false, false, false], [false, true, false, false, false, false]]);
    expect(triggers.like_received.note).toContain("Bluesky only");
    expect(triggers.repost_received.networks).toEqual(["bluesky"]);
    expect(TRIGGERS.filter(isActivity)).toEqual(["like_received", "repost_received"]);
    expect(row("button_clicked")).toEqual([false, false, false, false, false]);
    expect(triggers.button_clicked.payloads).toBe(true);
    expect(triggers.button_clicked.note).toContain("Facebook and Instagram only");
    expect(row("comment_received")).toEqual([true, true, true, false, true]);
    expect(row("dm_received")).toEqual([true, false, false, true, false]);
    expect(row("mention_received")).toEqual([true, false, true, false, true]);
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
      ["button-follow-up", "button_clicked"],
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

describe("flows", () => {
  type Dm = Extract<StepDraft, { type: "send_dm" }>;
  const dm = (text: string, ...labels: string[]): Dm => ({ id: newStep("send_dm").id, type: "send_dm", text, buttons: labels.map((label) => ({ label, payload: slug(label), own: false })) });
  const wait = (amount: string, unit: "minutes" | "hours" | "days" = "minutes"): StepDraft => ({ id: newStep("wait").id, type: "wait", amount, unit });
  const texts = (steps: Parameters<typeof flowProblems>[0], trigger: Draft["trigger"] = "dm_received") => flowProblems(steps, trigger).map((p) => [p.step, p.text]);

  it("converts a wait to minutes and back", () => {
    expect(waitMinutes("90", "minutes")).toBe(90);
    expect(waitMinutes("2", "hours")).toBe(120);
    expect(waitMinutes("7", "days")).toBe(10080);
    expect(waitMinutes(" 3 ", "days")).toBe(4320);
    // brain takes 1 to 10080 whole minutes.
    for (const [amount, unit] of [["0", "minutes"], ["8", "days"], ["169", "hours"], ["10081", "minutes"], ["1.5", "hours"], ["-1", "days"], ["", "minutes"], ["soon", "hours"]] as const)
      expect(waitMinutes(amount, unit), `${amount} ${unit}`).toBeNull();
    expect(waitParts(1440)).toEqual({ amount: "1", unit: "days" });
    expect(waitParts(120)).toEqual({ amount: "2", unit: "hours" });
    expect(waitParts(90)).toEqual({ amount: "90", unit: "minutes" });
    expect(waitParts(1500)).toEqual({ amount: "25", unit: "hours" });
    for (const m of [1, 59, 60, 90, 1440, 1500, 10080]) {
      const { amount, unit } = waitParts(m);
      expect(waitMinutes(amount, unit)).toBe(m);
    }
    expect([waitText(1), waitText(45), waitText(60), waitText(2880)]).toEqual(["1 minute", "45 minutes", "1 hour", "2 days"]);
  });

  it("makes a payload from a label, unique within the flow", () => {
    expect(slug("Yes, please!")).toBe("yes-please");
    expect(slug("  Show_me the  PRICE-list ")).toBe("show_me-the-price-list");
    expect(slug("হ্যাঁ")).toBe("");
    expect(slug("a".repeat(80))).toHaveLength(64);
    expect(uniquePayload("yes", [])).toBe("yes");
    expect(uniquePayload("yes", ["yes", "no"])).toBe("yes-2");
    expect(uniquePayload("yes", ["yes", "yes-2"])).toBe("yes-3");
    const long = uniquePayload("a".repeat(64), ["a".repeat(64)]);
    expect(long).toBe(`${"a".repeat(62)}-2`);
    for (const p of [slug("Yes, please!"), long, "a_b-9"]) expect(payloadOk(p)).toBe(true);
    for (const p of ["", "Yes", "a b", "é", "a".repeat(65)]) expect(payloadOk(p)).toBe(false);
  });

  it("finds what brain would refuse in a flow", () => {
    expect(texts([dm("Hi", "Yes", "No"), wait("1", "days"), dm("Still there?")])).toEqual([]);
    expect(texts([])).toEqual([[null, "A flow needs at least one step that sends something. Add a DM, or a mail to your team or a moderation step."]]);
    expect(texts([wait("5")])).toEqual([[null, "A flow needs at least one step that sends something. Add a DM, or a mail to your team or a moderation step."]]);
    expect(texts([wait("5"), dm("Hi"), wait("5")])).toEqual([
      [null, "A flow can't start with a wait. Move a DM above it."],
      [null, "A flow can't end with a wait. Add a step after it, or remove it."],
    ]);
    expect(texts([dm("Hi"), wait("8", "days"), dm("Bye")])).toEqual([[1, "Wait between 1 minute and 7 days, as a whole number."]]);
    expect(texts(Array.from({ length: 11 }, () => dm("Hi")))).toEqual([[null, "A flow takes up to 10 steps."]]);
    expect(texts([dm(" ")])).toEqual([[0, "Write the text."]]);
    // A public reply and {page} need a comment or a mention.
    const reply = newStep("reply_publicly", "Thanks!");
    expect(texts([reply], "mention_received")).toEqual([]);
    expect(texts([dm("See {page}")], "comment_received")).toEqual([]);
    expect(texts([dm("See {page}"), reply])).toEqual([
      [0, "{page} works only for comments and mentions."],
      [1, "This trigger has nothing to reply under. Remove this step."],
    ]);
    // Lengths count {name} as 64 and the labels as numbered lines, as brain does.
    expect(texts([dm("x".repeat(1000))])).toEqual([]);
    expect(texts([dm("x".repeat(996), "Yes")])).toEqual([[0, "Too long: at most 1000 characters, the button labels included."]]);
    expect(texts([newStep("reply_publicly", "{name}".repeat(5))], "comment_received")).toEqual([[0, "Too long: at most 300 characters."]]);
    // Buttons: up to 3, a label of 1 to 20, a payload brain takes, each its own.
    expect(texts([dm("Hi", "A", "B", "C", "D")])).toEqual([[0, "A DM takes up to 3 buttons."]]);
    expect(texts([{ ...dm("Hi"), buttons: [{ label: " ", payload: "button", own: false }] }])).toEqual([[0, "Give every button a label."]]);
    expect(texts([{ ...dm("Hi"), buttons: [{ label: "x".repeat(21), payload: "x", own: false }] }])[0]![1]).toContain("too long: at most 20");
    expect(texts([{ ...dm("Hi"), buttons: [{ label: "Yes", payload: "Yes!", own: true }] }])).toEqual([[0, 'The payload "Yes!" doesn\'t work: 1 to 64 lower-case letters, digits, - and _.']]);
    expect(texts([dm("Hi", "Yes"), dm("Again", "Yes")])).toEqual([
      [0, 'Two buttons share the payload "yes". Give each its own under Advanced.'],
      [1, 'Two buttons share the payload "yes". Give each its own under Advanced.'],
    ]);
  });

  it("turns one reply into a flow and back", () => {
    const one = { ...full, fallbackOn: false, fallback: "" };
    const flow = toFlow(one);
    expect(flow.dropped).toEqual([]);
    expect(stepsBody(flow.steps)).toEqual([
      { type: "send_dm", text: "Hi {name}, see {page}" },
      { type: "reply_publicly", text: "Sent you a DM" },
    ]);
    expect(toSimple(flow.steps)).toEqual({ dm: "Hi {name}, see {page}", publicReply: "Sent you a DM", tags: [], also: [], dropped: [] });
    // The fallback has no place in a flow, a public reply none under a DM trigger, and an empty reply starts with one DM.
    expect(toFlow(full).dropped).toEqual(["the fallback reply"]);
    expect(stepsBody(toFlow({ ...one, trigger: "dm_received" }).steps)).toEqual([{ type: "send_dm", text: "Hi {name}, see {page}" }]);
    expect(stepsBody(toFlow({ ...one, dm: "", publicReply: "" }).steps)).toEqual([{ type: "send_dm", text: "" }]);
    expect(toSimple([newStep("reply_publicly", "Thanks!")])).toEqual({ dm: "", publicReply: "Thanks!", tags: [], also: [], dropped: [] });
    // What one reply can't hold is named, and the first DM and public reply stay.
    expect(toSimple([dm("First", "Yes", "No"), wait("1", "days"), dm("Second"), wait("5"), dm("Third", "Ok"), newStep("reply_publicly", "A"), newStep("reply_publicly", "B")])).toEqual({
      dm: "First",
      publicReply: "A",
      tags: [],
      also: [],
      dropped: ["2 waits", "3 buttons", "2 more DMs", "1 more public reply"],
    });
    expect(toSimple([dm("Hi", "Yes"), wait("5"), dm("Bye")]).dropped).toEqual(["1 wait", "1 button", "1 more DM"]);
  });

  const saved = {
    name: "Guide flow",
    active: true,
    trigger: "comment_received",
    conditions: { social_set_id: null, account_ids: ["c1"], post_remote_ids: [], keywords: ["guide"], first_per_author: false },
    actions: [],
    fallback_public_reply: null,
    steps: [
      { type: "send_dm", text: "Want the guide, {name}?", buttons: [{ label: "Yes please", payload: "guide_yes" }, { label: "No", payload: "no" }] },
      { type: "reply_publicly", text: "Check your DMs" },
      { type: "wait", minutes: 1440 },
      { type: "send_dm", text: "Still there?" },
    ],
  } as unknown as Automation;

  it("saves a loaded flow as it came, with steps and neither actions nor a fallback", () => {
    const d = draftOf(saved);
    expect(d).toMatchObject({ flow: true, dm: "", publicReply: "", fallbackOn: false });
    const input = automationInput(d, { social_set_id: null, account_ids: ["c1"] }, []);
    expect(input).toEqual({ name: "Guide flow", trigger: "comment_received", conditions: saved.conditions, steps: saved.steps, active: true });
    expect(Object.keys(input)).not.toContain("actions");
    expect(Object.keys(input)).not.toContain("fallback_public_reply");
    // A simple one still goes with actions and no steps.
    expect(Object.keys(automationInput(full, scope, uris))).not.toContain("steps");
    expect(draftOf({ ...saved, actions: [{ type: "send_dm", text: "Hi" }], steps: null } as Automation)).toMatchObject({ flow: false, steps: [], dm: "Hi" });
    expect(actionsSummary(saved)).toBe("4 steps: DM, public reply, wait 1 day, DM");
    expect(flowOutline([{ type: "send_dm", text: "a" }, { type: "wait", minutes: 90 }, { type: "send_dm", text: "b" }])).toBe("DM, wait 90 minutes, DM");
    expect(actionsSummary({ actions: [], fallback_public_reply: null, steps: [{ type: "send_dm", text: "a" }] })).toBe("1 step: DM");
  });

  it("keeps a loaded payload when its label changes, and trims labels", () => {
    const [first] = draftOf(saved).steps;
    expect(first).toMatchObject({ buttons: [{ label: "Yes please", payload: "guide_yes", own: true }, { own: true }] });
    expect(stepsBody([{ ...dm("Hi"), buttons: [{ label: "  Yes  ", payload: "yes", own: false }] }])).toEqual([{ type: "send_dm", text: "Hi", buttons: [{ label: "Yes", payload: "yes" }] }]);
  });

  it("drops what a new trigger can't send from the steps", () => {
    const d = { ...draftOf(saved), steps: [dm("See {page} now"), newStep("reply_publicly", "Thanks"), wait("5"), dm("Bye")] };
    const next = changeTrigger(d, "dm_received");
    expect(next.dropped).toEqual(["public reply steps", "{page} in the steps"]);
    expect(stepsBody(next.draft.steps)).toEqual([{ type: "send_dm", text: "See now" }, { type: "wait", minutes: 5 }, { type: "send_dm", text: "Bye" }]);
    expect(changeTrigger(d, "mention_received").dropped).toEqual([]);
  });

  it("listens for button payloads only under the button trigger", () => {
    const d = draftOf(undefined, "button-follow-up", "guide_yes");
    expect(d).toMatchObject({ trigger: "button_clicked", payloads: ["guide_yes"], flow: false });
    expect(draftOf(undefined, "button-follow-up", "Not OK").payloads).toEqual([]);
    expect(draftOf(undefined, "welcome", "guide_yes").payloads).toEqual([]);
    const input = automationInput(d, { social_set_id: "s1", account_ids: [] }, []);
    expect(input.conditions).toEqual({ social_set_id: "s1", account_ids: [], payloads: ["guide_yes"] });
    expect(input.actions).toEqual([{ type: "send_dm", text: "Thanks, {name}! Here is more: " }]);
    const moved = changeTrigger(d, "dm_received");
    expect(moved.dropped).toEqual(["button payloads"]);
    expect(automationInput(moved.draft, { social_set_id: null, account_ids: [] }, []).conditions).not.toHaveProperty("payloads");
    expect(reason("automation_changed")).toContain("changed or switched off");
  });
});

describe("tag the contact", () => {
  const tagged = { ...full, tags: ["vip", "lead"] };

  it("sends tags as actions beside the others, three at most, under every trigger", () => {
    expect(automationInput(tagged, scope, uris).actions).toEqual([
      { type: "send_dm", text: "Hi {name}, see {page}" },
      { type: "reply_publicly", text: "Sent you a DM" },
      { type: "tag_contact", tag: "vip" },
      { type: "tag_contact", tag: "lead" },
    ]);
    expect(automationInput({ ...tagged, tags: ["a", "b", "c", "d"] }, scope, uris).actions?.filter((a) => a.type === "tag_contact")).toHaveLength(3);
    const follower = automationInput({ ...changeTrigger(tagged, "new_follower").draft, dm: "Hi" }, scope, []);
    expect(follower.actions).toEqual([{ type: "send_dm", text: "Hi" }, { type: "tag_contact", tag: "vip" }, { type: "tag_contact", tag: "lead" }]);
  });

  it("reads the tags of a saved automation back and names them in the summary", () => {
    const actions = automationInput(tagged, scope, uris).actions!;
    const saved = { id: "a", name: "A", active: true, activated_at: "", trigger: "comment_received", conditions: scope, actions, fallback_public_reply: null, created_by: null, created_at: "", updated_at: "" } as const;
    expect(canEdit(saved)).toBe(true);
    expect(draftOf(saved)).toMatchObject({ dm: "Hi {name}, see {page}", publicReply: "Sent you a DM", tags: ["vip", "lead"] });
    expect(actionsSummary(saved)).toBe("Sends a DM and replies publicly, tag: vip, tag: lead");
    // An action in a shape this page does not know leaves the automation read-only.
    expect(canEdit({ ...saved, actions: [...actions, { type: "add_to_list", list: "x" } as never] })).toBe(false);
    expect(canEdit({ ...saved, actions: [], steps: [{ type: "send_dm", text: "Hi" }, { type: "tag_contact", tag: "vip", extra: 1 } as never] })).toBe(false);
  });

  it("holds a Threads flow to replies and mentions, a public reply and 500 bytes", () => {
    const reply = (text: string): StepDraft => ({ ...newStep("reply_publicly"), text }) as StepDraft;
    expect(flowProblems([reply("Thanks!")], "comment_received", ["threads"])).toEqual([]);
    expect(flowProblems([reply("Thanks!")], "mention_received", ["threads"])).toEqual([]);
    // No DM, and no trigger Threads lacks; a mixed scope is left to brain.
    expect(flowProblems([newStep("send_dm", "Hi")], "comment_received", ["threads"])).toEqual([{ step: 0, text: "Threads has no DMs and no private reply. Use a public reply." }]);
    expect(flowProblems([reply("Hi")], "new_follower", ["threads"]).map((p) => p.step)).toEqual([0, null]);
    expect(flowProblems([newStep("send_dm", "Hi")], "comment_received", ["threads", "bluesky"])).toEqual([]);
    // A Threads reply may be 400 characters (the limit is 500), where any other network stops at 300.
    expect(flowProblems([reply("a".repeat(400))], "comment_received", ["threads"])).toEqual([]);
    expect(flowProblems([reply("a".repeat(400))], "comment_received", ["bluesky"]).length).toBe(1);
    expect(replyLimit(["threads"]).max).toBe(500);
    expect(replyLimit(["threads", "x"]).max).toBe(300);
    expect(threadsProblems("comment_received", false)).toEqual([]);
    expect(threadsProblems("dm_received", true).length).toBe(2);
    // 126 emoji are 504 bytes.
    expect(flowProblems([reply("😀".repeat(126))], "comment_received", ["threads"])[0]?.text).toContain("Too long for Threads");
    expect(flowProblems([reply("😀".repeat(125))], "comment_received", ["threads"])).toEqual([]);
  });

  it("is a flow step that sends nothing: saved clean, outlined, and never the flow's only step", () => {
    const tag = { ...newStep("tag_contact"), tag: "  VIP, Gold " };
    const steps = [newStep("send_dm", "Hi"), tag];
    expect(flowProblems(steps, "dm_received")).toEqual([]);
    expect(stepsBody(steps)).toEqual([{ type: "send_dm", text: "Hi" }, { type: "tag_contact", tag: "vip gold" }]);
    expect(flowOutline(stepsBody(steps))).toBe("DM, tag: vip gold");
    expect(canEdit({ id: "f", name: "F", active: true, activated_at: "", trigger: "dm_received", conditions: scope, actions: [], fallback_public_reply: null, created_by: null, created_at: "", updated_at: "", steps: stepsBody(steps) })).toBe(true);
    expect(flowProblems([tag], "dm_received")).toEqual([{ step: null, text: "A flow needs at least one step that sends something. Add a DM, or a mail to your team or a moderation step." }]);
    expect(flowProblems([newStep("send_dm", "Hi"), newStep("tag_contact")], "dm_received")).toEqual([{ step: 1, text: "Write the tag: 1 to 30 characters, no commas." }]);
  });

  it("moves between one reply and a flow with the tags", () => {
    const flow = toFlow(tagged);
    expect(flow.dropped).toEqual(["the fallback reply"]);
    expect(stepsBody(flow.steps).slice(2)).toEqual([{ type: "tag_contact", tag: "vip" }, { type: "tag_contact", tag: "lead" }]);
    expect(toSimple(flow.steps)).toMatchObject({ tags: ["vip", "lead"], dropped: [] });
    const many = [newStep("send_dm", "Hi"), ...["a", "b", "c", "d", "a"].map((t) => newStep("tag_contact", t))];
    expect(toSimple(many)).toMatchObject({ tags: ["a", "b", "c"], dropped: ["1 more tag"] });
  });
});

describe("duplicateDraft", () => {
  const source = (extra: Partial<Automation>): Automation => ({
    id: "a1",
    name: "Guide flow",
    active: true,
    activated_at: "",
    trigger: "comment_received",
    conditions: { social_set_id: null, account_ids: ["c1"], keywords: ["guide"], post_remote_ids: [], first_per_author: true },
    actions: [],
    fallback_public_reply: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...extra,
  });
  const payloads = (d: Draft) => d.steps.flatMap((s) => (s.type === "send_dm" ? s.buttons.map((b) => b.payload) : []));

  it("is switched off and named as a copy, within the 60 characters a name takes", () => {
    const d = duplicateDraft(source({ actions: [{ type: "send_dm", text: "Hi" }, { type: "tag_contact", tag: "vip" }], fallback_public_reply: "Check your DMs" }));
    expect(d).toMatchObject({ name: "Guide flow (copy)", active: false, flow: false, dm: "Hi", tags: ["vip"], fallbackOn: true, fallback: "Check your DMs", keywords: ["guide"], firstPerAuthor: true });
    const long = duplicateDraft(source({ name: "n".repeat(60), actions: [{ type: "send_dm", text: "Hi" }] }));
    expect(long.name).toBe(`${"n".repeat(53)} (copy)`);
    expect(long.name).toHaveLength(60);
  });

  it("copies the steps and gives every button a payload no button of the original or the copy has", () => {
    const steps = [
      { type: "send_dm" as const, text: "Want it?", buttons: [{ label: "Yes", payload: "yes" }, { label: "Yes!", payload: "yes-2" }] },
      { type: "wait" as const, minutes: 60 },
      { type: "send_dm" as const, text: "Sure?", buttons: [{ label: "No", payload: "no" }] },
      { type: "tag_contact" as const, tag: "asked" },
    ];
    const d = duplicateDraft(source({ steps }));
    expect(d.flow).toBe(true);
    expect(payloads(d)).toEqual(["yes-3", "yes-2-2", "no-2"]);
    expect(new Set([...payloads(d), "yes", "yes-2", "no"]).size).toBe(6);
    expect(payloads(d).every(payloadOk)).toBe(true);
    // Nothing the form refuses, and everything else as it was.
    expect(flowProblems(d.steps, "comment_received")).toEqual([]);
    expect(stepsBody(d.steps).map((s) => (s.type === "send_dm" ? { ...s, buttons: s.buttons?.map((b) => b.label) } : s))).toEqual([
      { type: "send_dm", text: "Want it?", buttons: ["Yes", "Yes!"] },
      { type: "wait", minutes: 60 },
      { type: "send_dm", text: "Sure?", buttons: ["No"] },
      { type: "tag_contact", tag: "asked" },
    ]);
  });

  it("keeps the payloads a button automation listens for", () => {
    const d = duplicateDraft(source({ trigger: "button_clicked", conditions: { social_set_id: null, account_ids: [], payloads: ["yes"] }, actions: [{ type: "send_dm", text: "Hi" }] }));
    expect(d.payloads).toEqual(["yes"]);
  });
});

describe("sameSteps", () => {
  it("compares steps whatever the order of their keys, and no buttons with none", () => {
    expect(sameSteps([{ type: "send_dm", text: "Hi", buttons: [] }, { type: "wait", minutes: 5 }], [{ text: "Hi", type: "send_dm" }, { minutes: 5, type: "wait" }])).toBe(true);
    expect(sameSteps([{ type: "send_dm", text: "Hi" }], [{ type: "send_dm", text: "Hi!" }])).toBe(false);
    expect(sameSteps([{ type: "send_dm", text: "Hi" }], [{ type: "reply_publicly", text: "Hi" }])).toBe(false);
    expect(sameSteps([{ type: "send_dm", text: "Hi", buttons: [{ label: "Yes", payload: "yes" }] }], [{ type: "send_dm", text: "Hi", buttons: [{ label: "Yes", payload: "y" }] }])).toBe(false);
    expect(sameSteps(null, undefined)).toBe(true);
    expect(sameSteps(null, [{ type: "send_dm", text: "Hi" }])).toBe(false);
  });
});

describe("filterRuns", () => {
  const run = (id: string, status: Run["status"]) => ({ id, status }) as Run;
  const runs = [run("1", "sent"), run("2", "failed"), run("3", "skipped"), run("4", "waiting"), run("5", "running"), run("6", "failed")];
  it("keeps every run under All and only its own status under a chip", () => {
    expect(filterRuns(runs, "all")).toBe(runs);
    expect(filterRuns(runs, "failed").map((r) => r.id)).toEqual(["2", "6"]);
    expect(filterRuns(runs, "waiting").map((r) => r.id)).toEqual(["4"]);
    expect(filterRuns(runs, "sent").map((r) => r.id)).toEqual(["1"]);
    expect(filterRuns([], "skipped")).toEqual([]);
  });
});

describe("proportions", () => {
  it("is null when nothing ran, so the bar stays empty", () => {
    expect(proportions({ sent: 0, skipped: 0, failed: 0 })).toBeNull();
  });
  it("shares 100 percent between sent, skipped and failed", () => {
    expect(proportions({ sent: 12, skipped: 3, failed: 1 })).toEqual({ sent: 75, skipped: 18.75, failed: 6.25 });
    expect(proportions({ sent: 0, skipped: 0, failed: 2 })).toEqual({ sent: 0, skipped: 0, failed: 100 });
    const p = proportions({ sent: 1, skipped: 1, failed: 1 })!;
    expect(p.sent + p.skipped + p.failed).toBeCloseTo(100);
  });
});

describe("the template gallery", () => {
  it("puts every template in a group, and marks two as popular", () => {
    expect(templates.every((t) => TEMPLATE_GROUPS.includes(t.group))).toBe(true);
    expect(TEMPLATE_GROUPS.every((g) => templates.some((t) => t.group === g))).toBe(true);
    expect(templates.filter((t) => t.popular).map((t) => t.id)).toEqual(["comment-to-dm", "welcome"]);
    expect(TRIGGERS.every((t) => triggers[t].networks.length > 0)).toBe(true);
  });
});

describe("AI steps", () => {
  const scope = { social_set_id: null, account_ids: [] };
  const saved = (steps: Automation["steps"]): Automation => ({ id: "a", name: "A", active: true, activated_at: "", trigger: "comment_received", conditions: scope, actions: [], fallback_public_reply: null, created_by: null, created_at: "", updated_at: "", steps });

  it("saves the prompt, loads it back and counts as a send", () => {
    const steps = [newStep("ai_send_dm", "Thank them"), newStep("ai_reply_publicly", "Say hi")];
    expect(flowProblems(steps, "comment_received")).toEqual([]);
    const body = stepsBody(steps);
    expect(body).toEqual([
      { type: "ai_send_dm", prompt: "Thank them" },
      { type: "ai_reply_publicly", prompt: "Say hi" },
    ]);
    expect(canEdit(saved(body))).toBe(true);
    expect(canEdit(saved([{ type: "ai_send_dm", prompt: "x", text: "y" } as never]))).toBe(false);
    expect(stepsBody(draftOf(saved(body)).steps)).toEqual(body);
    expect(flowOutline(body)).toBe("AI DM, AI public reply");
    expect(sameSteps(body, [{ type: "ai_send_dm", prompt: "Thank them" }, { type: "ai_reply_publicly", prompt: "Say hi" }])).toBe(true);
    expect(sameSteps(body, [{ type: "ai_send_dm", prompt: "Other" }, { type: "ai_reply_publicly", prompt: "Say hi" }])).toBe(false);
  });

  it("finds what brain would refuse in a prompt", () => {
    expect(flowProblems([newStep("ai_send_dm", " ")], "dm_received")).toEqual([{ step: 0, text: "Write the prompt." }]);
    expect(flowProblems([newStep("ai_send_dm", "x".repeat(2001))], "dm_received")).toEqual([{ step: 0, text: "Too long: at most 2000 characters." }]);
    expect(flowProblems([newStep("ai_send_dm", "See {page}")], "comment_received")).toEqual([{ step: 0, text: "The AI can't use {page}. Remove it." }]);
    expect(flowProblems([newStep("ai_send_dm", "Greet {name}")], "comment_received")).toEqual([{ step: 0, text: "The AI is given their name already. Remove {name}." }]);
    expect(flowProblems([newStep("ai_reply_publicly", "Hi")], "dm_received")).toContainEqual({ step: 0, text: "This trigger has nothing to reply under. Remove this step." });
  });

  it("is dropped by a trigger with nothing to reply under, and by One reply", () => {
    const d = { ...draftOf(), flow: true, steps: [newStep("send_dm", "Hi"), newStep("ai_reply_publicly", "Say hi")] };
    const { draft, dropped } = changeTrigger(d, "dm_received");
    expect(dropped).toContain("public reply steps");
    expect(draft.steps.map((s) => s.type)).toEqual(["send_dm"]);
    expect(toSimple([newStep("send_dm", "Hi"), newStep("ai_send_dm", "x")]).dropped).toEqual(["1 AI step"]);
  });

  it("names its results and reasons", () => {
    expect(reason("no_ai_credits")).toBe("This month's AI replies and your AI credits are used up");
    expect(reason("ai_link")).toBe("Not sent: the AI added a link, address or @handle that is not in your prompt");
    expect(reason("ai_leak")).toBe("Not sent: the AI repeated your prompt");
    expect(actionsSummary({ actions: [{ type: "ai_send_dm", prompt: "x" }], fallback_public_reply: null, steps: null })).toBe("AI DM");
  });
});

describe("flowProblems with a Facebook or Instagram scope", () => {
  const dm = (text: string) => newStep("send_dm", text);
  const wait = (amount: number, unit: "minutes" | "hours" | "days") => ({ ...newStep("wait"), amount: String(amount), unit }) as ReturnType<typeof newStep>;
  const texts = (steps: ReturnType<typeof newStep>[], trigger: Draft["trigger"], providers: string[]) => flowProblems(steps, trigger, providers).map((p) => p.step);

  it("checks Meta's rules only when every account is Facebook or Instagram", () => {
    const two = [dm("Hi"), wait(5, "minutes"), dm("Again")];
    expect(texts(two, "comment_received", ["facebook"])).toEqual([2]);
    expect(texts(two, "comment_received", ["facebook", "bluesky"])).toEqual([]);
    expect(texts(two, "comment_received", [])).toEqual([]);
    expect(texts([dm("Hi"), wait(1, "days"), dm("Later")], "dm_received", ["instagram"])).toEqual([2]);
    expect(texts([dm("Hi"), wait(23, "hours"), dm("Later")], "dm_received", ["instagram"])).toEqual([]);
    expect(texts([newStep("reply_publicly", "Hi"), wait(7, "days"), dm("Late")], "comment_received", ["facebook"])).toEqual([2]);
    expect(texts([dm("ক".repeat(400))], "dm_received", ["instagram"])).toEqual([0]);
    expect(texts([dm("ক".repeat(400))], "dm_received", ["facebook"])).toEqual([]);
  });
});

describe("waiting for a reply and the steps that send nothing", () => {
  const dm = (text = "Hi") => newStep("send_dm", text);
  const wait = (type: "wait" | "wait_for_reply", amount = "1", unit: "minutes" | "hours" | "days" = "hours") => ({ ...newStep(type), amount, unit });

  it("treats a wait for a reply as a wait: never first or last, and a valid time", () => {
    expect(flowProblems([wait("wait_for_reply"), dm()], "dm_received").map((p) => p.text)).toContain("A flow can't start with a wait. Move a DM above it.");
    expect(flowProblems([dm(), wait("wait_for_reply")], "dm_received").map((p) => p.text)).toContain("A flow can't end with a wait. Add a step after it, or remove it.");
    expect(flowProblems([dm(), wait("wait_for_reply", "9", "days"), dm()], "dm_received").map((p) => p.text)).toContain("Wait between 1 minute and 7 days, as a whole number.");
    expect(flowProblems([dm(), wait("wait_for_reply"), dm()], "dm_received")).toEqual([]);
  });

  it("lets a comment's flow send more after the person has written, as Meta does", () => {
    const meta = ["facebook"];
    // Two DMs in a row answer one comment: one private reply only.
    expect(flowProblems([dm(), dm("Two")], "comment_received", meta).map((p) => p.step)).toEqual([1]);
    // With a wait for their reply between, the second goes in their conversation.
    expect(flowProblems([dm(), wait("wait_for_reply", "1", "days"), dm("Two"), dm("Three")], "comment_received", meta)).toEqual([]);
    // The new 24 hours still end: a wait of a day after the answer is too long.
    expect(flowProblems([dm(), wait("wait_for_reply", "1", "days"), wait("wait", "2", "days"), dm("Two")], "comment_received", meta).map((p) => p.step)).toEqual([3]);
  });

  it("counts a mail, a hide or a like as doing something, once each, and hide and like for comments only", () => {
    expect(flowProblems([newStep("hide_comment")], "comment_received")).toEqual([]);
    expect(flowProblems([newStep("hide_comment")], "dm_received").map((p) => p.text)).toContain("Hiding works on comments, and liking and reposting on comments and mentions. Remove those steps.");
    expect(flowProblems([newStep("notify_team"), newStep("notify_team"), dm()], "dm_received").map((p) => p.text)).toContain("Mail your team can be in a flow once.");
    expect(flowProblems([newStep("stop_automations")], "dm_received")).toHaveLength(1);
  });

  it("saves the steps as brain takes them and keeps what the builder can't show out of it", () => {
    const steps = [dm(), wait("wait_for_reply", "2", "hours"), newStep("notify_team"), newStep("like_comment")];
    expect(stepsBody(steps)).toEqual([{ type: "send_dm", text: "Hi" }, { type: "wait_for_reply", minutes: 120 }, { type: "notify_team" }, { type: "like_comment" }]);
    const a = (steps: unknown[]) => ({ trigger: "comment_received", conditions: { account_ids: [] }, actions: [], steps }) as unknown as Parameters<typeof canEdit>[0];
    expect(canEdit(a([{ type: "send_dm", text: "x" }, { type: "wait_for_reply", minutes: 5 }, { type: "hide_comment" }]))).toBe(true);
    expect(canEdit(a([{ type: "send_dm", text: "x" }, { type: "assign", user_id: "u1" }]))).toBe(false);
    // A condition the builder has no field for would be lost on a save.
    const withCondition = (conditions: object) => ({ trigger: "comment_received", conditions: { account_ids: [], ...conditions }, actions: [{ type: "send_dm", text: "x" }] }) as unknown as Parameters<typeof canEdit>[0];
    expect(canEdit(withCondition({ has_link: true, sentiment: ["negative"] }))).toBe(true);
    for (const c of [{ when: { zone: "UTC" } }, { question: true }, { languages: ["en"] }]) expect(canEdit(withCondition(c))).toBe(false);
    expect(sameSteps([{ type: "wait_for_reply", minutes: 5 }, { type: "notify_team" }], [{ type: "wait_for_reply", minutes: 5 }, { type: "notify_team" }])).toBe(true);
    expect(sameSteps([{ type: "wait_for_reply", minutes: 5 }], [{ type: "wait", minutes: 5 }])).toBe(false);
    expect(flowOutline([{ type: "send_dm", text: "x" }, { type: "wait_for_reply", minutes: 60 }, { type: "hide_comment" }])).toBe("DM, wait for a reply up to 1 hour, hide the comment");
  });
});

describe("the link rule, the mood and the extra actions of one reply", () => {
  it("sends only what the trigger reads, and the extras that apply", () => {
    const d = { ...full, hasLink: "yes" as const, sentiment: ["negative" as const], also: ["hide_comment" as const, "notify_team" as const, "stop_automations" as const], dm: "", publicReply: "", tags: [] };
    const input = automationInput(d, scope, uris);
    expect(input.conditions).toMatchObject({ has_link: true, sentiment: ["negative"] });
    expect(input.actions).toEqual([{ type: "notify_team" }, { type: "hide_comment" }, { type: "stop_automations" }]);
    // A DM has no comment to hide; a button tap and a follow carry no text.
    const dm = automationInput({ ...d, trigger: "dm_received", payloads: [] }, scope, uris);
    expect(dm.actions).toEqual([{ type: "notify_team" }, { type: "stop_automations" }]);
    expect(automationInput({ ...d, trigger: "story_mention" }, scope, uris).conditions).not.toHaveProperty("has_link");
  });

  it("turns an effect-only reply into a flow without an empty DM, and back", () => {
    const d = { ...full, dm: "", publicReply: "", tags: [], also: ["hide_comment" as const] };
    const flow = toFlow(d);
    expect(flow.steps.map((s) => s.type)).toEqual(["hide_comment"]);
    expect(toSimple(flow.steps).also).toEqual(["hide_comment"]);
  });

  it("reads them back, drops them with a trigger that cannot take them, and says them in the notes", () => {
    const saved = { id: "a", name: "Spam", active: true, activated_at: "", trigger: "comment_received", conditions: { account_ids: [], has_link: false, sentiment: ["positive"] }, actions: [{ type: "like_comment" }, { type: "send_dm", text: "Hi" }], fallback_public_reply: null, created_by: null, created_at: "", updated_at: "" } as unknown as Parameters<typeof draftOf>[0];
    const d = draftOf(saved);
    expect([d.hasLink, d.sentiment, d.also]).toEqual(["no", ["positive"], ["like_comment"]]);
    expect(conditionNotes(saved!.conditions)).toEqual(["Only text without a link", "Mood: positive"]);
    const moved = changeTrigger(d, "new_follower");
    expect(moved.draft).toMatchObject({ hasLink: "any", sentiment: [], also: [] });
    expect(moved.dropped).toEqual(expect.arrayContaining(["the link rule", "the mood rule", "hide, like and repost"]));
  });
});

describe("like, repost and follow back", () => {
  it("fits each action to the triggers that can do it", () => {
    expect(effectFits("hide_comment", "comment_received")).toBe(true);
    expect(effectFits("hide_comment", "mention_received")).toBe(false);
    expect(effectFits("like_comment", "mention_received")).toBe(true);
    expect(effectFits("repost_comment", "like_received")).toBe(false);
    expect(effectFits("follow_back", "like_received")).toBe(true);
    expect(effectFits("notify_team", "dm_received")).toBe(true);
  });

  it("sends them in the form's order, and drops the ones a trigger cannot take", () => {
    const d: Draft = { ...full, dm: "Hi", tags: ["vip"], also: ["notify_team", "like_comment", "repost_comment", "follow_back", "stop_automations"] };
    expect(automationInput(d, scope, uris).actions?.map((a) => a.type)).toEqual(["send_dm", "reply_publicly", "tag_contact", "notify_team", "like_comment", "repost_comment", "follow_back", "stop_automations"]);
    // Nobody to message or tag behind a like: the DM, the tag and the post actions go, and they are named.
    const moved = changeTrigger(d, "like_received");
    expect(moved.dropped).toEqual(expect.arrayContaining(["DM", "tags", "hide, like and repost"]));
    expect(automationInput(moved.draft, scope, uris).actions?.map((a) => a.type)).toEqual(["notify_team", "follow_back", "stop_automations"]);
    // Even a draft that still holds them sends none.
    expect(automationInput({ ...moved.draft, dm: "Hi", tags: ["vip"] }, scope, uris).actions?.map((a) => a.type)).toEqual(["notify_team", "follow_back", "stop_automations"]);
  });

  it("says what a flow cannot hold behind a like", () => {
    const msg = (steps: StepDraft[], t: "like_received" | "comment_received") => flowProblems(steps, t).map((p) => p.text);
    expect(msg([newStep("follow_back"), newStep("notify_team")], "like_received")).toEqual([]);
    expect(msg([newStep("send_dm", "Hi"), newStep("follow_back")], "like_received")).toEqual(["A like or repost has nobody to message or tag. Remove the message, tag and reply steps."]);
    expect(msg([newStep("follow_back"), newStep("wait_for_reply"), newStep("notify_team")], "like_received")).toHaveLength(1);
    expect(msg([newStep("like_comment")], "like_received")[0]).toContain("liking and reposting on comments and mentions");
    expect(msg([newStep("repost_comment"), newStep("follow_back")], "comment_received")).toEqual([]);
  });

  it("keeps follow back and repost to triggers that Bluesky has, and starts no empty DM behind a like", () => {
    expect(effectFits("follow_back", "story_reply")).toBe(false);
    expect(effectFits("follow_back", "button_clicked")).toBe(false);
    expect(effectFits("repost_comment", "comment_received")).toBe(true);
    expect(effectFits("like_comment", "story_reply")).toBe(false);
    // One reply to a flow under a like with nothing ticked: no DM step to fill in, which a like could not send.
    expect(toFlow({ ...full, trigger: "like_received", dm: "", publicReply: "", fallbackOn: false, also: [] }).steps).toEqual([]);
    expect(toFlow({ ...full, trigger: "comment_received", dm: "", publicReply: "", fallbackOn: false, also: [] }).steps.map((s) => s.type)).toEqual(["send_dm"]);
    expect(flowProblems([newStep("wait")], "like_received").map((p) => p.text)[0]).toContain("follow back");
  });

  it("words why an automation did not run", () => {
    expect(whyNot("wrong_post")).toContain("posts this automation is limited to");
    expect(whyNot("stopped_by_other")).toContain("stops the newer ones");
    expect(whyNot("a_new_one")).toBe("a new one");
  });
});
