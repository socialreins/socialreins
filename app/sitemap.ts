import { networks } from "@/lib/networks";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/contact", "/privacy", "/terms", "/data-deletion", "/post-types", ...networks.map((n) => `/${n.slug}`)].map((path) => ({ url: `https://socialreins.com${path}` }));
}
