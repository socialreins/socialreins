import { describe, expect, it } from "vitest";
import { plans, questions } from "@/lib/pricing";
import {
  breadcrumbSchema,
  faqSchema,
  llmsTxt,
  organizationSchema,
  pageMetadata,
  seoPage,
  seoPages,
  sitemapEntries,
  softwareApplicationSchema,
  websiteSchema,
} from "@/lib/seo";
import { features } from "@/lib/features";

// The public metadata table is the one place titles, descriptions and sitemap settings live; these tests
// keep it honest (no duplicate titles, a description that fits a search result, no em dashes).

const emDash = "\u2014";

describe("the public page table", () => {
  it("has one entry per path", () => {
    const paths = seoPages.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("gives every page a unique title", () => {
    const titles = seoPages.map((p) => p.title.toLowerCase());
    const duplicates = titles.filter((t, i) => titles.indexOf(t) !== i);
    expect(duplicates).toEqual([]);
  });

  it("gives every page a unique description of 110 to 160 characters", () => {
    const descriptions = seoPages.map((p) => p.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const page of seoPages) {
      expect(page.description.length, page.path).toBeGreaterThanOrEqual(110);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
    }
  });

  it("gives every page a short keyword list with no em dashes", () => {
    for (const page of seoPages) {
      expect(page.keywords.length, page.path).toBeGreaterThanOrEqual(2);
      expect(page.keywords.length, page.path).toBeLessThanOrEqual(6);
      for (const keyword of page.keywords) expect(keyword).not.toContain(emDash);
    }
  });

  it("keeps copy free of em dashes", () => {
    for (const page of seoPages) {
      expect(page.title).not.toContain(emDash);
      expect(page.description).not.toContain(emDash);
    }
    for (const [question, answer] of questions) {
      expect(question).not.toContain(emDash);
      expect(answer).not.toContain(emDash);
    }
    for (const feature of features) {
      for (const [question, answer] of feature.faq ?? []) {
        expect(question).not.toContain(emDash);
        expect(answer).not.toContain(emDash);
      }
    }
  });

  it("keeps priorities between 0 and 1 and only honest dates", () => {
    for (const page of seoPages) {
      expect(page.priority).toBeGreaterThan(0);
      expect(page.priority).toBeLessThanOrEqual(1);
      if (page.lastModified) expect(page.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("throws on a path that is not public", () => {
    expect(() => seoPage("/admin")).toThrow(/No SEO entry/);
  });
});

describe("page metadata", () => {
  it("sets canonical, openGraph and twitter from the table", () => {
    const page = seoPage("/pricing");
    const metadata = pageMetadata("/pricing");
    expect(metadata.title).toBe(page.title);
    expect(metadata.description).toBe(page.description);
    expect(metadata.keywords).toEqual(page.keywords);
    expect(metadata.alternates?.canonical).toBe("/pricing");
    expect(metadata.openGraph).toMatchObject({ type: "website", url: "/pricing", siteName: "SocialReins", title: page.title, description: page.description });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: page.title, description: page.description });
  });

  it("names a share image on both networks", () => {
    const metadata = pageMetadata("/");
    const og = metadata.openGraph as { images: { url: string; alt: string }[] };
    const twitter = metadata.twitter as { images: { url: string; alt: string }[] };
    expect(og.images[0].url).toBe("/opengraph-image.png");
    expect(twitter.images[0].url).toBe("/twitter-image.png");
    expect(og.images[0].alt).toBe(twitter.images[0].alt);
  });
});

describe("structured data", () => {
  it("describes the organization and the site, with no search action", () => {
    expect(organizationSchema).toMatchObject({ "@type": "Organization", name: "SocialReins", url: "https://socialreins.com" });
    expect(websiteSchema).toMatchObject({ "@type": "WebSite", name: "SocialReins", url: "https://socialreins.com" });
    expect(websiteSchema).not.toHaveProperty("potentialAction");
  });

  it("describes the application with the plans the pricing page shows", () => {
    expect(softwareApplicationSchema).toMatchObject({
      "@type": "SoftwareApplication",
      name: "SocialReins",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
    });
    expect(softwareApplicationSchema.offers.map((o) => o.name)).toEqual(plans.map((p) => p.name));
    expect(softwareApplicationSchema.offers.map((o) => o.price)).toEqual(plans.map((p) => p.offer.price));
    expect(softwareApplicationSchema.offers[0]).toMatchObject({ price: "190", priceCurrency: "USD" });
    expect(JSON.stringify(softwareApplicationSchema)).not.toMatch(/AggregateRating|"Review"/);
  });

  it("builds a breadcrumb list with increasing positions", () => {
    const crumbs = breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Features", path: "/features" },
      { name: "Automations", path: "/features/automations" },
    ]);
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://socialreins.com" },
      { "@type": "ListItem", position: 2, name: "Features", item: "https://socialreins.com/features" },
      { "@type": "ListItem", position: 3, name: "Automations", item: "https://socialreins.com/features/automations" },
    ]);
  });

  it("builds a FAQ page from the answers the pages already give", () => {
    const faq = faqSchema(questions);
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toHaveLength(questions.length);
    expect(faq.mainEntity[0]).toMatchObject({ "@type": "Question", name: questions[0][0], acceptedAnswer: { "@type": "Answer", text: questions[0][1] } });
  });
});

describe("sitemap", () => {
  it("lists every public page once, with the table's priority and frequency", () => {
    const entries = sitemapEntries();
    expect(entries).toHaveLength(seoPages.length);
    expect(entries.map((e) => e.url)).toEqual(seoPages.map((p) => `https://socialreins.com${p.path === "/" ? "" : p.path}`));
    for (const [i, entry] of entries.entries()) {
      expect(entry.priority).toBe(seoPages[i].priority);
      expect(entry.changeFrequency).toBe(seoPages[i].changeFrequency);
      expect(entry.lastModified).toBe(seoPages[i].lastModified);
    }
  });

  it("dates only the pages whose own content carries a date", () => {
    const dated = sitemapEntries()
      .filter((e) => e.lastModified)
      .map((e) => e.url);
    expect(dated).toContain("https://socialreins.com/privacy");
    expect(dated).not.toContain("https://socialreins.com/");
  });
});

describe("llms.txt", () => {
  it("lists the product and every public page, docs included", () => {
    const text = llmsTxt();
    expect(text.startsWith("# SocialReins")).toBe(true);
    for (const page of seoPages) {
      expect(text, page.path).toContain(page.path === "/" ? "https://socialreins.com/" : `https://socialreins.com${page.path}`);
    }
    expect(text).toContain("## Docs");
  });
});
