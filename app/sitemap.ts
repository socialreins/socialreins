import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/seo";

// The public pages of lib/seo.ts, with the priorities and dates that table holds. Private pages
// (/app, /t, /p, /admin, /login, /invitations) are not listed; app/robots.ts keeps crawlers out too.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
