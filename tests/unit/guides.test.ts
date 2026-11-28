import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { author, guide, guides, longDate } from "@/lib/guides";

const allStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
};

describe("the guide list", () => {
  it("has six guides with unique titles and slugs", () => {
    expect(guides).toHaveLength(6);
    expect(new Set(guides.map((g) => g.slug)).size).toBe(guides.length);
    expect(new Set(guides.map((g) => g.title)).size).toBe(guides.length);
  });

  it("uses a plain slug for every guide", () => {
    for (const g of guides) expect(g.slug, g.title).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has a search description of 110 to 160 characters", () => {
    for (const g of guides) {
      expect(g.description.length, g.slug).toBeGreaterThanOrEqual(110);
      expect(g.description.length, g.slug).toBeLessThanOrEqual(160);
    }
  });

  it("points every related guide at another one that exists", () => {
    for (const g of guides) {
      expect(g.related.length, g.slug).toBeGreaterThanOrEqual(1);
      expect(new Set(g.related).size, g.slug).toBe(g.related.length);
      for (const slug of g.related) {
        expect(slug, g.slug).not.toBe(g.slug);
        expect(guide(slug), `${g.slug} links to ${slug}`).toBeDefined();
      }
    }
  });

  it("ends every guide with three questions of its own", () => {
    for (const g of guides) {
      expect(g.faq, g.slug).toHaveLength(3);
      expect(new Set(g.faq.map((f) => f.question)).size, g.slug).toBe(3);
      for (const f of g.faq) {
        expect(f.question.length, g.slug).toBeGreaterThan(10);
        expect(f.answer.length, g.slug).toBeGreaterThan(60);
      }
    }
  });

  it("has a real date and says it the site's way", () => {
    for (const g of guides) {
      expect(g.updated, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(g.updated)), g.slug).toBe(false);
    }
    expect(longDate("2026-11-28")).toBe("28 November 2026");
    expect(author).toBe("The SocialReins team");
  });

  it("finds a guide by slug and nothing for an unknown one", () => {
    for (const g of guides) expect(guide(g.slug)).toBe(g);
    expect(guide("no-such-guide")).toBeUndefined();
  });
});

describe("guide copy", () => {
  it("has no em dash in any guide text or its pages", () => {
    for (const g of guides) {
      for (const text of allStrings(g)) expect(text, g.slug).not.toContain("\u2014");
    }
    const files = [
      "lib/guides.ts",
      "components/guides.tsx",
      "components/guide-articles.tsx",
      "app/guides/page.tsx",
      "app/guides/rss.xml/route.ts",
      ...guides.map((g) => `app/guides/${g.slug}/page.tsx`),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("\u2014");
    }
  });
});
