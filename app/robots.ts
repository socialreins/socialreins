import type { MetadataRoute } from "next";

// Nothing is disallowed: a crawler must fetch the app and sign-in pages to see their noindex.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: "https://socialreins.com/sitemap.xml" };
}
