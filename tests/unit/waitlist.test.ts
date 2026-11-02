import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, joinWaitlist, waitlistCount, waitlistCountText } from "@/lib/waitlist";

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
    expect(await joinWaitlist("a@b.co")).toBe(result);
  });

  it("reports a network failure as error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await joinWaitlist("a@b.co")).toBe("error");
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
    expect(await pending).toBe("timeout");
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
