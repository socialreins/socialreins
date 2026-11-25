import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics";
import { Pwa } from "@/components/pwa";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const body = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  metadataBase: new URL("https://socialreins.com"),
  title: "SocialReins: open-source social media manager",
  description:
    "Open-source social media manager for Facebook, Instagram, Threads, LinkedIn, Bluesky, X, TikTok and YouTube. Self-host it free today; the cloud is not open yet.",
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme before React hydrates, so React must not flag the attribute.
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        {/* Before paint, so the app never flashes the wrong theme (components/theme.tsx keeps it in step after). */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Script src="/config.js" strategy="beforeInteractive" />
        {children}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
        <Pwa />
      </body>
    </html>
  );
}
