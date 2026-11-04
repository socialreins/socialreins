import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectBluesky,
  connectResult,
  connectResultText,
  connectUrl,
  disconnect,
  listConnections,
  listProviders,
  metaPickPending,
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
    expect(providerState("x", [{ provider: "x", configured: true }])).toBe("coming_soon");
    expect(providerState("linkedin", [{ provider: "linkedin", configured: true }])).toBe("available");
    expect(providerState("x", providers)).toBe("not_configured");
    expect(providerState("youtube", providers)).toBe("not_configured");
    expect(providerState("youtube", [{ provider: "youtube", configured: true }])).toBe("available");
    expect(providerState("tiktok", [{ provider: "tiktok", configured: true }])).toBe("coming_soon");
    expect(providerState("bluesky", [])).toBe("not_configured");
    expect(providerState("threads", [{ provider: "threads", configured: true }])).toBe("available");
  });

  it("sends OAuth connects to brain's redirect for the provider", () => {
    expect(connectUrl("threads")).toBe(`${apiUrl}/connections/threads/redirect`);
    expect(connectUrl("instagram")).toBe(`${apiUrl}/connections/meta/redirect`);
    expect(connectUrl("linkedin")).toBe(`${apiUrl}/connections/linkedin/redirect`);
    expect(connectUrl("youtube")).toBe(`${apiUrl}/connections/youtube/redirect`);
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
    expect(safeAvatar("https://evil.com/yt3.ggpht.com")).toBeNull();
    expect(safeAvatar("http://yt3.ggpht.com/abc")).toBeNull();
    expect(safeAvatar("https://cdn.bsky.app/img/avatar/plain/x.jpg")).toBe("https://cdn.bsky.app/img/avatar/plain/x.jpg");
    expect(safeAvatar("https://cdn.bsky.app.evil.com/x.jpg")).toBeNull();
    expect(safeAvatar("http://cdn.bsky.app/img/x.jpg")).toBeNull();
    expect(safeAvatar("https://cdn.bsky.app/other/x.jpg")).toBeNull();
    expect(safeAvatar(null)).toBeNull();
  });
});
