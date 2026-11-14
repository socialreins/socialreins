import { api } from "@/lib/auth";
import { apiUrl } from "@/lib/waitlist";

export type ConnectionStatus = "ok" | "expiring" | "reconnect";

export type Connection = {
  id: string;
  provider: string;
  external_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  token_expires_at: string | null;
  set_ids: string[];
  // Bluesky: the app password may read and send DMs. brain re-checks it on every poll.
  dm_access: boolean;
  // The platform refused the account's token (a publish, a renewal or the inbox found out), so it must be connected again. Absent otherwise.
  reconnect?: boolean;
  // ok; expiring: the token ends within 7 days (token_expires_at) and nothing renews it; reconnect: it expired or was refused.
  status?: ConnectionStatus;
  created_at: string;
};
export type Provider = { provider: string; configured: boolean };

export const listConnections = () => api<Connection[]>("/v1/connections");
export const listProviders = () => api<Provider[]>("/v1/connections/providers");
// 201 for a new account, 200 when the team already had it and the app password was replaced.
// brain chains several outbound calls to Bluesky (up to 10s each), so this waits longer.
export const CONNECT_TIMEOUT_MS = 30_000;
export const connectBluesky = (handle: string, appPassword: string) =>
  api<Connection>("/v1/connections/bluesky", "POST", { handle, app_password: appPassword }, CONNECT_TIMEOUT_MS);
// What the account needs from the user now. An older brain sends only the `reconnect` flag.
export const attention = (c: Connection): "expiring" | "reconnect" | null =>
  c.status === "reconnect" || c.reconnect ? "reconnect" : c.status === "expiring" ? "expiring" : null;
export const needingReconnect = (list: Connection[]) => list.filter((c) => attention(c) !== null);
export const endDate = (c: Connection) => (c.token_expires_at ? new Date(c.token_expires_at).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");
export const disconnect = (id: string) => api(`/v1/connections/${encodeURIComponent(id)}`, "DELETE");

// brain names Facebook and Instagram together as "meta".
export const providerKey = (platform: string) => (platform === "facebook" || platform === "instagram" ? "meta" : platform);
export const metaName = "Facebook and Instagram";

// Platforms that connect by OAuth: a full-page navigation to brain, which sends the browser to the
// platform and back to /connections.
export const oauthProviders = new Set(["threads", "linkedin", "x", "tiktok", "youtube", "facebook", "instagram"]);
// Platforms with a connect flow in this web app. The rest wait for theirs.
export const connectable = new Set(["bluesky", ...oauthProviders]);
// The provider names brain's callback puts in the URL.
const callbackProviders = new Set([...oauthProviders].map(providerKey));

// One Meta login connects Pages and their Instagram accounts; brain keeps the granted ones (tokens
// included) for 15 minutes and lands on ?pick=meta so the user picks which to connect.
export type MetaChoice = { id: string; name: string; picture_url: string | null };
export type MetaChoices = { facebook: MetaChoice[]; instagram: MetaChoice[] };
export const metaPickPending = (search: string) => new URLSearchParams(search).get("pick") === "meta";
export const getMetaPick = () => api<MetaChoices>("/v1/connections/meta/pick");
export const pickMeta = (facebook: string[], instagram: string[]) =>
  api<Connection[]>("/v1/connections/meta/pick", "POST", { facebook, instagram });
export const cancelMetaPick = () => api("/v1/connections/meta/pick", "DELETE");

// brain checks the session and the role, and connects to the team this tab is on (a page
// navigation cannot send the X-Team header, so the code rides in the query).
export const connectUrl = (platform: string) => {
  const team = getTabTeam();
  return `${apiUrl}/connections/${encodeURIComponent(providerKey(platform))}/redirect${team ? `?team=${team}` : ""}`;
};

// An OAuth connect leaves the page, and brain's callback doesn't say which account it made. So the
// picked set and the accounts already here wait in sessionStorage, to find the new one on the way back.
const STARTED = "connect-started";
// Longer than brain keeps an OAuth state (10 minutes); an older note is from a connect that was given up.
const STARTED_MS = 15 * 60_000;
export function rememberConnect(set: string, ids: string[]) {
  try {
    sessionStorage.setItem(STARTED, JSON.stringify({ set, ids, at: Date.now() }));
  } catch {
    // Storage refused (private window): the account still connects, into Default only.
  }
}
export function takeConnect(): { set: string; ids: string[] } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STARTED) ?? "null");
    sessionStorage.removeItem(STARTED);
    return v && typeof v.set === "string" && Array.isArray(v.ids) && Date.now() - v.at < STARTED_MS ? v : null;
  } catch {
    return null;
  }
}

export type ConnectResult = { provider: string; error: string | null };
// What brain's callback put in the URL: ?connected=<provider>, or ?connect_error=<code>&provider=<provider>.
export function connectResult(search: string): ConnectResult | null {
  const q = new URLSearchParams(search);
  const connected = q.get("connected");
  const error = q.get("connect_error");
  const provider = connected ?? q.get("provider") ?? "";
  // Only our own providers, so a crafted link can't put arbitrary text on the page.
  if (!callbackProviders.has(provider)) return null;
  if (connected) return { provider, error: null };
  return error ? { provider, error } : null;
}

export function connectResultText({ provider, error }: ConnectResult, name: string): string {
  const platform = name || "the platform";
  switch (error) {
    case null:
      // brain only says connected=meta when every granted account was already here.
      return provider === "meta"
        ? `Your ${platform} accounts were already connected. Their sign-ins are renewed.`
        : `Connected your ${platform} account.`;
    case "no_pages":
      return "Facebook didn't share any Pages. Connect again and pick at least one Page when Facebook asks.";
    case "no_channel":
      return "That Google account has no YouTube channel. Create one on YouTube, then connect again.";
    case "missing_scopes":
      return provider === "x"
        ? "Tick every permission when X asks, they are all needed to post, upload media and delete posts."
        : provider === "tiktok"
          ? "Tick every permission when TikTok asks, they are all needed to post videos and photos."
          : "Tick every permission when YouTube asks, they are all needed to upload and delete videos.";
    case "not_configured":
      return `${platform} isn't set up on this server.`;
    case "unauthorized":
      return `Your session ended. Sign in again, then connect ${platform}.`;
    case "forbidden":
      return "Only team owners and admins can connect or disconnect accounts.";
    case "rate_limited":
      return "Too many connection attempts. Wait a while, then try again.";
    case "expired":
      return `That ${platform} sign-in expired or didn't start in this browser. Try again.`;
    case "cancelled":
      return `${platform} connection was cancelled.`;
    case `${provider}_failed`:
      return `${platform} didn't let SocialReins connect the account. Try again in a moment.`;
    default:
      return `Something went wrong connecting ${platform}. Try again.`;
  }
}

export type ProviderState = "available" | "coming_soon" | "not_configured";
export function providerState(platform: string, providers: Provider[]): ProviderState {
  const configured = providers.find((p) => p.provider === providerKey(platform))?.configured ?? false;
  if (!configured) return "not_configured";
  return connectable.has(platform) ? "available" : "coming_soon";
}

// Only Bluesky's image CDN path, Meta's image CDNs, YouTube's channel pictures, X's profile pictures and TikTok's avatars are allowed by the
// CSP's img-src (proxy.ts), so anything else falls back to an initial.
const metaImageHosts = [".fbcdn.net", ".cdninstagram.com", ".tiktokcdn.com", ".tiktokcdn-us.com"];
const exactImageHosts = ["yt3.ggpht.com", "yt3.googleusercontent.com", "pbs.twimg.com"];
export function safeAvatar(url: string | null) {
  if (!url) return null;
  if (url.startsWith("https://cdn.bsky.app/img/")) return url;
  try {
    const u = new URL(url);
    const allowed = metaImageHosts.some((h) => u.hostname.endsWith(h)) || exactImageHosts.includes(u.hostname);
    return u.protocol === "https:" && allowed ? url : null;
  } catch {
    return null;
  }
}
