import { llmsTxt } from "@/lib/seo";

// /llms.txt: the product, its public pages and the docs, in plain text, from the same table as the
// sitemap. public/llms.txt is gone so this route is the only answer on the address. It sits in a route
// group: the group adds no path segment, and "llms" stays out of the team-slug namespace check (a team
// address lives under /t/, so the two never meet).
export function GET() {
  return new Response(llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
