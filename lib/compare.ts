// SocialReins next to other tools, for the public /compare pages. Everything about another tool
// comes from its own website on CHECKED and is listed under `sources`; where its site says nothing,
// the cell says so. Re-check a tool's sources before changing its cells.
export const CHECKED = "13 November 2026";

export type Row = { topic: string; us: string; them: string };
export type Rival = {
  slug: string;
  name: string;
  // For search results: 110 to 160 characters (tests/e2e/seo.spec.ts).
  description: string;
  // One or two sentences on what kind of tool it is.
  intro: string;
  rows: Row[];
  pickThem: string[];
  pickUs: string[];
  sources: string[];
};

const us = {
  networks: "8: Facebook Pages, Instagram, Threads, LinkedIn, Bluesky, X, TikTok and YouTube.",
  source: "Open source (AGPL-3.0). You can run it on your own server.",
  api: "REST API, MCP server and signed webhooks.",
  price: "Free to self-host. A paid hosted version is coming; join the waitlist.",
  inbox: "Comments and DMs from Bluesky, Facebook Pages and Instagram in one inbox.",
  automation: "Comment-to-DM by keyword. Live on Bluesky; Facebook and Instagram are in testing.",
  analytics: "No analytics yet.",
  ai: "No built-in AI writer. Your own AI agents can post through the API or MCP server.",
  team: "Teams with owner, admin and member roles. No approval steps yet.",
  takeDown: "Yes. A published post comes down from every network in one step.",
  posts: "First comment, threads, carousels and a separate caption for each network.",
};

export const rivals: Rival[] = [
  {
    slug: "postsyncer",
    name: "PostSyncer",
    description: "SocialReins and PostSyncer side by side: networks, open source and self-hosting, API, inbox, automations, analytics and price.",
    intro: "PostSyncer is a hosted social media scheduler with AI content tools and an API.",
    rows: [
      { topic: "Networks you can post to", us: us.networks, them: "11: X, Facebook, Instagram, TikTok, YouTube, Pinterest, Threads, Telegram, LinkedIn, Bluesky and Mastodon." },
      { topic: "Open source and self-hosting", us: us.source, them: "Hosted only. Its site says it has no self-hosted option." },
      { topic: "API", us: us.api, them: "REST API, MCP server and a CLI. Posting through the API is capped at 100 posts a day." },
      { topic: "Price", us: us.price, them: "No free plan; a 7-day trial. Starter is $29 a month for 10 social accounts." },
      { topic: "Inbox", us: us.inbox, them: "A comments inbox with moderation. DMs are not mentioned." },
      { topic: "Automations", us: us.automation, them: "AI auto-replies to comments and recurring queues. Comment-to-DM is not mentioned." },
      { topic: "Analytics", us: us.analytics, them: "Yes. Basic on Starter, advanced on higher plans." },
      { topic: "AI", us: us.ai, them: "Yes: captions, hooks, hashtags, and image and video generation." },
      { topic: "Teams", us: us.team, them: "Unlimited members, roles and approval workflows." },
      { topic: "Post features", us: us.posts, them: "First comment, threads, carousels and bulk upload from a CSV file." },
      { topic: "Take a published post down", us: us.takeDown, them: "Its API deletes a post and cancels its schedule. Removing it from the network is not mentioned." },
    ],
    pickThem: ["You post to Pinterest, Telegram or Mastodon.", "You want analytics and AI writing in the same tool.", "You need approval steps before a post goes out."],
    pickUs: ["You want open source that you can run yourself.", "You want DMs as well as comments in your inbox.", "You want to pull a published post back from every network at once."],
    sources: ["https://postsyncer.com", "https://postsyncer.com/pricing", "https://postsyncer.com/social-media-api", "https://docs.postsyncer.com/rate-limits.md"],
  },
  {
    slug: "manychat",
    name: "Manychat",
    description: "SocialReins and Manychat side by side: one publishes and schedules posts, the other automates chats. See what each does and costs.",
    intro: "Manychat is a chat automation tool: it answers DMs and comments for you. It is a different kind of tool from a post scheduler, and many teams use one of each.",
    rows: [
      { topic: "What it is for", us: "Publishing and scheduling posts, with an inbox and simple automations.", them: "Automating conversations in DMs and comments." },
      { topic: "Scheduling posts to your feed", us: "Yes, to 8 networks.", them: "Not listed. Its plans cover message and comment automation and broadcasts." },
      { topic: "Channels", us: us.networks, them: "Instagram, Messenger, TikTok, Telegram, WhatsApp, SMS and email." },
      { topic: "Open source and self-hosting", us: us.source, them: "Sold as a hosted subscription." },
      { topic: "API", us: us.api, them: "API access on higher plans, plus Zapier, Make and other ready-made integrations." },
      { topic: "Price", us: us.price, them: "Free plan for 25 active contacts. Paid plans start at $17 a month and grow with your active contacts." },
      { topic: "Inbox", us: us.inbox, them: "One inbox for every connected channel, with a mobile app." },
      { topic: "Automations", us: us.automation, them: "Comment to DM, keyword triggers, story replies, follow to DM and more." },
      { topic: "AI", us: us.ai, them: "AI replies, AI comments and AI steps, on Pro and above." },
      { topic: "Teams", us: us.team, them: "1 to 10 users, depending on the plan." },
    ],
    pickThem: ["DM automation is the main thing you need.", "You sell or support through WhatsApp, SMS or email.", "You want AI to answer messages for you."],
    pickUs: ["You need to publish and schedule posts.", "One simple comment-to-DM rule is enough for you.", "You want open source that you can run yourself."],
    sources: ["https://manychat.com/pricing", "https://help.manychat.com/en/articles/17742197-pro-plan"],
  },
  {
    slug: "buffer",
    name: "Buffer",
    description: "SocialReins and Buffer side by side: networks, open source and self-hosting, API, inbox, analytics, deleting posts and price.",
    intro: "Buffer is a long-running hosted social media scheduler with a free plan.",
    rows: [
      { topic: "Networks you can post to", us: us.networks, them: "12: Bluesky, Facebook, Google Business Profile, Instagram, LinkedIn, Mastodon, Pinterest, Substack, Threads, TikTok, X and YouTube." },
      { topic: "Open source and self-hosting", us: us.source, them: "Not open source." },
      { topic: "API", us: us.api, them: "GraphQL API on every plan and an MCP server. No webhooks; its docs say to poll." },
      { topic: "Price", us: us.price, them: "Free plan for 3 channels. Paid plans start at $5 a month for each channel." },
      { topic: "Inbox", us: us.inbox, them: "A comments inbox on 10 networks. No DMs." },
      { topic: "Automations", us: us.automation, them: "Saved replies. Comment-to-DM is not mentioned." },
      { topic: "Analytics", us: us.analytics, them: "Yes. 30 days of history on Free, reports on paid plans." },
      { topic: "AI", us: us.ai, them: "An AI Assistant on every plan." },
      { topic: "Teams", us: us.team, them: "One user on Free and Essentials. Unlimited members and approvals on Team." },
      { topic: "Post features", us: us.posts, them: "First comment and unlimited threads on paid plans; Instagram carousels." },
      { topic: "Take a published post down", us: us.takeDown, them: "No. Its help says Buffer cannot delete published posts." },
    ],
    pickThem: ["You want a free hosted plan today.", "You post to Pinterest, Mastodon or Google Business Profile.", "You want analytics and an AI assistant."],
    pickUs: ["You want open source that you can run yourself.", "You want DMs in your inbox and comment-to-DM.", "You want to pull a published post back from every network at once."],
    sources: ["https://buffer.com/pricing", "https://developers.buffer.com/guides/integrations/mcp.md", "https://support.buffer.com/article/921-engaging-with-community-comments-in-buffer", "https://support.buffer.com/article/642-scheduling-posts"],
  },
  {
    slug: "hootsuite",
    name: "Hootsuite",
    description: "SocialReins and Hootsuite side by side: networks, open source and self-hosting, API, inbox, automations, analytics and price.",
    intro: "Hootsuite is a hosted social media management suite for larger teams, priced per user.",
    rows: [
      { topic: "Networks you can post to", us: us.networks, them: "9: Instagram, Facebook, TikTok, YouTube, X, LinkedIn, Threads, Pinterest and Bluesky." },
      { topic: "Open source and self-hosting", us: us.source, them: "Sold as a hosted subscription." },
      { topic: "API", us: us.api, them: "REST API (a developer account needs approval), MCP servers and webhooks." },
      { topic: "Price", us: us.price, them: "No free plan; a 14-day trial. Standard is $99 a month for each user, billed yearly, with 10 social accounts." },
      { topic: "Inbox", us: us.inbox, them: "Comments and DMs for Facebook, Instagram, X, WhatsApp, TikTok, LinkedIn and Threads." },
      { topic: "Automations", us: us.automation, them: "Saved replies, auto-responders and Instagram comment-to-DM, on higher plans." },
      { topic: "Analytics", us: us.analytics, them: "Yes. Reports and benchmarking against competitors." },
      { topic: "AI", us: us.ai, them: "Yes: AI post and image generation." },
      { topic: "Teams", us: us.team, them: "Priced per user. Approvals come with the Advanced plan." },
    ],
    pickThem: ["You need deep reporting and competitor benchmarks.", "You answer customers on X, WhatsApp, TikTok or LinkedIn from one inbox.", "You need approvals across a large team."],
    pickUs: ["You want open source that you can run yourself.", "You do not want to pay for every user.", "You want an API you can use without waiting for approval."],
    sources: ["https://www.hootsuite.com/plans", "https://www.hootsuite.com/platform/integrations", "https://www.hootsuite.com/platform/social-media-inbox", "https://developer.hootsuite.com/docs/api-overview"],
  },
  {
    slug: "later",
    name: "Later",
    description: "SocialReins and Later side by side: networks, open source and self-hosting, API, inbox, analytics, deleting posts and price.",
    intro: "Later is a hosted social media scheduler best known for Instagram and visual planning.",
    rows: [
      { topic: "Networks you can post to", us: us.networks, them: "8: Instagram, Facebook, TikTok, Threads, YouTube, Pinterest, LinkedIn and Snapchat." },
      { topic: "Open source and self-hosting", us: us.source, them: "Sold as a hosted subscription." },
      { topic: "API", us: us.api, them: "No public API is mentioned on its site." },
      { topic: "Price", us: us.price, them: "No free plan shown; a 14-day trial. Starter is $18.75 a month, billed yearly, for 1 user." },
      { topic: "Inbox", us: us.inbox, them: "On the Growth and Scale plans: Instagram and Facebook DMs and comments, and TikTok comments." },
      { topic: "Automations", us: us.automation, them: "No built-in comment-to-DM was found." },
      { topic: "Analytics", us: us.analytics, them: "Yes. 3 months to 2 years of history, depending on the plan." },
      { topic: "AI", us: us.ai, them: "A caption writer and post ideas, on monthly credits." },
      { topic: "Teams", us: us.team, them: "1 to 4 users by plan. Approvals from the Growth plan." },
      { topic: "Post features", us: us.posts, them: "Instagram first comment and carousels." },
      { topic: "Take a published post down", us: us.takeDown, them: "No. Its help says a published post cannot be deleted from Later." },
    ],
    pickThem: ["You post to Pinterest or Snapchat.", "You want analytics and a visual planner for Instagram.", "You want AI caption ideas."],
    pickUs: ["You post to X or Bluesky.", "You need an API or an MCP server.", "You want open source that you can run yourself."],
    sources: ["https://later.com/pricing/", "https://help.later.com/hc/en-us/articles/31010972850199-Manage-DMs-Comments-in-Later-with-Social-Inbox", "https://help.later.com/hc/en-us/articles/360043245633-Edit-or-Delete-a-Post"],
  },
  {
    slug: "postiz",
    name: "Postiz",
    description: "SocialReins and Postiz side by side: two open-source schedulers compared on networks, API, inbox, automations, analytics and price.",
    intro: "Postiz is an open-source social media scheduler that you can self-host or use as a cloud service.",
    rows: [
      { topic: "Networks you can post to", us: us.networks, them: "30. The 8 that SocialReins has, plus Reddit, Pinterest, Mastodon, Telegram, Discord and more." },
      { topic: "Open source and self-hosting", us: us.source, them: "Open source (AGPL-3.0) and self-hostable." },
      { topic: "API", us: us.api, them: "REST API, MCP server, webhooks and a CLI." },
      { topic: "Price", us: us.price, them: "Free to self-host. The cloud has no free plan; Standard is $29 a month for 5 channels." },
      { topic: "Inbox", us: us.inbox, them: "No inbox for comments or DMs is mentioned." },
      { topic: "Automations", us: us.automation, them: "Auto-repost or a follow-up post at a set number of likes, and posting from RSS. No comment-to-DM." },
      { topic: "Analytics", us: us.analytics, them: "Yes, for each channel and each post." },
      { topic: "AI", us: us.ai, them: "Yes: a copilot, and image and video generation." },
      { topic: "Teams", us: us.team, them: "From the Team plan, $39 a month on the cloud." },
      { topic: "Post features", us: us.posts, them: "Threads and follow-up comments on most networks; LinkedIn carousels." },
      { topic: "Take a published post down", us: us.takeDown, them: "Delete exists. Whether it removes the live post from the network is not stated." },
    ],
    pickThem: ["You post to many more networks, such as Reddit, Pinterest or Mastodon.", "You want analytics and AI generation built in.", "You want a cloud plan you can pay for today."],
    pickUs: ["You want comments and DMs in an inbox, with comment-to-DM.", "You want to pull a published post back from every network at once.", "You want one caption per network and sets for each brand or language."],
    sources: ["https://postiz.com/", "https://postiz.com/pricing", "https://github.com/gitroomhq/postiz-app", "https://docs.postiz.com/public-api/introduction"],
  },
];

export const rival = (slug: string) => rivals.find((r) => r.slug === slug);
