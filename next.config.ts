import type { NextConfig } from "next";
import { permissionsPolicy } from "./lib/security";

const nextConfig: NextConfig = {
  output: "standalone",
  // AGENTS.md is hand-written; the generated Next.js block contains em dashes.
  agentRules: false,
  // brain/ is the Rust API submodule: never part of the web build or its standalone output.
  outputFileTracingExcludes: { "*": ["brain/**"] },
  cacheComponents: true,
  // Railway builds with the commit in RAILWAY_GIT_COMMIT_SHA (the Dockerfile passes it on). A tab left open across a
  // deploy then reloads on its next navigation instead of asking for chunks the new build removed; unset (a local or
  // self-hosted build), nothing changes.
  deploymentId: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
  partialPrefetching: true,
  // The app moved off /app, then under /t/<team code>/ (lib/team-path.ts). The redirects live in proxy.ts, since
  // next.config.ts redirects answer before the headers below are added.
  headers: async () => [
    {
      source: "/:path*",
      // Content-Security-Policy is set in proxy.ts.
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: permissionsPolicy() },
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
