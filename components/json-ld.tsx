import { headers } from "next/headers";

// One structured data block. The payload is built in lib/seo.ts from real page data; the < escape keeps
// a string in it from closing the script tag early. The CSP nonce comes from proxy.ts, like every other
// inline script the app renders.
export async function JsonLd({ data }: { data: object }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
