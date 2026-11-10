import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // AGENTS.md is hand-written; the generated Next.js block contains em dashes.
  agentRules: false,
  // brain/ is the Rust API submodule: never part of the web build or its standalone output.
  outputFileTracingExcludes: { "*": ["brain/**"] },
  cacheComponents: true,
  partialPrefetching: true,
  // The app moved off /app; brain and old bookmarks still link there.
  redirects: async () => [
    { source: "/app", destination: "/home", permanent: true },
    { source: "/app/:path*", destination: "/:path*", permanent: true },
  ],
  headers: async () => [
    {
      source: "/:path*",
      // Content-Security-Policy is set in proxy.ts.
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
