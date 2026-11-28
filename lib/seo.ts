import type { Metadata, MetadataRoute } from "next";
import { rivals } from "@/lib/compare";
import { features } from "@/lib/features";
import { org } from "@/lib/github";
import { guides as articles } from "@/lib/guides";
import { networks } from "@/lib/networks";
import { plans } from "@/lib/pricing";

// The one table of public pages: their titles, descriptions, keywords, canonical path and sitemap
// settings. Pages read it with pageMetadata(), app/sitemap.ts and app/llms.txt/route.ts read the same
// entries, and tests/unit/seo.test.ts holds it to the rules (unique titles, honest description length,
// no em dashes). Add a public page here, not in the page file, so nothing can drift.

export const SITE_URL = "https://socialreins.com";
export const SITE_NAME = "SocialReins";
export const SITE_DESCRIPTION =
  "Open-source social media manager for Facebook, Instagram, Threads, LinkedIn, Bluesky, X, TikTok, YouTube and Pinterest. Self-host it free; Cloud is not open.";

// The share image files are app/opengraph-image.png and app/twitter-image.png; their .alt.txt files hold
// the same words. A page-level openGraph replaces the file-based image, so name it again here.
const SHARE_ALT = "SocialReins: every social account, one set of reins. Open-source social media manager.";
const OG_IMAGE = { url: "/opengraph-image.png", type: "image/png", width: 1200, height: 630, alt: SHARE_ALT };
const TWITTER_IMAGE = { url: "/twitter-image.png", type: "image/png", width: 1200, height: 630, alt: SHARE_ALT };

export type ChangeFrequency = "weekly" | "monthly" | "yearly";

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  priority: number;
  changeFrequency: ChangeFrequency;
  // Only where the content itself carries a date that moved. A build date is not a page change.
  lastModified?: string;
};

// The page's own last update, the date its policy text shows.
const LEGAL_UPDATED = "2026-11-26";

// lib/compare.ts keeps each rival's cells checked against its own site on a printed date; the page shows
// that date, so it is the honest last change for the page.
function isoDate(printed: string): string {
  return new Date(`${printed} UTC`).toISOString().slice(0, 10);
}

export type Mode = "self-hosted" | "cloud";
export type Guide = "start" | "use" | "ai" | "apps";

export const docPath = (mode: Mode, guide: Guide) => `/docs/${mode}${guide === "start" ? "" : `/${guide}`}`;

// The guide's heading on its page and its title in search results.
export const docTitles: Record<Guide, Record<Mode, string>> = {
  start: { "self-hosted": "Install SocialReins on your own server", cloud: "Get started with SocialReins Cloud" },
  use: { "self-hosted": "Connect accounts and publish, self-hosted", cloud: "Connect accounts and publish on SocialReins Cloud" },
  ai: { "self-hosted": "Connect an AI assistant to your own SocialReins", cloud: "Connect an AI assistant to SocialReins Cloud" },
  apps: { "self-hosted": "Create the network apps for your own SocialReins", cloud: "Network apps on SocialReins Cloud" },
};

const docDescriptions: Record<Guide, Record<Mode, string>> = {
  start: {
    "self-hosted": "Install SocialReins on your own server with Docker Compose: the settings to change, the first sign-in, domains, updates and the platform apps.",
    cloud: "SocialReins Cloud is not open yet. Join the waitlist to hear when it opens, or self-host SocialReins for free today with the same features.",
  },
  use: {
    "self-hosted": "How to use your own SocialReins install: connect accounts, schedule posts, set up the queue, feeds, approvals, the inbox, automations and more.",
    cloud: "How SocialReins Cloud works once you have an account: connect accounts, schedule posts, set up the queue, feeds, approvals, the inbox and more.",
  },
  ai: {
    "self-hosted": "Connect Claude or another AI assistant to your own SocialReins install through its MCP server, using an API token you create in the app.",
    cloud: "Connect Claude or another AI assistant to SocialReins Cloud through its MCP server, using an API token you create in the app.",
  },
  apps: {
    "self-hosted": "Create the developer app for each network, register the redirect address and add the keys to your own SocialReins install.",
    cloud: "On SocialReins Cloud we register the developer apps with each network for you, so you only connect your accounts.",
  },
};

const docKeywords: Record<Guide, Record<Mode, string[]>> = {
  start: {
    "self-hosted": ["self-hosted social media manager", "install social media scheduler", "socialreins docker install"],
    cloud: ["social media manager cloud", "hosted social media scheduler", "socialreins cloud"],
  },
  use: {
    "self-hosted": ["social media scheduler guide", "connect social accounts", "social media posting setup"],
    cloud: ["social media scheduler guide", "connect social accounts", "social media posting setup"],
  },
  ai: {
    "self-hosted": ["social media mcp server", "ai social media assistant", "socialreins api token"],
    cloud: ["social media mcp server", "ai social media assistant", "socialreins api token"],
  },
  apps: {
    "self-hosted": ["social media developer app", "social network api keys", "socialreins network apps"],
    cloud: ["socialreins network apps", "social media app approval", "hosted social media scheduler"],
  },
};

const docs: SeoPage[] = (["self-hosted", "cloud"] as Mode[]).flatMap((mode) =>
  (Object.keys(docTitles) as Guide[]).map((guide) => ({
    path: docPath(mode, guide),
    title: docTitles[guide][mode],
    description: docDescriptions[guide][mode],
    keywords: docKeywords[guide][mode],
    priority: guide === "start" ? 0.7 : 0.6,
    changeFrequency: "monthly" as const,
  })),
);

export const seoPages: SeoPage[] = [
  {
    path: "/",
    title: `${SITE_NAME}: open-source social media manager`,
    description: SITE_DESCRIPTION,
    keywords: ["social media manager", "open source social media scheduler", "self-hosted social media tool", "social media scheduling"],
    priority: 1,
    changeFrequency: "weekly",
  },
  {
    path: "/contact",
    title: "Contact: SocialReins",
    description: "Send the SocialReins team a message with a question or feedback about the open-source social media manager. We reply by email.",
    keywords: ["contact socialreins", "social media manager support"],
    priority: 0.4,
    changeFrequency: "yearly",
  },
  {
    path: "/privacy",
    title: "Privacy Policy: SocialReins",
    description: "What SocialReins stores about you, why, the cookies it sets, how long it keeps data and how to have your account and its data deleted.",
    keywords: ["socialreins privacy policy", "social media manager privacy"],
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: LEGAL_UPDATED,
  },
  {
    path: "/terms",
    title: "Terms of Service: SocialReins",
    description: "The terms for using socialreins.com: the open-source licence, accounts, acceptable use, payments, ending your account and the law that applies.",
    keywords: ["socialreins terms", "social media manager terms of service"],
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: LEGAL_UPDATED,
  },
  {
    path: "/data-deletion",
    title: "Data Deletion: SocialReins",
    description: "How to delete what SocialReins stores: disconnect an account, delete your account in the app, or ask us by email, and what backups keep for 30 days.",
    keywords: ["delete socialreins account", "social media manager data deletion"],
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: LEGAL_UPDATED,
  },
  {
    path: "/post-types",
    title: "What you can post where: SocialReins",
    description: "Text, images, videos, carousels, Reels, documents, threads and first comments: what SocialReins can post on each social network today.",
    keywords: ["social media post types", "post formats by network", "social media character limits"],
    priority: 0.7,
    changeFrequency: "monthly",
  },
  {
    path: "/socials",
    title: "Supported social media: SocialReins",
    description: "Every social network SocialReins posts to: Bluesky, Threads, LinkedIn, Facebook, Instagram, YouTube, X, TikTok and Pinterest, each with its own page.",
    keywords: ["supported social networks", "social media integrations", "social media accounts"],
    priority: 0.7,
    changeFrequency: "monthly",
  },
  {
    path: "/features",
    title: "Features: SocialReins",
    description: "Everything SocialReins does today: publishing to nine networks, scheduling, teams, post analytics, an API and an MCP server, with an inbox live on Bluesky.",
    keywords: ["social media management features", "social media scheduler features", "open source social media tool"],
    priority: 0.8,
    changeFrequency: "monthly",
  },
  ...features.map(
    (f): SeoPage => ({
      path: `/features/${f.slug}`,
      title: `${f.name}: SocialReins`,
      description: f.description,
      keywords: [`social media ${f.name.toLowerCase()}`, "open source social media tool", "social media manager for teams"],
      priority: 0.7,
      changeFrequency: "monthly",
    }),
  ),
  {
    path: "/pricing",
    title: "Pricing: SocialReins",
    description: "SocialReins Cloud: Scheduler $190 a year or $19 a month, with Automation $490 or $49. A 7-day free trial on a first plan. Self-hosting is free.",
    keywords: ["social media manager pricing", "self-hosted social media pricing", "social media scheduler cost"],
    priority: 0.9,
    changeFrequency: "monthly",
  },
  {
    path: "/docs",
    title: "Docs: SocialReins",
    description: "SocialReins docs: install it on your own server, connect accounts and publish, and connect an AI assistant. For self-hosted and cloud.",
    keywords: ["socialreins docs", "self-hosted social media manager install", "social media manager setup"],
    priority: 0.7,
    changeFrequency: "monthly",
  },
  ...docs,
  {
    path: "/guides",
    title: "Guides: SocialReins",
    description: "Practical guides to scheduling, approvals, self-hosting, inboxes and automations for small teams, from the team that builds SocialReins.",
    keywords: ["social media guides", "social media scheduling", "social media approvals", "self-hosted social media"],
    priority: 0.7,
    changeFrequency: "monthly",
  },
  ...articles.map(
    (g): SeoPage => ({
      path: `/guides/${g.slug}`,
      title: `${g.title}: SocialReins`,
      description: g.description,
      keywords: g.keywords,
      priority: 0.6,
      changeFrequency: "monthly",
      lastModified: g.updated,
    }),
  ),
  ...networks.map(
    (n): SeoPage => ({
      path: `/${n.slug}`,
      title: `What you can post to ${n.name}: SocialReins`,
      description: n.description,
      keywords: [`post to ${n.name}`, `${n.name} social media scheduler`, "social media post types"],
      priority: 0.6,
      changeFrequency: "monthly",
    }),
  ),
  {
    path: "/compare",
    title: "Compare SocialReins with other tools: SocialReins",
    description: "SocialReins next to Buffer, Postiz, PostSyncer, Post Bridge, Manychat and more: what each one does, what it costs and where it fits.",
    keywords: ["social media manager comparison", "social media tool alternatives", "buffer alternative"],
    priority: 0.7,
    changeFrequency: "monthly",
  },
  ...rivals.map(
    (r): SeoPage => ({
      path: `/compare/${r.slug}`,
      title: `SocialReins vs ${r.name}: SocialReins`,
      description: r.description,
      keywords: [`socialreins vs ${r.name.toLowerCase()}`, `${r.name} alternative`, "social media manager comparison"],
      priority: 0.5,
      changeFrequency: "monthly",
      lastModified: isoDate(r.checked),
    }),
  ),
];

export function seoPage(path: string): SeoPage {
  const page = seoPages.find((p) => p.path === path);
  if (!page) throw new Error(`No SEO entry for ${path}; add it to seoPages in lib/seo.ts`);
  return page;
}

export function pageMetadata(path: string): Metadata {
  const page = seoPage(path);
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: SITE_NAME,
      title: page.title,
      description: page.description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [TWITTER_IMAGE],
    },
  };
}

// Structured data. One block per type on a page: Organization, WebSite and SoftwareApplication come from
// the root layout, and a page adds only BreadcrumbList and/or FAQPage.
export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  sameAs: [org],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "en",
};

export const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  isAccessibleForFree: true,
  offers: plans.map((p) => ({
    "@type": "Offer",
    name: p.name,
    price: p.offer.price,
    priceCurrency: p.offer.priceCurrency,
    description: `${p.price}. ${p.note}`,
  })),
};

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path === "/" ? "" : item.path}`,
    })),
  };
}

export function faqSchema(pairs: [string, string][], url?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(url ? { url } : {}),
    mainEntity: pairs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

// app/sitemap.ts: the same table, minus a lastModified we do not really have.
export function sitemapEntries(): MetadataRoute.Sitemap {
  return seoPages.map((p) => ({
    url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
    lastModified: p.lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}

// app/llms.txt/route.ts: plain text for AI assistants, built from the same table.
export function llmsTxt(): string {
  const group = (path: string) => (path.startsWith("/docs") ? "Docs" : path.startsWith("/compare/") ? "Compare" : null);
  const line = (p: SeoPage) => `- [${p.title}](${SITE_URL}${p.path === "/" ? "/" : p.path})`;
  const pages = seoPages.filter((p) => group(p.path) === null).map(line);
  const docs = seoPages.filter((p) => group(p.path) === "Docs").map(line);
  const compare = seoPages.filter((p) => group(p.path) === "Compare").map(line);
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "## Pages",
    "",
    ...pages,
    "",
    "## Docs",
    "",
    ...docs,
    "",
    "## Compare",
    "",
    ...compare,
    "",
    "## Source code",
    "",
    `- [SocialReins on GitHub](${organizationSchema.sameAs[0]})`,
    "",
  ].join("\n");
}
