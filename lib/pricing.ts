// The public pricing copy and the answers on /pricing, in one place: the page renders them and the
// SoftwareApplication and FAQPage structured data on /pricing read the same values.
// Decision 0006: USD, yearly (two months free) shown first. Cloud is invitation-only until open sign-up,
// so the button is still the waitlist.

export type Plan = {
  name: string;
  tag: string;
  price: string;
  note: string;
  points: string[];
  cta: { label: string; href: string; external: boolean };
  // The same price for schema.org Offer, in the unit the page shows first.
  offer: { price: string; priceCurrency: "USD" };
};

export const plans: Plan[] = [
  {
    name: "Scheduler",
    tag: "Cloud, not open yet",
    price: "$190 a year",
    note: "Or $19 a month. A team's first plan starts with a 7-day free trial.",
    points: [
      "10 connected accounts.",
      "3 team members.",
      "Scheduling, the calendar, queues, approvals and analytics.",
      "Nothing to install: we run it and register the apps with each network.",
      "1 inbox, to read and answer comments and DMs.",
      "No automations.",
    ],
    cta: { label: "Join the waitlist", href: "/#waitlist", external: false },
    offer: { price: "190", priceCurrency: "USD" },
  },
  {
    name: "Scheduler and Automation",
    tag: "Cloud, not open yet",
    price: "$490 a year",
    note: "Or $49 a month. A team's first plan starts with a 7-day free trial.",
    points: [
      "25 connected accounts.",
      "Unlimited team members.",
      "Everything in Scheduler.",
      "10 inboxes.",
      "Automations, broadcasts and newsletters, with 2,500 contacts.",
    ],
    cta: { label: "Join the waitlist", href: "/#waitlist", external: false },
    offer: { price: "490", priceCurrency: "USD" },
  },
  {
    name: "Self-hosted",
    tag: "Works today",
    price: "Free",
    note: "Open source, on your own server, free for good.",
    points: [
      "Every feature. There is no paid tier in the code.",
      "All nine networks, and you turn on only the ones you want.",
      "Your data stays on your own server, in your own Postgres database.",
      "One Docker Compose command to start, one line to update.",
      "You register your own developer app with each network you use, except Bluesky, which needs none.",
      "Report problems and ask questions on GitHub.",
    ],
    cta: { label: "Read the install guide", href: "/docs/self-hosted", external: false },
    offer: { price: "0", priceCurrency: "USD" },
  },
];

// The questions already answered on /pricing, word for word, for FAQPage structured data.
export const questions: [string, string][] = [
  ["Is the self-hosted version limited?", "No. There are no plan limits: it is the same code that runs the cloud version, under the AGPL-3.0 license, and nothing is held back for paying customers."],
  ["What does the cloud version cost?", "Scheduler is $190 a year or $19 a month. Scheduler and Automation is $490 a year or $49 a month. Yearly is two months free. Prices are in US dollars, and a team's first plan starts with a 7-day free trial."],
  ["Why do posts to X cost extra?", "X charges us for every post sent through its API, so posting to X on the cloud version uses prepaid credits: 100 posts for $5 or 500 for $20. Each part of a thread counts as one post. Credits never expire. The other networks do not charge for posting."],
  ["Can I cancel or get a refund?", "You can cancel at any time, and your plan keeps working until the end of the period you paid for. A period already started and credit packs are not refunded, except for a duplicate charge or our mistake; the free trial is the time to try it."],
  ["Does self-hosting cost anything at all?", "SocialReins itself is free. You pay for your own server, and X charges for its API. The other networks do not charge for posting."],
  ["Can I try the cloud version now?", "Not yet. SocialReins Cloud is open by invitation while we finish it. Join the waitlist and we email you when it opens. You can self-host today."],
];
