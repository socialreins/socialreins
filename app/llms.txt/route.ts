import { llmsTxt } from "@/lib/seo";

// /llms.txt: the product, its public pages and the docs, in plain text, from the same table as the
// sitemap. public/llms.txt is gone so this route is the only answer on the address.
export function GET() {
  return new Response(llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
