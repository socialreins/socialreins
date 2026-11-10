import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStars, formatStars } from "@/lib/github";

afterEach(() => vi.unstubAllGlobals());

describe("fetchStars", () => {
  it("sums the org's repos in one request, skipping archived repos and forks", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json([
        { name: "socialreins", stargazers_count: 3, archived: false, fork: false },
        { name: "brain", stargazers_count: 2, archived: false, fork: false },
        { name: ".github", stargazers_count: 1, archived: false, fork: false },
        { name: "old", stargazers_count: 50, archived: true, fork: false },
        { name: "fork", stargazers_count: 40, archived: false, fork: true },
      ]),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await fetchStars()).toEqual({ total: 6, byRepo: { socialreins: 3, brain: 2, ".github": 1 } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("https://api.github.com/orgs/socialreins/repos?type=public&per_page=100");
  });

  it.each([
    ["a non-200 response", () => Promise.resolve(new Response(null, { status: 403 }))],
    ["a network failure", () => Promise.reject(new TypeError("offline"))],
    ["a body that is not a list", () => Promise.resolve(Response.json({ message: "Not Found" }))],
    ["a missing count", () => Promise.resolve(Response.json([{ name: "brain" }]))],
  ])("returns null on %s", async (_, impl) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(impl));
    expect(await fetchStars()).toBeNull();
  });
});

it("formats large counts compactly", () => {
  expect(formatStars(7)).toBe("7");
  expect(formatStars(1234)).toBe("1.2K");
});
