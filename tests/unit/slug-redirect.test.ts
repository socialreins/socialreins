import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetRetired, retiredAddress, retiredRedirect } from "@/lib/slug-redirect";

const brain = "http://brain.test";
const reply = (status: number, body?: unknown) => vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const ask = (f: ReturnType<typeof vi.fn>) => f as unknown as typeof fetch;

beforeEach(forgetRetired);

describe("retiredRedirect", () => {
  it("swaps the team and keeps the page", () => {
    expect(retiredRedirect("/t/old-co/posts/12", "new-co")).toBe("/t/new-co/posts/12");
    expect(retiredRedirect("/t/old-co", "k7q2mf")).toBe("/t/k7q2mf");
  });
});

describe("retiredAddress", () => {
  it("asks brain, lowercased, and remembers a redirect for 15 seconds", async () => {
    const f = reply(200, { address: "new-co" });
    expect(await retiredAddress("Old-Co", brain, ask(f), 1000)).toBe("new-co");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(`${brain}/v1/public/team-slugs/old-co`);
    expect(await retiredAddress("old-co", brain, ask(f), 1000 + 14_000)).toBe("new-co");
    expect(f).toHaveBeenCalledTimes(1);
    expect(await retiredAddress("old-co", brain, ask(f), 1000 + 16_000)).toBe("new-co");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("asks once for requests that arrive together, and never sends an address to itself", async () => {
    const f = reply(200, { address: "new-co" });
    const all = await Promise.all([1, 2, 3].map(() => retiredAddress("old-co", brain, ask(f), 0)));
    expect(all).toEqual(["new-co", "new-co", "new-co"]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(await retiredAddress("same-co", brain, ask(reply(200, { address: "same-co" })))).toBeNull();
  });

  it("forgets the oldest of 500 addresses first, keeping the rest", async () => {
    const f = reply(404);
    for (let i = 0; i < 501; i++) await retiredAddress(`team-${i}`, brain, ask(f), 0);
    expect(f).toHaveBeenCalledTimes(501);
    await retiredAddress("team-500", brain, ask(f), 1);
    expect(f).toHaveBeenCalledTimes(501);
    await retiredAddress("team-0", brain, ask(f), 1);
    expect(f).toHaveBeenCalledTimes(502);
  });

  it("remembers that an address is current for 15 seconds", async () => {
    const f = reply(404);
    expect(await retiredAddress("acme", brain, ask(f), 0)).toBeNull();
    expect(await retiredAddress("acme", brain, ask(f), 14_000)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(await retiredAddress("acme", brain, ask(f), 16_000)).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not ask for what cannot be an address, and trusts only a well formed answer", async () => {
    const f = reply(200, { address: "new-co" });
    for (const odd of ["_", "ab", "a_b", "x".repeat(33), "a/b"]) expect(await retiredAddress(odd, brain, ask(f))).toBeNull();
    expect(f).not.toHaveBeenCalled();
    for (const address of ["../evil", "a b", "", 5, "https://evil.example"]) {
      forgetRetired();
      expect(await retiredAddress("old-co", brain, ask(reply(200, { address })))).toBeNull();
    }
  });

  it("gives up quietly when brain fails, and does not ask again for 5 seconds", async () => {
    const down = vi.fn(async () => Promise.reject(new Error("down")));
    expect(await retiredAddress("old-co", brain, ask(down), 0)).toBeNull();
    expect(await retiredAddress("old-co", brain, ask(down), 4000)).toBeNull();
    expect(down).toHaveBeenCalledTimes(1);
    expect(await retiredAddress("old-two", brain, ask(reply(429)), 0)).toBeNull();
    const f = reply(200, { address: "new-co" });
    expect(await retiredAddress("old-co", brain, ask(f), 6000)).toBe("new-co");
  });
});
