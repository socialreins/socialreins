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
  // Questions the page already answers, word for word, for FAQPage structured data.
  faq?: [string, string][];
  sections: { heading: string; text?: string; bullets?: string[] }[];
};

// Bluesky is live; Facebook Pages, Instagram, Threads, X and YouTube are in testing (the same words as lib/compare.ts). LinkedIn is Not yet:
// it lets an app read comments only after its own approval.
const support: Record<string, Support> = { bluesky: "Yes", facebook: "In testing", instagram: "In testing", threads: "In testing", x: "In testing", youtube: "In testing" };

export const features: Feature[] = [
  {
    slug: "automations",
    name: "Automations",
    short: "Keyword triggers and flows",
    description: "Automations in SocialReins: triggers for comments, DMs, mentions and more, flows of steps with waits and buttons, and contact tags. See which networks work.",
    intro: "An automation watches for something and then acts on it for you. For example, comment to DM: someone comments a keyword on your post, and SocialReins sends them a DM.",
    support,
    faq: [
      [
        "What can trigger an automation?",
        "A comment keyword, a DM keyword, a first message, a new follower, a like or a repost of your post, a mention, a story reply, a story mention and a button tap. A like or repost trigger can be limited to the posts you name.",
      ],
      [
        "How does comment to DM work?",
        "Someone comments a keyword on your post and SocialReins sends them a DM. Pick the accounts or the set it runs on, set keywords, write the DM and add a public reply if you want one.",
      ],
      [
        "Which networks support automations?",
        "Bluesky is live. Facebook Pages, Instagram, Threads, X and YouTube are in testing. LinkedIn and Pinterest are not available yet.",
      ],
      [
        "What are the limits?",
        "A comment is acted on once and never tried again. On YouTube only the comment trigger exists and the answer is a public reply. A team's automations can answer 500 comments a day, and each automation can have its own daily limit and a cool-down.",
      ],
    ],
    sections: [
      {
        heading: "Triggers and flows",
        bullets: [
          "Triggers: a comment keyword, a DM keyword, a first message (welcome), a new follower, a like of your post, a repost of your post (those three on Bluesky), a mention, a story reply, a story mention (Instagram, in testing) and a button tap. A like or repost trigger can be limited to the posts you name.",
          "Conditions: the accounts, a set or only the posts you name, keywords, a person's first comment or message, weekdays and hours in your time zone, one of 23 languages (a very short text never matches), a person's first mention, a text with or without a link, and a question or a positive or negative mood (read by AI).",
          "A flow runs several steps in turn, with waits and buttons. It can wait for the person to answer before it goes on, and stops if they never do.",
          "On Threads, only a reply under your post or a mention can start one. It can answer with a public reply (500 characters, an emoji counts as its bytes), hide a reply directly under your post, tag, assign or mail your team, with every condition above. Threads has no DMs, no private reply and no like for an app: an automation limited to Threads accounts is refused when you save it and in the test, and with other networks beside them the Threads items are skipped with the reason in the run log. A reply from any connected Threads account, yours or another team's, is never answered.",
          "A step can write its reply with AI from your prompt, using your own AI key or the AI replies that come with the Scheduler and Automation plan. It never adds a link or @handle your prompt does not hold.",
          "An automation can also tag the contact, so you can find those people later or send them a broadcast. Besides replying it can mail your team, assign the conversation, hide a comment (Facebook, Instagram, Threads and X), like one (Facebook, Bluesky, X and, once LinkedIn approves, LinkedIn Pages), repost (Bluesky and X) or follow back (Bluesky) and keep newer automations off the same item. Hide comments that carry a link, and spam never shows.",
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
          "Test it before it goes live: type a sample comment and see what it would match and send, AI text included. Nothing is sent. An AI step is written for real and counts toward your AI replies. On Facebook and Instagram the test applies Meta's own rules to a comment or message of any age, so you see the refusal a real run would get.",
        ],
      },
      {
        heading: "Limits",
        bullets: [
          "A comment is acted on once and never tried again, so nobody gets the same message twice.",
          "On YouTube only the comment trigger exists, and the answer is a public reply: YouTube has no DMs and no private reply to a comment.",
          "An automation never answers an account connected to SocialReins, yours or another team's, so two automated accounts cannot answer each other in a loop.",
          "A team's automations can answer 500 comments a day. Each automation can have its own daily limit and a cool-down so one person cannot trigger it again and again, and one switch on the Team page pauses every automation.",
          "Facebook and Instagram: a private reply goes within 7 days of the comment and only one per comment; any other message within 24 hours of the person's last, and their answer starts a new 24 hours. An Instagram DM is at most 1000 bytes. A person answering by hand can use Meta's Human Agent tag for up to 7 days once the app holds that feature; an automation never does.",
          "A send a network refused for rate limiting went nowhere, so a flow tries it again by itself and you can retry it from the run. Any other failure is final, so nobody gets a message twice.",
          "On Bluesky there is no private reply to a comment: a DM reaches only people who follow you or take DMs from anyone, so keep a fallback public reply. A new follower follows you, so a welcome DM reaches them unless they closed their DMs. Replies are 300 characters, and Bluesky has no story replies or buttons to tap. A quote of your post counts as a mention.",
          "Likes and reposts reach SocialReins as quiet activity within a minute or two. There is nobody to message or tag on a like or repost, so those triggers take only follow back, a mail to your team and a stop. Reposting and following back go to Bluesky only, liking to Bluesky and Facebook, and they are never done to your own accounts or to someone you already follow.",
          "Every run is listed with what was sent and, when something was refused, the reason. When an automation did not run on an item, the reason (a condition that failed, a pause, a cool-down, a limit, another automation that stopped the rest) is kept for 14 days, on the automation's page and under the item in the inbox.",
        ],
      },
      {
        heading: "What it costs on X",
        bullets: [
          "X bills every post, user and message it returns or takes. The editor shows about what one run costs: the read that brought the item (a post and its author, $0.015) plus $0.015 for each message, like, hide or repost, and the test shows it for a sample.",
          "Each X account has a monthly budget that pays for reading and for what automations write. An automation stops when it is used up, when the team has no X credits, or when X says the app is out of credits, and the run log says which.",
          "An automation's reply on X holds 280 characters as X counts them (a link counts 23, some characters 2), or up to 300 with a paid X plan, the most any automation text takes; its DM holds 1000. A DM goes only to a person who follows you or has DMs open; otherwise the fallback public reply answers.",
          "Following you and quoting your post are not triggers on X yet: X bills each follower and each quote it returns, and its follower list has no way to ask for only the new ones.",
        ],
      },
      {
        heading: "Why not every network",
        text: "Each network decides what an app may read and send. Some do not let an app send a DM at all, and some need their own review first. A network moves to Yes here when it works end to end.",
      },
      {
        heading: "LinkedIn, built and waiting for approval",
        bullets: [
          "Built, and off for everyone until LinkedIn approves the app: reading the comments on a Page's recent posts every few hours, a public reply as the Page (an AI reply up to 1,250 characters, the text you type up to 300), a like on the comment, and the same conditions, cool-down, daily limit, pause switch, tags, mail, assign and stop as the other networks.",
          "Only a comment can start one. LinkedIn has no messages for apps, so an automation on LinkedIn cannot send a DM, and it cannot hide a comment (an app may only delete one, which an automation never does). It never answers a connected account, yours or another team's.",
          "A personal profile can post but never run an automation: LinkedIn lets no app read the comments on a member's posts. A Page can, once it is connected with the comment permissions. Connecting a Page needs the same LinkedIn approval, so today a LinkedIn account in the picker says \"Needs LinkedIn approval\" and cannot be chosen.",
          "LinkedIn's first tier allows 500 calls a day for the whole app and 100 for each member, and pushes nothing, so a Page is read every 3 hours and stops at 80 reads and 100 calls a day. \"Test this automation\" works on a LinkedIn account and sends nothing; it says why a run would not happen yet.",
        ],
      },
      {
        heading: "What blocks the other networks",
        bullets: [
          "LinkedIn: an app may read comments on a member's posts only with a permission LinkedIn gives to select developers (no application is open), and on a Page's posts only through its Community Management API, approved for each app, for a registered organization with a verified Page. It offers apps no messages at all. What can be built is built and switched off, see \"LinkedIn, built and waiting for approval\" above.",
          "TikTok: the API we post with has no comment or message calls. Replying to comments exists only in TikTok's Business API for Business accounts, which needs its own access, and it has no DMs.",
          "Pinterest: we found no Pinterest API call to read comments on a Pin or messages, and no webhooks.",
          "YouTube and Threads work for public replies, within limits: YouTube's daily quota is shared by every team and every upload (a reply costs 50 of 10,000 units), and Threads replies and mentions reach people outside the app's testers only after Meta's App Review. Neither has DMs.",
        ],
      },
    ],
  },
  {
    slug: "inboxes",
    name: "Inboxes",
    short: "DMs in the inbox, comments and mentions on their own page",
    description: "Inbox and Comments in SocialReins: DMs as conversations, comments and mentions on their own page with filters you can save, assigning and saved replies.",
    intro: "DMs from your connected accounts arrive in the Inbox, and comments and mentions arrive on the Comments page, and you answer them both there. Comments has filters by set, network and account that you can save and open in one click. Make custom inboxes, each showing only what you choose, comments only if you like: 1 on Scheduler, 10 on Scheduler and Automation, as many as you like when you self-host.",
    support,
    faq: [
      [
        "Which networks have an inbox?",
        "Bluesky is live. Facebook Pages, Instagram and Threads are in testing. X and YouTube are in testing too, and off until a team turns them on. The other networks are not supported yet.",
      ],
      [
        "Can I reply to comments and DMs in SocialReins?",
        "Yes. Reply under a comment or mention on the Comments page, and answer a DM in its conversation in the Inbox, without leaving SocialReins. DMs with one person are grouped into one conversation, shown as a chat.",
      ],
      [
        "Where are comments and mentions?",
        "On the Comments page, apart from the Inbox. It lists the comments and mentions of every connected account that has them, newest first, with the network, the account and the post each is on. The Inbox lists DMs. A custom inbox holds whatever you make it for, so you can still keep a comments-only inbox.",
      ],
      [
        "Can I save my filters?",
        "Yes. On the Comments page, filter by set, network, account, answered or not, assignee, keyword, post, dates, or hidden comments, then save the filters as a view. A view opens in one click or with the keys 1 to 9, 0 or Esc clears every filter, and one view can open by default. Views are yours: a teammate does not see them.",
      ],
      [
        "Can my team share an inbox?",
        "Yes. Everyone on the team sees the same inboxes, and an item can be assigned to a teammate or to yourself.",
      ],
      [
        "How often do new items arrive?",
        "New items are fetched about once a minute, and an open inbox refreshes by itself.",
      ],
    ],
    sections: [
      {
        heading: "Comments",
        bullets: [
          "Comments and mentions of every connected account in one list, newest first, each with its network, its account and the post it is on. A card per post shows its comments from every network and how many are unanswered.",
          "Filter by set, network and account (several of each), by answered or not, by assignee, by keyword, by one post, by dates, and by hidden or held comments. Every filter is in the address, so a link shares them.",
          "Save the filters as a view, open one with a click or with the keys 1 to 9, clear every filter with 0 or Esc, and pick one view to open by default. Clearing never deletes a view.",
          "Save the filters as a custom inbox in one click, or open the comment automation builder with the same accounts and keyword filled in.",
          "Facebook and Instagram comments can be hidden, liked and deleted from there, YouTube comments held and rejected. Follows, likes and reposts are under an Activity filter.",
          "A network with no comments to read says so on the page: LinkedIn needs LinkedIn's approval, and X charges for reading.",
        ],
      },
      {
        heading: "Custom inboxes",
        bullets: [
          "Pick the accounts each inbox holds, for example one inbox per brand. An account can be in more than one.",
          "Filter by kind: comments, mentions or DMs. An inbox of comments and mentions only is a comments inbox.",
          "Filter by keyword, or show only what nobody has answered yet.",
          "Everyone on the team sees the same inboxes.",
        ],
      },
      {
        heading: "Answering",
        bullets: [
          "Reply under a comment or mention, and answer a DM in its conversation, without leaving SocialReins.",
          "DMs with one person are grouped into one conversation, shown as a chat.",
          "Search the inbox or the comments by text or by author.",
          "Assign an item to a teammate, or to yourself.",
          "Keep saved replies and insert one into the reply box.",
          "Keyboard shortcuts move between items, mark one done, assign it and start a reply.",
          "New items are fetched about once a minute, and an open inbox refreshes by itself.",
          "On Bluesky, DMs are read only when the app password allows them.",
          "Threads: replies to your posts and posts that mention you arrive, about every 5 minutes. Threads has no DMs, so there are none to read or send. Reply under a reply or a mention, and hide or show a reply directly under your post. An app cannot like, repost or follow there. An account connected before replies were added needs to be connected again once, and until Meta approves the reply and mention permissions only the app's testers can use them.",
          "X charges for every post, user and DM it returns, so an X inbox is off until you turn it on for an account. You choose how often it is read and the most it may spend a month, and it stops when that is used up or X is out of credits. Reply, like, repost and hide a reply from the inbox. X takes a DM only from an account the person follows or when their DMs are open.",
          "YouTube comments on your videos and Shorts arrive too, with the video's title and thumbnail above each one and a reply shown under the comment it answers. YouTube gives every app a daily quota shared by all its users, so a YouTube inbox is off until you turn it on for a channel, and you choose how often it is read and how many quota units it may use a day. You can reply in public, hold a comment for review, publish it again, reject it for good, ban its author and delete your own reply. YouTube has no DMs and no like for comments in its API. A comment is kept here for 30 days, as YouTube requires.",
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
      { name: "Triggers", text: "Start from a comment keyword, a DM keyword, a first message, a new follower, a like or a repost of your post (those three on Bluesky), a mention, a story reply or a button tap." },
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
