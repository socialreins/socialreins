// The public /features/<slug> pages. Facts mirror brain's inbox and automations (decisions/0004 in the plan repo),
// components/inbox-editor.tsx and automation-form.tsx, and `us.inbox` / `us.automation` in lib/compare.ts.
export type Support = "Yes" | "In testing" | "Not yet";
export type Feature = {
  slug: string;
  // Menu label and page heading.
  name: string;
  // One line for the Features menu.
  short: string;
  // For search results: 110 to 160 characters (tests/e2e/seo.spec.ts).
  description: string;
  intro: string;
  // Network slug (lib/networks.ts) to its state; a network not listed is "Not yet".
  support: Record<string, Support>;
  sections: { heading: string; text?: string; bullets?: string[] }[];
};

// Bluesky is live; Facebook Pages and Instagram are in testing (the same words as lib/compare.ts).
const support: Record<string, Support> = { bluesky: "Yes", facebook: "In testing", instagram: "In testing" };

export const features: Feature[] = [
  {
    slug: "automations",
    name: "Automations",
    short: "Keyword triggers and flows",
    description: "Automations in SocialReins: triggers for comments, DMs, mentions and more, and flows of steps with waits and buttons. See which networks work.",
    intro: "An automation watches for something and then acts on it for you. For example, comment to DM: someone comments a keyword on your post, and SocialReins sends them a DM.",
    support,
    sections: [
      {
        heading: "Triggers and flows",
        bullets: [
          "Triggers: a comment keyword, a DM keyword, a first message (welcome), a new follower (Bluesky), a mention, a story reply and a button tap.",
          "A flow runs several steps in turn, with waits and buttons.",
        ],
      },
      {
        heading: "How comment to DM works",
        bullets: [
          "Pick the accounts or the set it runs on, or only the posts you name.",
          "Set keywords, or leave them out to answer every comment.",
          "Write the DM, and add a public reply if you want one. {name} in the text becomes the commenter's name, and {page} the link to the post's public page.",
          "Add a public reply to fall back on when the network refuses the DM, for example when the person only takes DMs from accounts they follow.",
          "Answer each person once, or every time they comment.",
        ],
      },
      {
        heading: "Limits",
        bullets: [
          "A comment is acted on once and never tried again, so nobody gets the same message twice.",
          "A team's automations can answer 500 comments a day.",
          "Every run is listed with what was sent and, when something was refused, the reason.",
        ],
      },
      {
        heading: "Why not every network",
        text: "Each network decides what an app may read and send. Some do not let an app send a DM at all, and some need their own review first. A network moves to Yes here when it works end to end.",
      },
    ],
  },
  {
    slug: "inboxes",
    name: "Inboxes",
    short: "Comments, mentions and DMs in one place",
    description: "Inboxes in SocialReins: comments, mentions and DMs from your accounts in one place, split into custom inboxes you define. See which networks work.",
    intro: "Comments, mentions and DMs from your connected accounts arrive in one place, and you answer them there. Make as many custom inboxes as you need, each showing only what you choose.",
    support,
    sections: [
      {
        heading: "Custom inboxes",
        bullets: [
          "Scope an inbox to some accounts or to a set, for example one inbox per brand.",
          "Filter by kind: comments, mentions or DMs.",
          "Filter by keyword, or show only what nobody has answered yet.",
          "Everyone on the team sees the same inboxes.",
        ],
      },
      {
        heading: "Answering",
        bullets: [
          "Reply under a comment or mention, and answer a DM in its conversation, without leaving SocialReins.",
          "New items are fetched about once a minute, and an open inbox refreshes by itself.",
          "On Bluesky, DMs are read only when the app password allows them.",
        ],
      },
      {
        heading: "Why not every network",
        text: "Each network decides what an app may read. A network moves to Yes here when its comments and messages arrive and can be answered end to end.",
      },
    ],
  },
];

export const feature = (slug: string) => features.find((f) => f.slug === slug);
