import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/contact", "/privacy", "/terms", "/data-deletion", "/post-types", "/instagram"].map((path) => ({ url: `https://socialreins.com${path}` }));
}
