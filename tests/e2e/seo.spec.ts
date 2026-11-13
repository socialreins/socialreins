import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const publicPages = ["/", "/contact", "/privacy", "/terms", "/data-deletion", "/post-types", "/bluesky", "/threads", "/linkedin", "/facebook", "/instagram", "/youtube", "/x", "/tiktok"];
const hiddenPages = ["/login", "/login/email", "/signup", "/signup/email", "/welcome", "/admin/waitlist", "/home", "/posts"];
const noindex = /<meta name="robots" content="noindex"/;
// lib/seo.ts repeats this alt text (a page-level openGraph replaces the file-based image). Next uses the .alt.txt files verbatim, so they must not end with a newline.
const shareAlt = readFileSync("app/opengraph-image.alt.txt", "utf8");

test("robots.txt allows crawling and names the sitemap", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toContain("Allow: /");
  expect(body).not.toContain("Disallow");
  expect(body).toContain("Sitemap: https://socialreins.com/sitemap.xml");
});

test("the sitemap lists the public pages and no app page", async ({ request }) => {
  const body = await (await request.get("/sitemap.xml")).text();
  const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  expect(urls).toEqual(publicPages.map((p) => `https://socialreins.com${p === "/" ? "" : p}`));
});

test("/indexnow.txt serves the IndexNow key from INDEXNOW_KEY", async ({ request }) => {
  const response = await request.get("/indexnow.txt");
  expect(response.status()).toBe(200);
  expect((await response.text()).trim()).toBe("e2e-indexnow-key");
});

test("llms.txt describes the site", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("# SocialReins");
});

for (const path of publicPages) {
  test(`${path} is indexable with a canonical URL and a share image`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    const url = `https://socialreins.com${path === "/" ? "" : path}`;
    expect(html).not.toMatch(noindex);
    expect(html).toMatch(new RegExp(`<link rel="canonical" href="${url}/?"`));
    expect(html).toMatch(new RegExp(`<meta property="og:url" content="${url}/?"`));
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/socialreins\.com\/opengraph-image\.png/);
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain(`<meta property="og:image:alt" content="${shareAlt}"`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toMatch(/<meta name="twitter:image" content="https:\/\/socialreins\.com\/twitter-image\.png/);
    expect(html).toContain(`<meta name="twitter:image:alt" content="${shareAlt}"`);
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
  });
}

for (const path of hiddenPages) {
  test(`${path} stays out of search`, async ({ request }) => {
    expect(await (await request.get(path)).text()).toMatch(noindex);
  });
}

test("the home page has Organization structured data", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
  expect(JSON.parse(json ?? "{}")).toMatchObject({ "@type": "Organization", name: "SocialReins", url: "https://socialreins.com" });
});
