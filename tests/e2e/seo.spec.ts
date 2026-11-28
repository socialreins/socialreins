import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const publicPages = ["/", "/contact", "/privacy", "/terms", "/data-deletion", "/post-types", "/socials", "/features", "/features/automations", "/features/inboxes", "/pricing", "/docs", "/docs/self-hosted", "/docs/self-hosted/use", "/docs/self-hosted/ai", "/docs/self-hosted/apps", "/docs/cloud", "/docs/cloud/use", "/docs/cloud/ai", "/docs/cloud/apps", "/bluesky", "/threads", "/linkedin", "/facebook", "/instagram", "/youtube", "/x", "/tiktok", "/pinterest", "/compare", "/compare/postsyncer", "/compare/manychat", "/compare/buffer", "/compare/hootsuite", "/compare/later", "/compare/postiz", "/compare/publer", "/compare/socialbee", "/compare/metricool", "/compare/sprout-social", "/compare/post-bridge", "/compare/mixpost", "/compare/ayrshare", "/compare/socialpilot", "/compare/agorapulse", "/compare/planable", "/compare/typefully", "/compare/chatfuel"];
const hiddenPages = ["/login", "/login/email", "/signup", "/signup/email", "/welcome", "/admin/waitlist", "/home", "/posts"];
const noindex = /<meta name="robots" content="noindex"/;
// lib/seo.ts repeats this alt text (a page-level openGraph replaces the file-based image). Next uses the .alt.txt files verbatim, so they must not end with a newline.
const shareAlt = readFileSync("app/opengraph-image.alt.txt", "utf8");

// Every structured data block on a page, parsed. JSON in a script may escape < as \u003c, so this works.
function jsonLd(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
}

function meta(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1] ?? "";
}

test("robots.txt allows the public pages, shuts the private ones and names the sitemap", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toContain("Allow: /");
  for (const path of ["/app", "/t", "/p", "/admin", "/login", "/invitations"]) expect(body).toContain(`Disallow: ${path}`);
  expect(body).toContain("Sitemap: https://socialreins.com/sitemap.xml");
});

test("pages tell browsers to stay on https", async ({ request }) => {
  for (const path of ["/", "/login", "/docs"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["strict-transport-security"], path).toBe("max-age=31536000");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
  }
});

test("the sitemap lists the public pages and no app page", async ({ request }) => {
  const body = await (await request.get("/sitemap.xml")).text();
  const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  expect(urls).toEqual(publicPages.map((p) => `https://socialreins.com${p === "/" ? "" : p}`));
  // Only pages whose own copy carries a date say when they changed.
  expect(body).toMatch(/<loc>https:\/\/socialreins\.com\/privacy<\/loc>\s*<lastmod>2026-11-26/);
  expect(body).not.toMatch(/<loc>https:\/\/socialreins\.com\/<\/loc>\s*<lastmod>/);
});

test("/indexnow.txt serves the IndexNow key from INDEXNOW_KEY", async ({ request }) => {
  const response = await request.get("/indexnow.txt");
  expect(response.status()).toBe(200);
  expect((await response.text()).trim()).toBe("e2e-indexnow-key");
});

test("llms.txt lists the product, its pages and the docs", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("# SocialReins");
  expect(response.headers()["content-type"]).toContain("text/plain");
  for (const path of ["/pricing", "/features/automations", "/docs/self-hosted", "/docs/cloud/use", "/compare/buffer"]) expect(body).toContain(`https://socialreins.com${path}`);
});

for (const path of publicPages) {
  test(`${path} is indexable with a canonical URL and a share image`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    const url = `https://socialreins.com${path === "/" ? "" : path}`;
    expect(html).not.toMatch(noindex);
    expect(html).toMatch(new RegExp(`<link rel="canonical" href="${url}/?"`));
    expect(html).toMatch(new RegExp(`<meta property="og:url" content="${url}/?"`));
    expect(html).toContain('<meta property="og:type" content="website"');
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toContain('<meta property="og:site_name" content="SocialReins"');
    expect(html).toContain('<meta property="og:image" content="https://socialreins.com/opengraph-image.png');
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain(`<meta property="og:image:alt" content="${shareAlt}"`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain('<meta name="twitter:title"');
    expect(html).toContain('<meta name="twitter:description"');
    expect(html).toMatch(/<meta name="twitter:image" content="https:\/\/socialreins\.com\/twitter-image\.png/);
    expect(html).toContain(`<meta name="twitter:image:alt" content="${shareAlt}"`);
    expect(meta(html, /<meta name="keywords" content="([^"]*)"/).length).toBeGreaterThan(10);
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
    // The layout puts these on every page, one block each.
    for (const type of ["Organization", "WebSite", "SoftwareApplication"]) expect(html, type).toContain(`"@type":"${type}"`);
    // The copy rule: no em dashes in the words a search engine shows.
    const shown = [meta(html, /<title>([^<]*)<\/title>/), meta(html, /<meta name="description" content="([^"]*)"/), meta(html, /<meta property="og:title" content="([^"]*)"/)];
    for (const text of shown) expect(text).not.toContain("\u2014");
  });
}

test("no two public pages share a title", async ({ request }) => {
  const titles = await Promise.all(publicPages.map(async (path) => meta(await (await request.get(path)).text(), /<title>([^<]*)<\/title>/)));
  expect(titles.every(Boolean)).toBe(true);
  expect(new Set(titles).size).toBe(titles.length);
});

test("each public page has one structured data block per type", async ({ request }) => {
  for (const path of publicPages) {
    const types = jsonLd(await (await request.get(path)).text()).map((block) => block["@type"]);
    expect(new Set(types).size, path).toBe(types.length);
  }
});

test("breadcrumbs sit on the feature, compare, network and docs pages", async ({ request }) => {
  for (const path of ["/features/automations", "/features/inboxes", "/compare/buffer", "/bluesky", "/docs", "/docs/cloud/use"]) {
    const crumbs = jsonLd(await (await request.get(path)).text()).find((block) => block["@type"] === "BreadcrumbList");
    expect(crumbs, path).toBeTruthy();
    expect(crumbs?.itemListElement, path).toBeInstanceOf(Array);
  }
});

test("/pricing answers its own questions in FAQPage data", async ({ request }) => {
  const blocks = jsonLd(await (await request.get("/pricing")).text());
  const faq = blocks.find((block) => block["@type"] === "FAQPage") as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
  expect(faq?.mainEntity.map((q) => q.name)).toContain("What does the cloud version cost?");
  expect(faq?.mainEntity.every((q) => q.acceptedAnswer.text.length > 20)).toBe(true);
  const app = blocks.find((block) => block["@type"] === "SoftwareApplication") as { offers: { price: string; priceCurrency: string }[] };
  expect(app.offers.map((o) => o.price)).toEqual(["190", "490", "0"]);
  expect(app.offers.every((o) => o.priceCurrency === "USD")).toBe(true);
  // We have no reviews or ratings, so no markup pretends we do.
  expect(JSON.stringify(blocks)).not.toMatch(/AggregateRating|"Review"/);
});

for (const path of hiddenPages) {
  test(`${path} stays out of search`, async ({ request }) => {
    expect(await (await request.get(path)).text()).toMatch(noindex);
  });
}

test("the home page has Organization structured data", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const json = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/)?.[1];
  expect(JSON.parse(json ?? "{}")).toMatchObject({ "@type": "Organization", name: "SocialReins", url: "https://socialreins.com" });
});
