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

// Bluesky is live; Facebook Pages, Instagram, Threads and X are in testing (the same words as lib/compare.ts). LinkedIn is Not yet:
// it lets an app read comments only after its own approval.
const support: Record<string, Support> = { bluesky: "Yes", facebook: "In testing", instagram: "In testing", threads: "In testing", x: "In testing" };

export const features: Feature[] = [
  {
    slug: "automations",
    name: "Automations",
    short: "Keyword triggers and flows",
    description: "Automations in SocialReins: triggers for comments, DMs, mentions and more, flows of steps with waits and buttons, and contact tags. See which networks work.",
    intro: "An automation watches for something and then acts on it for you. For example, comment to DM: someone comments a keyword on your post, and SocialReins sends them a DM.",
    support,
    sections: [
      {
        heading: "Triggers and flows",
        bullets: [
          "Triggers: a comment keyword, a DM keyword, a first message (welcome), a new follower (Bluesky), a mention, a story reply and a button tap.",
          "A flow runs several steps in turn, with waits and buttons.",
          "On Threads, only a reply or a mention can start one, and the answer is a public reply: Threads has no DMs and no private reply.",
          "A step can write its reply with AI from your prompt, using your own AI key or the AI replies that come with the Scheduler and Automation plan. It never adds a link or @handle your prompt does not hold.",
          "An automation can also tag the contact, so you can find those people later or send them a broadcast.",
        ],
      },
      {
        heading: "How comment to DM works",
        bullets: [
          "Pick the accounts or the set it runs on, or only the posts you name.",
          "Set keywords, or leave them out to answer every comment.",
          "Write the DM, and add a public reply if you want one. {name} in the text becomes the commenter's name, and {page} the link to the post's public page.",
          "Add a public reply to fall back on when the network refuses the DM, for example when the person only takes DMs from accounts they follow. X has no private reply to a comment, so there the fallback is the way to answer.",
          "Answer each person once, or every time they comment.",
          "Test it before it goes live: type a sample comment and see what it would match and send, AI text included. Nothing is sent. An AI step is written for real and counts toward your AI replies.",
        ],
      },
      {
        heading: "Limits",
        bullets: [
          "A comment is acted on once and never tried again, so nobody gets the same message twice.",
          "A team's automations can answer 500 comments a day.",
          "On Bluesky there is no private reply to a comment: a DM reaches only people who follow you or take DMs from anyone, so keep a fallback public reply. A new follower follows you, so a welcome DM reaches them unless they closed their DMs. Replies are 300 characters, and Bluesky has no story replies or buttons to tap. A quote of your post counts as a mention.",
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
    description: "Inboxes in SocialReins: comments, mentions and DMs in one place, DMs as conversations, with search, assigning and saved replies. See which networks work.",
    intro: "Comments, mentions and DMs from your connected accounts arrive in one place, and you answer them there. Make custom inboxes, each showing only what you choose: 1 on Scheduler, 10 on Scheduler and Automation, as many as you like when you self-host.",
    support,
    sections: [
      {
        heading: "Custom inboxes",
        bullets: [
          "Pick the accounts each inbox holds, for example one inbox per brand. An account can be in more than one.",
          "Filter by kind: comments, mentions or DMs.",
          "Filter by keyword, or show only what nobody has answered yet.",
          "Everyone on the team sees the same inboxes.",
        ],
      },
      {
        heading: "Answering",
        bullets: [
          "Reply under a comment or mention, and answer a DM in its conversation, without leaving SocialReins.",
          "DMs with one person are grouped into one conversation, shown as a chat.",
          "Search an inbox by text or by author.",
          "Assign an item to a teammate, or to yourself.",
          "Keep saved replies and insert one into the reply box.",
          "Keyboard shortcuts move between items, mark one done, assign it and start a reply.",
          "New items are fetched about once a minute, and an open inbox refreshes by itself.",
          "On Bluesky, DMs are read only when the app password allows them.",
          "Threads: replies to your posts and posts that mention you arrive, about every 5 minutes. Threads has no DMs, so there are none to read or send. Reply under a reply or a mention, and hide or show a reply directly under your post. An app cannot like, repost or follow there. An account connected before replies were added needs to be connected again once, and until Meta approves the reply and mention permissions only the app's testers can use them.",
          "X charges for every post, user and DM it returns, so an X inbox is off until you turn it on for an account. You choose how often it is read and the most it may spend a month, and it stops when that is used up or X is out of credits. Reply, like, repost and hide a reply from the inbox. X takes a DM only from an account the person follows or when their DMs are open.",
        ],
      },
      {
        heading: "Contacts",
        bullets: ["Everyone who wrote to your accounts is listed under Contacts.", "Give a contact tags and notes, and filter the inbox by a tag."],
      },
      {
        heading: "Why not every network",
        text: "Each network decides what an app may read. A network moves to Yes here when its comments and messages arrive and can be answered end to end.",
      },
    ],
  },
];

// The public /features page and the home page's "What it does" cards: every feature in seven groups, one
// sentence each. Facts and wording follow the `us` object in lib/compare.ts; change the two together.
export type Group = {
  id: string;
  name: string;
  // One or two sentences for the home page card.
  summary: string;
  // Replaces "Live now" where the group is not live on every network.
  pill?: string;
  // Where the group is live, said once under its heading.
  note?: string;
  // Its own page, when it has one.
  href?: string;
  items: { name: string; text: string }[];
};

const TESTING = "Live on Bluesky. Facebook Pages and Instagram are in testing. So is X, which stays off until a team turns it on, and so is Threads (replies and mentions, no DMs).";

export const groups: Group[] = [
  {
    id: "publish",
    name: "Publish",
    summary: "One post to nine networks, with a separate caption and media for each, a first comment, threads and carousels. Take it down everywhere in one step.",
    href: "/socials",
    items: [
      { name: "Nine networks", text: "Post to Facebook Pages, Instagram, Threads, LinkedIn, Bluesky, X, TikTok, YouTube and Pinterest from one place." },
      { name: "A caption and media for each network", text: "Give each network its own text and its own images or video inside one post." },
      { name: "First comment", text: "Add a comment that goes out right after the post on Facebook, Instagram, LinkedIn and YouTube." },
      { name: "Threads", text: "Write a chain of follow-up posts for Bluesky, Threads and X." },
      { name: "Carousels", text: "Post several photos and videos as one post to swipe through on Instagram and Threads." },
      { name: "Public post pages", text: "Give a post its own public page with its text, its media and a link to each live post." },
      { name: "Take down everywhere", text: "Take a published post down from every network it went out on, in one step." },
    ],
  },
  {
    id: "plan",
    name: "Plan and schedule",
    summary: "A calendar you drag posts around, a queue with weekly time slots, bulk upload from a CSV file, recurring posts and RSS feeds.",
    items: [
      { name: "Calendar", text: "See the month and drag a scheduled post to another day, or move it with a date picker." },
      { name: "Queue", text: "Set weekly time slots for a set of accounts, and a new post takes the next free one." },
      { name: "Bulk upload", text: "Schedule many posts at once from a CSV file. TikTok is posted from the composer, not from a file. A Pinterest pin needs a board: set a default board for the account first." },
      { name: "Recurring posts", text: "Repeat a post every day, week or month, forever or until an end you set. Not for TikTok." },
      { name: "Feeds", text: "An RSS or Atom feed turns each new item into a draft, a queued post or a post. Not for TikTok, YouTube or Pinterest, and an item needs an image to go to Instagram." },
      { name: "Duplicate a post", text: "Copy a post with its text, media and network settings, and schedule it again." },
      { name: "Library", text: "Keep media links, saved captions and hashtag groups, and drop them into a post." },
    ],
  },
  {
    id: "engage",
    name: "Engage",
    summary: "Comments and DMs in one inbox, contacts with tags and notes, broadcasts to a tag and email newsletters.",
    pill: "Live on Bluesky",
    note: `Inbox, contacts and broadcasts: ${TESTING} Newsletters go by email and work today.`,
    href: "/features/inboxes",
    items: [
      { name: "One inbox", text: "Comments and DMs from your accounts arrive in one inbox, with search." },
      { name: "Conversations", text: "DMs with one person are grouped into one conversation, shown as a chat." },
      { name: "Assign and saved replies", text: "Assign an item to a teammate, and answer faster with saved replies and keyboard shortcuts." },
      { name: "Contacts", text: "Everyone who wrote to you is a contact, with tags and notes." },
      { name: "Broadcasts", text: "Send one message to the contacts with a tag. Replying stop opts a person out, and each network's own limits are respected." },
      { name: "Newsletters", text: "Email the people who signed up on your public pages, with one-click unsubscribe." },
    ],
  },
  {
    id: "automate",
    name: "Automate",
    summary: "Triggers for comments, DMs, mentions and more start a reply or a flow of several steps with waits and buttons.",
    pill: "Live on Bluesky",
    note: TESTING,
    href: "/features/automations",
    items: [
      { name: "Triggers", text: "Start from a comment keyword, a DM keyword, a first message, a new follower (Bluesky), a mention, a story reply or a button tap." },
      { name: "Flows", text: "Run several steps in turn, with waits between them and buttons the person can tap." },
      { name: "Tag contacts", text: "Have an automation tag the contact, so you can find those people later or send them a broadcast." },
    ],
  },
  {
    id: "team",
    name: "Team",
    summary: "Owner, admin and member roles, an approval step for members' posts, and a custom address for the team.",
    items: [
      { name: "Roles", text: "Invite people as an owner, an admin or a member." },
      { name: "Approvals", text: "Hold a member's post until an owner or admin approves it or asks for changes." },
      { name: "Custom team address", text: "Give the team its own address, which starts every link to it." },
    ],
  },
  {
    id: "measure",
    name: "Measure",
    summary: "For each post: likes and comments on Bluesky, Facebook, Instagram and YouTube, shares on Bluesky and Facebook, and views on YouTube.",
    pill: "On 4 networks",
    note: "On Bluesky, Facebook, Instagram and YouTube. Not on the other networks yet.",
    items: [
      { name: "Post analytics", text: "For each post: likes and comments on Bluesky, Facebook, Instagram and YouTube, shares on Bluesky and Facebook, and views on YouTube." },
      { name: "Not yet", text: "There are no reach, audience or follower reports yet." },
    ],
  },
  {
    id: "build",
    name: "Build on it",
    summary: "Open source and self-hostable, with a REST API, an MCP server and signed webhooks for your own tools and AI agents.",
    href: "/docs/self-hosted/ai",
    items: [
      { name: "Open source", text: "The code is open under the AGPL-3.0 license." },
      { name: "Self-hostable", text: "Run it on your own server, free, with every feature." },
      { name: "REST API", text: "Read and create posts from your own scripts and tools with an API token." },
      { name: "MCP server", text: "Connect an AI assistant, which can then read your accounts and create and schedule posts." },
      { name: "Installable app", text: "Install SocialReins from your browser or add it to your phone's home screen. It opens in its own window." },
      { name: "Signed webhooks", text: "Get a signed call at your own address when a post is published or fails." },
      { name: "No built-in AI writer", text: "SocialReins does not write posts for you. Your own AI agents can post through the API or the MCP server." },
    ],
  },
];

export const feature = (slug: string) => features.find((f) => f.slug === slug);
