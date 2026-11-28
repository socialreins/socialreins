import type { MetadataRoute } from "next";

// Makes the app installable (Chrome, Edge, Safari "Add to Dock", Android and iOS home screens). public/sw.js gives it an offline page.
// The icons are the brand mark (brand/logo-square.svg); the maskable one keeps the mark inside the central safe circle.
// The /posts/new, /calendar and /inbox shortcuts redirect to the current team's page (lib/team-path.ts).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SocialReins",
    short_name: "SocialReins",
    description: "Open-source social media manager: schedule posts, answer your inbox and run automations.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f6",
    theme_color: "#121212",
    categories: ["business", "productivity", "social"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Compose", url: "/posts/new" },
      { name: "Calendar", url: "/calendar" },
      { name: "Inbox", url: "/inbox" },
      { name: "Comments", url: "/comments" },
    ].map((s) => ({ ...s, icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] })),
  };
}
