import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics";
import { ConsentBanner } from "@/components/consent-banner";
import { JsonLd } from "@/components/json-ld";
import { Pwa } from "@/components/pwa";
import { organizationSchema, softwareApplicationSchema, websiteSchema } from "@/lib/seo";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const body = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  metadataBase: new URL("https://socialreins.com"),
  title: "SocialReins: open-source social media manager",
  description:
    "Open-source social media manager for Facebook, Instagram, Threads, LinkedIn, Bluesky, X, TikTok, YouTube and Pinterest. Self-host it free; Cloud is not open.",
  // iOS home-screen app; the icon is app/apple-icon.png. "default" keeps the page below the status bar.
  appleWebApp: { capable: true, title: "SocialReins", statusBarStyle: "default" },
};

const themeScript = `try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"}catch(e){}`;

// viewportFit "cover" lets the app fill a notched phone; the app shell pads for the safe area (components/app-shell.tsx).
// The two colors are the page background in light and dark; the manifest has one color only (app/manifest.ts).
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

// Every page needs the request's nonce for the inline theme script and Next.js's own scripts, so each
// request renders on the server (proxy.ts sends it). Without the opt-out, cacheComponents refuses to
// prerender any route that reads headers().
export const instant = false;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // One nonce per request, from proxy.ts. Next.js puts the same value on every script it renders; the
  // inline theme script and the beforeInteractive config.js below need it by hand.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The theme script sets data-theme before React hydrates, so React must not flag the attribute.
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/* Before paint, so the app never flashes the wrong theme (components/theme.tsx keeps it in step after). */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {/* One block per type, the same on every page: the organization, the site, and the product with its plans. */}
        <JsonLd data={organizationSchema} />
        <JsonLd data={websiteSchema} />
        <JsonLd data={softwareApplicationSchema} />
        <Script src="/config.js" strategy="beforeInteractive" nonce={nonce} />
        {children}
        <Suspense fallback={null}>
          <Analytics nonce={nonce} />
          <ConsentBanner />
        </Suspense>
        <Pwa />
      </body>
    </html>
  );
}
