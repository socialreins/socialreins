import type { NextConfig } from "next";
import { legacyRedirects } from "./lib/team-path";

const nextConfig: NextConfig = {
  output: "standalone",
  // AGENTS.md is hand-written; the generated Next.js block contains em dashes.
  agentRules: false,
  // brain/ is the Rust API submodule: never part of the web build or its standalone output.
  outputFileTracingExcludes: { "*": ["brain/**"] },
  cacheComponents: true,
  partialPrefetching: true,
  // The app moved off /app, then under /t/<team code>/ (lib/team-path.ts); brain and old bookmarks still link to both.
  redirects: async () => [
    { source: "/app", destination: "/home", permanent: true },
    // The first segment must start with a letter or digit, so a decoded "//evil.example" or "\\evil.example" can never lead the destination off site.
    { source: "/app/:first([a-z0-9][a-z0-9_-]*)/:rest*", destination: "/:first/:rest*", permanent: true },
    ...legacyRedirects(),
  ],
  headers: async () => [
    {
      source: "/:path*",
      // Content-Security-Policy is set in proxy.ts.
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Browsers ignore this over plain http, so a local or http-only install is unaffected.
        // Once seen over https it holds for the hostname on every port for a year.
        // No includeSubDomains: a self-hoster's other subdomains are not ours to decide for.
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ],
    },
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
