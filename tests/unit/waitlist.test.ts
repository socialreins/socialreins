import { afterEach, describe, expect, it, vi } from "vitest";
import { addWaitlistName, apiUrl, joinWaitlist, verifyWaitlist, waitlistCount, waitlistCountText } from "@/lib/waitlist";

const respond = (status: number) => vi.fn().mockResolvedValue(new Response(null, { status }));

afterEach(() => vi.unstubAllGlobals());

describe("joinWaitlist", () => {
  it("posts the email and source as JSON to /v1/waitlist", async () => {
    const fetch = respond(200);
    vi.stubGlobal("fetch", fetch);
    await joinWaitlist("a@b.co", "landing");
    expect(fetch).toHaveBeenCalledWith(`${apiUrl}/v1/waitlist`, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ email: "a@b.co", source: "landing" });
  });

  it.each([
    [200, "joined"], // new email and duplicate both return 200
    [422, "invalid"],
    [429, "rate_limited"],
    [500, "error"],
  ])("maps %i to %s", async (status, result) => {
    vi.stubGlobal("fetch", respond(status));
    expect((await joinWaitlist("a@b.co")).result).toBe(result);
  });

  it("hands back the name token of the answer, null when there is none", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "ok", name_token: "t".repeat(64) })));
    expect(await joinWaitlist("a@b.co")).toEqual({ result: "joined", nameToken: "t".repeat(64) });
    vi.stubGlobal("fetch", respond(200));
    expect(await joinWaitlist("a@b.co")).toEqual({ result: "joined", nameToken: null });
  });

  it("reports a network failure as error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect((await joinWaitlist("a@b.co")).result).toBe("error");
  });
});

describe("addWaitlistName", () => {
  it("posts the token and name to /v1/waitlist/name", async () => {
    const fetch = respond(200);
    vi.stubGlobal("fetch", fetch);
    expect(await addWaitlistName("tok", "Ann")).toBe("saved");
    expect(fetch.mock.calls[0]![0]).toBe(`${apiUrl}/v1/waitlist/name`);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ token: "tok", name: "Ann" });
  });

  it.each([
    [422, "invalid"],
    [429, "rate_limited"],
    [500, "error"],
  ])("maps %i to %s", async (status, result) => {
    vi.stubGlobal("fetch", respond(status));
    expect(await addWaitlistName("tok", "Ann")).toBe(result);
  });
});

describe("joinWaitlist timeout", () => {
  it("aborts after 10 seconds and reports a timeout", async () => {
    // AbortSignal.timeout uses Node's internal timers, which fake timers do not control.
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))),
      ),
    );
    const pending = joinWaitlist("a@b.co");
    controller.abort(new DOMException("timed out", "TimeoutError"));
    expect((await pending).result).toBe("timeout");
    expect(timeout).toHaveBeenCalledWith(10_000);
    timeout.mockRestore();
  });
});

describe("waitlistCount", () => {
  it("reads the count from /v1/waitlist/count", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ count: 1234 }));
    vi.stubGlobal("fetch", fetch);
    expect(await waitlistCount()).toBe(1234);
    expect(fetch.mock.calls[0]![0]).toBe(`${apiUrl}/v1/waitlist/count`);
  });

  it.each([
    ["an error status", () => Promise.resolve(Response.json({ error: "x" }, { status: 500 }))],
    ["a bad body", () => Promise.resolve(Response.json({ count: "many" }))],
    ["a network failure", () => Promise.reject(new TypeError("offline"))],
  ])("is null on %s", async (_, answer) => {
    vi.stubGlobal("fetch", vi.fn(answer));
    expect(await waitlistCount()).toBeNull();
  });

  it("words the count", () => {
    expect(waitlistCountText(1)).toBe("1 person on the waitlist");
    expect(waitlistCountText(0)).toBe("0 people on the waitlist");
    expect(waitlistCountText(1234)).toBe(`${(1234).toLocaleString()} people on the waitlist`);
  });
});

describe("verifyWaitlist", () => {
  it("posts the token to /v1/waitlist/verify without credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "verified" }));
    vi.stubGlobal("fetch", fetch);
    expect(await verifyWaitlist("abc123")).toBe("verified");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${apiUrl}/v1/waitlist/verify`);
    expect(init).toMatchObject({ method: "POST" });
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ token: "abc123" });
  });

  it.each([
    [422, "invalid"],
    [429, "rate_limited"],
    [500, "error"],
  ])("maps %i to %s", async (status, result) => {
    vi.stubGlobal("fetch", respond(status));
    expect(await verifyWaitlist("abc")).toBe(result);
  });

  it("calls a missing token invalid without asking brain", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await verifyWaitlist("")).toBe("invalid");
    expect(fetch).not.toHaveBeenCalled();
  });
});
