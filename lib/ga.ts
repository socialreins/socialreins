// Google Analytics runs only on public marketing pages: never in the signed-in app, on public post pages
// (customer content) or on pages whose address carries a token.
const untracked = ["/t/", "/app", "/admin", "/p/", "/profile", "/security", "/welcome", "/invitations", "/newsletter", "/waitlist", "/billing", "/login/email", "/signup/email"];

export const tracked = (path: string) => !untracked.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path === p);

// Server only: the GA4 measurement id from GA_MEASUREMENT_ID, or null (analytics off) when unset or malformed.
export const gaId = (raw = process.env.GA_MEASUREMENT_ID) => (raw && /^G-[A-Z0-9]{4,20}$/.test(raw.trim()) ? raw.trim() : null);
