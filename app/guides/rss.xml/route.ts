import { guides, site } from "@/lib/guides";

// A plain RSS 2.0 feed, built from the same guide data as the pages, so a new guide appears in both.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const date = (iso: string) => new Date(`${iso}T09:00:00Z`).toUTCString();

export function GET() {
  const newest = guides.map((g) => g.updated).sort().at(-1) ?? "2026-11-28";
  const items = guides
    .map(
      (g) => `    <item>
      <title>${esc(g.title)}</title>
      <link>${site}/guides/${g.slug}</link>
      <guid isPermaLink="true">${site}/guides/${g.slug}</guid>
      <pubDate>${date(g.updated)}</pubDate>
      <description>${esc(g.description)}</description>
    </item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>SocialReins guides</title>
    <link>${site}/guides</link>
    <description>Practical guides to scheduling, approvals, self-hosting, inboxes and automations for small teams.</description>
    <language>en</language>
    <lastBuildDate>${date(newest)}</lastBuildDate>
${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
