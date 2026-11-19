import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionsSummary,
  automationInput,
  canEdit,
  changeTrigger,
  conditionNotes,
  draftOf,
  flowOutline,
  flowProblems,
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
  type Automation,
  type Draft,
  type StepDraft,
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
  active: true,
  flow: false,
  steps: [],
  payloads: [],
};
const scope = { social_set_id: null, account_ids: ["c1"] };
const uris = ["at://did:plc:bob/app.bsky.feed.post/3abc"];

describe("triggers", () => {
  it("mirrors what brain's validate takes for each trigger", () => {
    const row = (t: keyof typeof triggers) => {
      const c = triggers[t];
      return [c.keywords, c.posts, c.firstPerAuthor, c.firstMessage, c.publicReply];
    };
    expect(TRIGGERS).toEqual(["comment_received", "dm_received", "mention_received", "new_follower", "story_reply", "button_clicked"]);
    expect(row("button_clicked")).toEqual([false, false, false, false, false]);
    expect(triggers.button_clicked.payloads).toBe(true);
    expect(triggers.button_clicked.note).toContain("Facebook and Instagram only");
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
    expect(texts([])).toEqual([[null, "A flow needs at least one step that sends something. Add a DM."]]);
    expect(texts([wait("5")])).toEqual([[null, "A flow needs at least one step that sends something. Add a DM."]]);
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
    expect(toSimple(flow.steps)).toEqual({ dm: "Hi {name}, see {page}", publicReply: "Sent you a DM", tags: [], dropped: [] });
    // The fallback has no place in a flow, a public reply none under a DM trigger, and an empty reply starts with one DM.
    expect(toFlow(full).dropped).toEqual(["the fallback reply"]);
    expect(stepsBody(toFlow({ ...one, trigger: "dm_received" }).steps)).toEqual([{ type: "send_dm", text: "Hi {name}, see {page}" }]);
    expect(stepsBody(toFlow({ ...one, dm: "", publicReply: "" }).steps)).toEqual([{ type: "send_dm", text: "" }]);
    expect(toSimple([newStep("reply_publicly", "Thanks!")])).toEqual({ dm: "", publicReply: "Thanks!", tags: [], dropped: [] });
    // What one reply can't hold is named, and the first DM and public reply stay.
    expect(toSimple([dm("First", "Yes", "No"), wait("1", "days"), dm("Second"), wait("5"), dm("Third", "Ok"), newStep("reply_publicly", "A"), newStep("reply_publicly", "B")])).toEqual({
      dm: "First",
      publicReply: "A",
      tags: [],
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

  it("is a flow step that sends nothing: saved clean, outlined, and never the flow's only step", () => {
    const tag = { ...newStep("tag_contact"), tag: "  VIP, Gold " };
    const steps = [newStep("send_dm", "Hi"), tag];
    expect(flowProblems(steps, "dm_received")).toEqual([]);
    expect(stepsBody(steps)).toEqual([{ type: "send_dm", text: "Hi" }, { type: "tag_contact", tag: "vip gold" }]);
    expect(flowOutline(stepsBody(steps))).toBe("DM, tag: vip gold");
    expect(canEdit({ id: "f", name: "F", active: true, activated_at: "", trigger: "dm_received", conditions: scope, actions: [], fallback_public_reply: null, created_by: null, created_at: "", updated_at: "", steps: stepsBody(steps) })).toBe(true);
    expect(flowProblems([tag], "dm_received")).toEqual([{ step: null, text: "A flow needs at least one step that sends something. Add a DM." }]);
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
