import { NextResponse, type NextRequest } from "next/server";
import { brainUrl } from "@/lib/brain-url";
import { gaId } from "@/lib/ga";
import { permissionsPolicy } from "@/lib/security";
import { retiredAddress, retiredRedirect } from "@/lib/slug-redirect";
import { legacyRedirect, splitTeamPath } from "@/lib/team-path";

const dev = process.env.NODE_ENV === "development";

const turnstile = "https://challenges.cloudflare.com";

// Google Analytics (components/analytics.tsx), only when GA_MEASUREMENT_ID is set.
const gaScript = "https://www.googletagmanager.com";
const gaHits = "https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com";

// Nothing here uses the camera, microphone, location or the Payment Request API. Passkeys (public key
// credentials) and copying an API token or webhook secret to the clipboard are used and stay allowed.
// The value lives in lib/security.ts, shared with the redirect responses in proxy.ts.
const permissions = permissionsPolicy();

// The CSP is set here, not in next.config headers (fixed at build), because connect-src names brain's origin from BRAIN_URL at run time and script-src needs a fresh nonce per request.
// 'strict-dynamic' lets the app add Google Analytics and Turnstile after consent without a nonce on those tags; Next.js puts the nonce on its own scripts from the request's CSP header.
const csp = (api: string, anyImage: boolean, ga: boolean, nonce: string) =>
  [
    "default-src 'self'",
    // Cloudflare Turnstile loads its script and runs its check in a frame (components/turnstile.tsx).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${turnstile}${ga ? ` ${gaScript}` : ""}${dev ? " 'unsafe-eval'" : ""}`,
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

// The headers next.config.ts sets on every page, so a redirect carries them too.
function harden(res: NextResponse, policy: string) {
  res.headers.set("Content-Security-Policy", policy);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", permissions);
  res.headers.set("Strict-Transport-Security", "max-age=31536000");
  return res;
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // A fresh, unguessable value for each request; base64 keeps it a single CSP token.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = (anyImage: boolean) => csp(new URL(brainUrl()).origin, anyImage, gaId() !== null, nonce);

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
      return harden(res, policy(false));
    }
  }

  // Old addresses (lib/team-path.ts): they moved out of next.config.ts so their redirects carry the same headers as a page.
  const legacy = legacyRedirect(path);
  if (legacy) {
    const to = req.nextUrl.clone();
    to.pathname = legacy.to;
    return harden(NextResponse.redirect(to, legacy.permanent ? 308 : 307), policy(false));
  }

  const requestHeaders = new Headers(req.headers);
  const value = policy(path.startsWith("/p/") || team !== null);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", value);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return harden(res, value);
}

export const config = { matcher: "/((?!_next/static|_next/image).*)" };
