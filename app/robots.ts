import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// The public pages are open to crawlers; the app, team, public post, admin and sign-in addresses are not.
// Their pages also carry a noindex meta tag, for a crawler that lands on one from a link anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/t", "/p", "/admin", "/login", "/invitations"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
