import { NextResponse, type NextRequest } from "next/server";
import { brainUrl } from "@/lib/brain-url";
import { gaId } from "@/lib/ga";
import { retiredAddress, retiredRedirect } from "@/lib/slug-redirect";
import { splitTeamPath } from "@/lib/team-path";

const dev = process.env.NODE_ENV === "development";

const turnstile = "https://challenges.cloudflare.com";

// Google Analytics (components/analytics.tsx), only when GA_MEASUREMENT_ID is set.
const gaScript = "https://www.googletagmanager.com";
const gaHits = "https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com";

// The CSP is set here, not in next.config headers (fixed at build), because connect-src names brain's origin from BRAIN_URL at run time.
// shortcut: 'unsafe-inline' scripts because the pages are static (no per-request nonce); move to nonces if pages go dynamic.
const csp = (api: string, anyImage: boolean, ga: boolean) =>
  [
    "default-src 'self'",
    // Cloudflare Turnstile loads its script and runs its check in a frame (components/turnstile.tsx).
    `script-src 'self' 'unsafe-inline' ${turnstile}${ga ? ` ${gaScript}` : ""}${dev ? " 'unsafe-eval'" : ""}`,
    `frame-src ${turnstile}`,
    "style-src 'self' 'unsafe-inline'",
    // The footer badges (components/featured-badges.tsx), then Bluesky, Facebook, Instagram, YouTube, X, Pinterest and TikTok avatars; safeAvatar in lib/connections.ts keeps to the same sources.
    // A public post page (/p/<code>) shows the author's own image links, from any https host, and so do the
    // team pages (the media library and the composer's picker); all of /t/, since the app moves between its pages without a reload.
    anyImage ? "img-src 'self' data: https:" : "img-src 'self' data: https://twelve.tools https://startupfa.me https://img.turbo0.com https://cdn.bsky.app/img/ https://*.fbcdn.net https://*.cdninstagram.com https://yt3.ggpht.com https://yt3.googleusercontent.com https://i.ytimg.com https://pbs.twimg.com https://i.pinimg.com https://*.tiktokcdn.com https://*.tiktokcdn-us.com" + (ga ? ` ${gaHits}` : ""),
    "font-src 'self'",
    `connect-src 'self' ${api}${ga ? ` ${gaHits}` : ""}${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // /t/<address that a team gave up>/...: a permanent redirect to the team's address now, keeping the path and the query.
  const team = splitTeamPath(path)[0];
  if (team) {
    const address = await retiredAddress(team, brainUrl());
    if (address) {
      const to = req.nextUrl.clone();
      to.pathname = retiredRedirect(path, address);
      const res = NextResponse.redirect(to, 308);
      // Never kept by a browser: a team that takes its old address back would otherwise send that browser round in a circle.
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
  }
  const res = NextResponse.next();
  const anyImage = path.startsWith("/p/") || splitTeamPath(path)[0] !== null;
  res.headers.set("Content-Security-Policy", csp(new URL(brainUrl()).origin, anyImage, gaId() !== null));
  return res;
}

export const config = { matcher: "/((?!_next/static|_next/image).*)" };
