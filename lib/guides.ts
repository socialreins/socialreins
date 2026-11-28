// The public /guides pages: practical articles for the people who run social accounts, not feature lists.
// Facts about SocialReins follow lib/features.ts, lib/compare.ts and components/docs.tsx; change them together.
// No statistics, customer counts or quotes: a number here comes from the product's own code or docs.
export type Faq = { question: string; answer: string };

export type Guide = {
  slug: string;
  // The page heading and the share title. Unique across the guides (tests/unit/guides.test.ts).
  title: string;
  // For search results: 110 to 160 characters (tests/e2e/seo.spec.ts).
  description: string;
  // Search terms, kept short and honest: things the article actually covers.
  keywords: string[];
  // One or two sentences under the heading and on the index card.
  intro: string;
  // A date, so the page and the feed can show it and sort by it.
  updated: string;
  // Two other guides, shown at the end; the article also links to product pages in its own text.
  related: string[];
  faq: Faq[];
};

export const author = "The SocialReins team";

export const guides: Guide[] = [
  {
    slug: "schedule-post-to-several-networks",
    title: "How to schedule a post to several social networks at once",
    description:
      "The steps to schedule one post to several social networks in SocialReins, with a separate caption and media for each, and the limits to plan for.",
    keywords: ["schedule a post to multiple networks", "cross-posting social media", "social media scheduler", "per-network captions"],
    intro:
      "One post can go to several networks at once, and each network can get its own text and media. This is the core flow, with the limits to plan for.",
    updated: "2026-11-28",
    related: ["posting-cadence-small-team", "social-media-approval-workflow"],
    faq: [
      {
        question: "Can each network have its own caption and media?",
        answer:
          "Yes. With two or more networks ticked, each has its own tab where the text and the images or video can differ. The post stays one post in Posts, the calendar and analytics.",
      },
      {
        question: "Why did a scheduled post fail on one network only?",
        answer:
          "Each account gets its own result. When a network refuses a post, the post page shows that account's failure and the reason, while the other accounts keep their own state. Missing media is a common cause, because some networks will not take a post without it.",
      },
      {
        question: "Can I schedule a TikTok post in advance?",
        answer:
          "You can put a TikTok post in the composer and give it a time, but TikTok asks a person to confirm each post, so it is never posted from a CSV file and it cannot repeat. Keep TikTok for a moment when you can confirm it.",
      },
    ],
  },
  {
    slug: "social-media-approval-workflow",
    title: "Running a social media approval workflow with a small team",
    description:
      "How to run a post approval workflow in SocialReins: the roles, the switch on the Team page, what a reviewer sees, and a rhythm that keeps work moving.",
    keywords: ["social media approval workflow", "post approvals", "content review process", "small marketing team"],
    intro:
      "Approvals hold a member's scheduled post until an owner or admin says yes. Here is how the switch, the badges and the review work, and how to keep it from becoming a bottleneck.",
    updated: "2026-11-28",
    related: ["schedule-post-to-several-networks", "posting-cadence-small-team"],
    faq: [
      {
        question: "Do owners and admins need approval for their own posts?",
        answer: "No. Approvals apply to members' posts. An owner or admin approves or requests changes, and their own posts go out as before.",
      },
      {
        question: "What does the author see after a rejection?",
        answer:
          "The post shows Changes requested with the reviewer's note. The author can edit the post and schedule it again, and the note stays with the post so the team can read it later.",
      },
      {
        question: "How long can the note be?",
        answer: "500 characters. That is enough for one or two concrete changes, which is usually more useful than a long list.",
      },
    ],
  },
  {
    slug: "self-hosting-a-social-media-scheduler",
    title: "Self-hosting a social media scheduler: what it takes",
    description:
      "What self-hosting a social media scheduler takes: Docker, Postgres, media storage, network apps, TLS, mail, backups, and the work that stays yours.",
    keywords: ["self-hosted social media scheduler", "open source social media tool", "Docker Compose", "social media server"],
    intro:
      "SocialReins runs on your own server as three containers. This guide covers what you need, what you must register, what to back up, and what nobody will do for you.",
    updated: "2026-11-28",
    related: ["open-source-vs-hosted-social-media-tools", "social-inbox-automations"],
    faq: [
      {
        question: "What do I need to run it?",
        answer:
          "A machine with Docker and Docker Compose, a Postgres database (the Compose file runs one), and somewhere for uploaded media: a directory on local disk or an S3-compatible bucket. A public install also needs a domain, a reverse proxy and TLS.",
      },
      {
        question: "Do I have to create an app for every network?",
        answer:
          "For Facebook Pages, Instagram, Threads, LinkedIn, X, TikTok, YouTube and Pinterest, yes: your own developer app, its keys in .env and its redirect address registered with the network. Bluesky needs no app, only an app password for the account.",
      },
      {
        question: "What must I back up?",
        answer:
          "The Postgres database and ENCRYPTION_KEY. The key decrypts the connected accounts' tokens, so a database restored without it means reconnecting every account. Keep the two together and test a restore.",
      },
    ],
  },
  {
    slug: "social-inbox-automations",
    title: "Social inbox and automations: what a small team can automate",
    description:
      "What a small team can automate in SocialReins: inbox triggers and actions, what each network allows, and where a person still has to answer.",
    keywords: ["social media automations", "comment to DM", "social inbox", "automation triggers"],
    intro:
      "Automations answer comments and DMs while you are busy. This guide covers the triggers and actions that exist, the limits each network sets, and where a person still has to step in.",
    updated: "2026-11-28",
    related: ["social-media-approval-workflow", "self-hosting-a-social-media-scheduler"],
    faq: [
      {
        question: "Which network do automations work on today?",
        answer:
          "Bluesky works end to end. Facebook Pages, Instagram, X, Threads and YouTube are in testing, within the limits in this guide. LinkedIn is built and switched off until LinkedIn approves the app, and Pinterest has no inbox or automations.",
      },
      {
        question: "Can an automation answer the same person twice?",
        answer:
          "Each comment or message is acted on once, and you choose whether an automation answers each person once or every time they comment. A cool-down, a daily limit and the pause switch on the Team page keep one conversation from running away.",
      },
      {
        question: "What happens when a network refuses a DM?",
        answer:
          "The run log keeps the reason. If you set a fallback public reply, it answers where the network allows one. A send that was refused for rate limiting is tried again; any other failure is final, so nobody gets the same message twice.",
      },
    ],
  },
  {
    slug: "open-source-vs-hosted-social-media-tools",
    title: "Open source versus hosted social media tools: how to choose",
    description:
      "How to choose between an open-source social media tool and a hosted one: control, cost, maintenance, network apps, and the questions that decide it.",
    keywords: ["open source social media tool", "hosted social media scheduler", "self-hosted vs SaaS", "social media tool comparison"],
    intro:
      "Both kinds of tool can publish a post. The choice is really about who runs the servers, who owns the network apps, and what you want to spend your time on.",
    updated: "2026-11-28",
    related: ["self-hosting-a-social-media-scheduler", "posting-cadence-small-team"],
    faq: [
      {
        question: "Is open source always cheaper?",
        answer:
          "No. Self-hosting has no licence fee, but you pay for the server, your time and the network apps. A hosted plan has a price you can set against that work. Which is cheaper depends on what your team is good at and how much control you need.",
      },
      {
        question: "Can I move from a hosted tool to a self-hosted one?",
        answer:
          "Your posts and media are yours, but every tool exports different things and some export very little. Check what you can export before you switch, and move a small set of accounts first.",
      },
      {
        question: "Where can I see the differences tool by tool?",
        answer:
          "The compare pages put SocialReins next to each tool on networks, open source, API, inbox, automations, analytics and price, with the date each tool's own site was read.",
      },
    ],
  },
  {
    slug: "posting-cadence-small-team",
    title: "A realistic posting cadence for a 1 to 5 person team",
    description:
      "A practical posting rhythm for one to five people: how many posts, which networks, how to batch and review, with opinion clearly marked as opinion.",
    keywords: ["social media posting schedule", "small team social media", "content calendar", "posting frequency"],
    intro:
      "There is no universal right number of posts. This is a practical starting rhythm for a small team, with the opinion parts labelled.",
    updated: "2026-11-28",
    related: ["schedule-post-to-several-networks", "social-media-approval-workflow"],
    faq: [
      {
        question: "How many posts should a small team publish a week?",
        answer:
          "There is no number that fits every account. Our opinion: start with one post on each working day on one or two networks, keep it for a month, and add a network only when the first one is easy to fill.",
      },
      {
        question: "Is it bad to post the same text everywhere?",
        answer:
          "It is not bad, but it wastes the format. A 300-character Bluesky post, a 500-character Threads post and a YouTube title are different jobs. The per-network tabs exist so one post can fit each.",
      },
      {
        question: "How do we keep going when someone is away?",
        answer:
          "Plan a week ahead with the queue, keep captions and media in the library, and let an owner or admin approve the week before it goes out. A cadence that needs one person every day is fragile.",
      },
    ],
  },
];

export const guide = (slug: string) => guides.find((g) => g.slug === slug);

// "28 November 2026", the site's date style (components/legal-page.tsx).
export function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export const site = "https://socialreins.com";
