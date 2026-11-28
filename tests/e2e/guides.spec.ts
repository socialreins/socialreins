import { expect, test } from "@playwright/test";

// Kept here rather than read from lib/guides: the test should fail when the copy or a slug changes unexpectedly.
const guides = [
  { slug: "schedule-post-to-several-networks", title: "How to schedule a post to several social networks at once" },
  { slug: "social-media-approval-workflow", title: "Running a social media approval workflow with a small team" },
  { slug: "self-hosting-a-social-media-scheduler", title: "Self-hosting a social media scheduler: what it takes" },
  { slug: "social-inbox-automations", title: "Social inbox and automations: what a small team can automate" },
  { slug: "open-source-vs-hosted-social-media-tools", title: "Open source versus hosted social media tools: how to choose" },
  { slug: "posting-cadence-small-team", title: "A realistic posting cadence for a 1 to 5 person team" },
];

test("the guides index is in the header and the footer, and lists every guide", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Guides", exact: true }).click();
  await expect(page).toHaveURL(/\/guides$/);
  await expect(page.getByRole("heading", { name: "Guides", level: 1 })).toBeVisible();
  for (const g of guides) {
    await expect(page.getByRole("link", { name: g.title, exact: true })).toHaveAttribute("href", `/guides/${g.slug}`);
  }
  await expect(page.getByRole("link", { name: "RSS feed" })).toHaveAttribute("href", "/guides/rss.xml");
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Guides", exact: true })).toHaveAttribute("href", "/guides");
});

test("every guide renders its own page, date, author and FAQ markup", async ({ page }) => {
  for (const g of guides) {
    const url = `https://socialreins.com/guides/${g.slug}`;
    await page.goto(`/guides/${g.slug}`);
    await expect(page.getByRole("heading", { name: g.title, level: 1 })).toBeVisible();
    await expect(page.getByText("By The SocialReins team. Last updated 28 November 2026.")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", url);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", url);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", `${g.title}: SocialReins`);
    const description = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
    expect(description.length, g.slug).toBeGreaterThanOrEqual(110);
    expect(description.length, g.slug).toBeLessThanOrEqual(160);
    const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((text) => JSON.parse(text) as Record<string, unknown>);
    const ld = blocks.find((block) => block["@type"] === "FAQPage") as { url: string; mainEntity: Record<string, unknown>[] };
    expect(ld, g.slug).toMatchObject({ "@type": "FAQPage", url });
    expect(ld.mainEntity, g.slug).toHaveLength(3);
    expect(ld.mainEntity[0]).toMatchObject({ "@type": "Question" });
    // The visible FAQ and the markup come from the same answers.
    const questions = await page.locator("section[aria-labelledby=questions] dt").allTextContents();
    expect(questions, g.slug).toHaveLength(3);
    expect(await page.locator("body").innerText()).not.toContain("\u2014");
  }
});

test("an article links to product pages and to another guide", async ({ page }) => {
  await page.goto("/guides/schedule-post-to-several-networks");
  const article = page.locator("article");
  await expect(article.getByRole("link", { name: "post types page" })).toHaveAttribute("href", "/post-types");
  await expect(article.getByRole("link", { name: "features page" })).toHaveAttribute("href", "/features");
  await expect(article.getByRole("link", { name: "the approvals guide" })).toHaveAttribute("href", "/guides/social-media-approval-workflow");
  await expect(page.getByRole("navigation", { name: "More guides" }).getByRole("link", { name: "A realistic posting cadence for a 1 to 5 person team" })).toHaveAttribute(
    "href",
    "/guides/posting-cadence-small-team",
  );
});

test("the guides feed lists every article as RSS", async ({ request }) => {
  const response = await request.get("/guides/rss.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/rss+xml");
  const body = await response.text();
  expect(body).toContain("<title>SocialReins guides</title>");
  expect([...body.matchAll(/<item>/g)]).toHaveLength(guides.length);
  for (const g of guides) expect(body).toContain(`https://socialreins.com/guides/${g.slug}`);
});

test("the index and an article fit a phone with no sideways scroll", async ({ page }) => {
  for (const path of ["/guides", "/guides/self-hosting-a-social-media-scheduler"]) {
    await page.goto(path);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} at ${width}`).toBe(true);
    }
  }
});
