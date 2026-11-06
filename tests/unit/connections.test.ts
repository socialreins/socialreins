import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attention,
  connectBluesky,
  connectResult,
  connectResultText,
  connectUrl,
  disconnect,
  endDate,
  listConnections,
  listProviders,
  metaPickPending,
  needingReconnect,
  providerState,
  safeAvatar,
} from "@/lib/connections";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connection requests", () => {
  it("lists connections and providers with credentials", async () => {
    let fetch = reply(200, []);
    vi.stubGlobal("fetch", fetch);
    expect(await listConnections()).toEqual([]);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/connections`);
    expect(call(fetch)[1]).toMatchObject({ credentials: "include" });
    fetch = reply(200, [{ provider: "bluesky", configured: true }]);
    vi.stubGlobal("fetch", fetch);
    expect(await listProviders()).toEqual([{ provider: "bluesky", configured: true }]);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/connections/providers`);
  });

  it("posts the handle and app password to /v1/connections/bluesky", async () => {
    const fetch = reply(201, { id: "c1" });
    vi.stubGlobal("fetch", fetch);
    expect(await connectBluesky("alice.bsky.social", "abcd-efgh-ijkl-mnop")).toEqual({ id: "c1" });
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}/v1/connections/bluesky`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual({ handle: "alice.bsky.social", app_password: "abcd-efgh-ijkl-mnop" });
  });

  it("gives the connect call 30 seconds and other calls 10", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", reply(200, []));
    await connectBluesky("a", "b");
    expect(timeout).toHaveBeenLastCalledWith(30_000);
    await listConnections();
    expect(timeout).toHaveBeenLastCalledWith(10_000);
  });

  it.each([
    [422, "invalid_handle"],
    [422, "invalid_credentials"],
    [422, "unsupported_pds"],
    [502, "bluesky_unreachable"],
    [429, "rate_limited"],
    [403, "forbidden"],
  ])("maps connect failure %i %s", async (status, code) => {
    vi.stubGlobal("fetch", reply(status, { error: code }));
    expect(await connectBluesky("a", "b")).toBe(code);
  });

  it("disconnects with DELETE and maps 404", async () => {
    let fetch = reply(204);
    vi.stubGlobal("fetch", fetch);
    expect(await disconnect("c/1")).toBe("ok");
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/connections/c%2F1`);
    expect(call(fetch)[1]).toMatchObject({ method: "DELETE", credentials: "include" });
    fetch = reply(404, { error: "not_found" });
    vi.stubGlobal("fetch", fetch);
    expect(await disconnect("c1")).toBe("not_found");
  });
});

describe("provider state", () => {
  const providers = [
    { provider: "bluesky", configured: true },
    { provider: "meta", configured: true },
    { provider: "x", configured: false },
  ];
  it("knows which platforms can connect now", () => {
    expect(providerState("bluesky", providers)).toBe("available");
    expect(providerState("facebook", providers)).toBe("available");
    expect(providerState("instagram", providers)).toBe("available");
    expect(providerState("x", [{ provider: "x", configured: true }])).toBe("available");
    expect(providerState("linkedin", [{ provider: "linkedin", configured: true }])).toBe("available");
    expect(providerState("x", providers)).toBe("not_configured");
    expect(providerState("youtube", providers)).toBe("not_configured");
    expect(providerState("youtube", [{ provider: "youtube", configured: true }])).toBe("available");
    expect(providerState("tiktok", [{ provider: "tiktok", configured: true }])).toBe("available");
    expect(providerState("tiktok", [])).toBe("not_configured");
    expect(providerState("bluesky", [])).toBe("not_configured");
    expect(providerState("threads", [{ provider: "threads", configured: true }])).toBe("available");
  });

  it("sends OAuth connects to brain's redirect for the provider", () => {
    expect(connectUrl("threads")).toBe(`${apiUrl}/connections/threads/redirect`);
    expect(connectUrl("instagram")).toBe(`${apiUrl}/connections/meta/redirect`);
    expect(connectUrl("linkedin")).toBe(`${apiUrl}/connections/linkedin/redirect`);
    expect(connectUrl("youtube")).toBe(`${apiUrl}/connections/youtube/redirect`);
    expect(connectUrl("x")).toBe(`${apiUrl}/connections/x/redirect`);
    expect(connectUrl("tiktok")).toBe(`${apiUrl}/connections/tiktok/redirect`);
  });

  it("explains a TikTok connect and allows its avatars", () => {
    const text = (search: string) => connectResultText(connectResult(search)!, "TikTok");
    expect(text("?connected=tiktok")).toBe("Connected your TikTok account.");
    expect(text("?connect_error=missing_scopes&provider=tiktok")).toBe("Tick every permission when TikTok asks, they are all needed to post videos and photos.");
    expect(safeAvatar("https://p16-sign-va.tiktokcdn.com/a.jpeg")).toBe("https://p16-sign-va.tiktokcdn.com/a.jpeg");
    expect(safeAvatar("https://p19-sign.tiktokcdn-us.com/a.jpeg")).toBe("https://p19-sign.tiktokcdn-us.com/a.jpeg");
    expect(safeAvatar("https://tiktokcdn.com.evil.net/a.jpeg")).toBeNull();
  });

  it("explains how an X connect went", () => {
    expect(connectResult("?connected=x")).toEqual({ provider: "x", error: null });
    const text = (search: string) => connectResultText(connectResult(search)!, "X");
    expect(text("?connected=x")).toBe("Connected your X account.");
    expect(text("?connect_error=cancelled&provider=x")).toBe("X connection was cancelled.");
    expect(text("?connect_error=expired&provider=x")).toBe("That X sign-in expired or didn't start in this browser. Try again.");
    expect(text("?connect_error=x_failed&provider=x")).toMatch(/^X didn't let SocialReins connect/);
    expect(text("?connect_error=missing_scopes&provider=x")).toBe(
      "Tick every permission when X asks, they are all needed to post, upload media and delete posts.",
    );
    expect(text("?connect_error=not_configured&provider=x")).toBe("X isn't set up on this server.");
  });

  it("explains how a YouTube connect went", () => {
    expect(connectResult("?connected=youtube")).toEqual({ provider: "youtube", error: null });
    const text = (search: string) => connectResultText(connectResult(search)!, "YouTube");
    expect(text("?connected=youtube")).toBe("Connected your YouTube account.");
    expect(text("?connect_error=cancelled&provider=youtube")).toBe("YouTube connection was cancelled.");
    expect(text("?connect_error=youtube_failed&provider=youtube")).toMatch(/^YouTube didn't let SocialReins connect/);
    expect(text("?connect_error=no_channel&provider=youtube")).toMatch(/no YouTube channel/);
    expect(text("?connect_error=missing_scopes&provider=youtube")).toBe(
      "Tick every permission when YouTube asks, they are all needed to upload and delete videos.",
    );
  });

  it("explains how a LinkedIn connect went", () => {
    expect(connectResult("?connected=linkedin")).toEqual({ provider: "linkedin", error: null });
    const text = (search: string) => connectResultText(connectResult(search)!, "LinkedIn");
    expect(text("?connected=linkedin")).toBe("Connected your LinkedIn account.");
    expect(text("?connect_error=cancelled&provider=linkedin")).toBe("LinkedIn connection was cancelled.");
    expect(text("?connect_error=linkedin_failed&provider=linkedin")).toMatch(/^LinkedIn didn't let SocialReins connect/);
  });

  it("reads how a connect went from the URL brain sent back", () => {
    expect(connectResult("?connected=threads")).toEqual({ provider: "threads", error: null });
    expect(connectResult("?connect_error=cancelled&provider=threads")).toEqual({ provider: "threads", error: "cancelled" });
    expect(connectResult("?state=x")).toBeNull();
    expect(connectResult("")).toBeNull();
    expect(connectResult("?connected=anything%20you%20like")).toBeNull();
    expect(connectResult("?connect_error=cancelled&provider=evil")).toBeNull();
    const text = (search: string) => connectResultText(connectResult(search)!, "Threads");
    expect(text("?connected=threads")).toBe("Connected your Threads account.");
    expect(text("?connect_error=cancelled&provider=threads")).toBe("Threads connection was cancelled.");
    expect(text("?connect_error=threads_failed&provider=threads")).toMatch(/^Threads didn't let SocialReins connect/);
    expect(text("?connect_error=forbidden&provider=threads")).toMatch(/owners and admins/);
    expect(text("?connect_error=whatever&provider=threads")).toBe("Something went wrong connecting Threads. Try again.");
  });

  it("reads Meta's results under brain's provider name", () => {
    expect(connectResult("?connected=meta")).toEqual({ provider: "meta", error: null });
    // Only brain's provider names, never the platforms it covers.
    expect(connectResult("?connected=facebook")).toBeNull();
    expect(connectResult("?connect_error=cancelled&provider=instagram")).toBeNull();
    const text = (search: string) => connectResultText(connectResult(search)!, "Facebook and Instagram");
    expect(text("?connected=meta")).toMatch(/already connected/);
    expect(text("?connect_error=meta_failed&provider=meta")).toMatch(/^Facebook and Instagram didn't let SocialReins connect/);
    expect(text("?connect_error=no_pages&provider=meta")).toMatch(/didn't share any Pages/);
    expect(metaPickPending("?pick=meta")).toBe(true);
    expect(metaPickPending("?pick=other")).toBe(false);
    expect(metaPickPending("")).toBe(false);
  });

  it("only keeps avatars from Bluesky's and Meta's CDNs", () => {
    const fb = "https://scontent-ams2-1.xx.fbcdn.net/v/t39/p.jpg?oh=1";
    expect(safeAvatar(fb)).toBe(fb);
    expect(safeAvatar("https://scontent.cdninstagram.com/p.jpg")).toBe("https://scontent.cdninstagram.com/p.jpg");
    expect(safeAvatar("https://fbcdn.net.evil.com/p.jpg")).toBeNull();
    expect(safeAvatar("https://evilfbcdn.net/p.jpg")).toBeNull();
    expect(safeAvatar("http://scontent.xx.fbcdn.net/p.jpg")).toBeNull();
    expect(safeAvatar("not a url")).toBeNull();
    expect(safeAvatar("https://yt3.ggpht.com/abc=s240")).toBe("https://yt3.ggpht.com/abc=s240");
    expect(safeAvatar("https://yt3.googleusercontent.com/abc")).toBe("https://yt3.googleusercontent.com/abc");
    expect(safeAvatar("https://yt3.ggpht.com.evil.com/abc")).toBeNull();
    expect(safeAvatar("https://pbs.twimg.com/profile_images/1/a_normal.jpg")).toBe("https://pbs.twimg.com/profile_images/1/a_normal.jpg");
    expect(safeAvatar("https://pbs.twimg.com.evil.com/a.jpg")).toBeNull();
    expect(safeAvatar("https://evil.com/yt3.ggpht.com")).toBeNull();
    expect(safeAvatar("http://yt3.ggpht.com/abc")).toBeNull();
    expect(safeAvatar("https://cdn.bsky.app/img/avatar/plain/x.jpg")).toBe("https://cdn.bsky.app/img/avatar/plain/x.jpg");
    expect(safeAvatar("https://cdn.bsky.app.evil.com/x.jpg")).toBeNull();
    expect(safeAvatar("http://cdn.bsky.app/img/x.jpg")).toBeNull();
    expect(safeAvatar("https://cdn.bsky.app/other/x.jpg")).toBeNull();
    expect(safeAvatar(null)).toBeNull();
  });
});

describe("accounts that need attention", () => {
  const base = { id: "c1", provider: "linkedin", external_id: "x", handle: null, display_name: "Ann", avatar_url: null, token_expires_at: "2026-11-20T10:00:00Z", set_ids: [], dm_access: false, created_at: "2026-10-01T00:00:00Z" };

  it("reads brain's status, and an older brain's reconnect flag", () => {
    expect(attention({ ...base, status: "ok" })).toBeNull();
    expect(attention(base)).toBeNull();
    expect(attention({ ...base, status: "expiring" })).toBe("expiring");
    expect(attention({ ...base, status: "reconnect" })).toBe("reconnect");
    expect(attention({ ...base, reconnect: true })).toBe("reconnect");
    // A refused token wins over an end date that is still ahead.
    expect(attention({ ...base, status: "expiring", reconnect: true })).toBe("reconnect");
  });

  it("keeps only the accounts to reconnect, in order", () => {
    const list = [{ ...base, id: "a", status: "ok" as const }, { ...base, id: "b", status: "expiring" as const }, { ...base, id: "c", status: "reconnect" as const }];
    expect(needingReconnect(list).map((c) => c.id)).toEqual(["b", "c"]);
    expect(needingReconnect([])).toEqual([]);
  });

  it("formats the end date, or nothing without one", () => {
    expect(endDate(base)).toMatch(/2026/);
    expect(endDate({ ...base, token_expires_at: null })).toBe("");
  });
});
