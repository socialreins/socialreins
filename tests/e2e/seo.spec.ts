import { expect, test } from "@playwright/test";

const publicPages = ["/", "/contact", "/privacy", "/terms", "/data-deletion"];
const hiddenPages = ["/login", "/login/email", "/signup", "/signup/email", "/welcome", "/admin/waitlist", "/home", "/posts"];
const noindex = /<meta name="robots" content="noindex"/;

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
    // A page-level openGraph drops the root share image on child pages, so only the home page sets og:url.
    if (path === "/") expect(html).toMatch(new RegExp(`<meta property="og:url" content="${url}/?"`));
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toContain('<meta property="og:image"');
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
