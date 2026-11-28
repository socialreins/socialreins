import { rivals } from "@/lib/compare";
import { guides } from "@/lib/guides";
import { networks } from "@/lib/networks";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/contact", "/privacy", "/terms", "/data-deletion", "/post-types", "/socials", "/features", "/features/automations", "/features/inboxes", "/pricing", "/docs", "/docs/self-hosted", "/docs/self-hosted/use", "/docs/self-hosted/ai", "/docs/self-hosted/apps", "/docs/cloud", "/docs/cloud/use", "/docs/cloud/ai", "/docs/cloud/apps", "/guides", ...guides.map((g) => `/guides/${g.slug}`), ...networks.map((n) => `/${n.slug}`), "/compare", ...rivals.map((r) => `/compare/${r.slug}`)].map((path) => ({ url: `https://socialreins.com${path}` }));
}
