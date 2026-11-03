import { api } from "@/lib/auth";
import { apiUrl } from "@/lib/waitlist";

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
export const disconnect = (id: string) => api(`/v1/connections/${encodeURIComponent(id)}`, "DELETE");

// brain names Facebook and Instagram together as "meta".
export const providerKey = (platform: string) => (platform === "facebook" || platform === "instagram" ? "meta" : platform);

// Platforms that connect by OAuth: a full-page navigation to brain, which sends the browser to the
// platform and back to /app/connections. Add meta, linkedin or x here once brain has their flow.
export const oauthProviders = new Set(["threads"]);
// Platforms with a connect flow in this web app. The rest wait for theirs.
export const connectable = new Set(["bluesky", ...oauthProviders]);

// brain checks the session and the role, and connects to the current team.
export const connectUrl = (platform: string) =>
  `${apiUrl}/connections/${encodeURIComponent(providerKey(platform))}/redirect`;

export type ConnectResult = { provider: string; error: string | null };
// What brain's callback put in the URL: ?connected=<provider>, or ?connect_error=<code>&provider=<provider>.
export function connectResult(search: string): ConnectResult | null {
  const q = new URLSearchParams(search);
  const connected = q.get("connected");
  const error = q.get("connect_error");
  const provider = connected ?? q.get("provider") ?? "";
  // Only our own providers, so a crafted link can't put arbitrary text on the page.
  if (!oauthProviders.has(provider)) return null;
  if (connected) return { provider, error: null };
  return error ? { provider, error } : null;
}

export function connectResultText({ provider, error }: ConnectResult, name: string): string {
  const platform = name || "the platform";
  switch (error) {
    case null:
      return `Connected your ${platform} account.`;
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

// Only Bluesky's image CDN path is allowed by the CSP's img-src (proxy.ts), so anything else falls back to an initial.
export const safeAvatar = (url: string | null) => (url?.startsWith("https://cdn.bsky.app/img/") ? url : null);
