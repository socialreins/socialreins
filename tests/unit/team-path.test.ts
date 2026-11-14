import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legacyRedirects, MY_TEAM, splitTeamPath, TEAM_PAGES, teamPath } from "@/lib/team-path";

describe("team addresses", () => {
  it("puts team pages under /t/<code> and leaves the rest alone", () => {
    expect(teamPath("k7q2mf", "/posts")).toBe("/t/k7q2mf/posts");
    expect(teamPath("k7q2mf", "/posts/12?x=1#top")).toBe("/t/k7q2mf/posts/12?x=1#top");
    expect(teamPath("k7q2mf", "/inbox?item=9")).toBe("/t/k7q2mf/inbox?item=9");
    for (const outside of ["/", "/profile", "/security#passkeys", "/admin/users", "/login?next=/home", "/t/abc234/home", "/postscript"])
      expect(teamPath("k7q2mf", outside)).toBe(outside);
  });

  it("reads the code and the page back, in lowercase", () => {
    expect(splitTeamPath("/t/k7q2mf/posts/12")).toEqual(["k7q2mf", "/posts/12"]);
    expect(splitTeamPath("/t/K7Q2MF/home")).toEqual(["k7q2mf", "/home"]);
    expect(splitTeamPath("/t/k7q2mf")).toEqual(["k7q2mf", "/home"]);
    expect(splitTeamPath("/t/_/connections")).toEqual([MY_TEAM, "/connections"]);
    expect(splitTeamPath("/profile")).toEqual([null, "/profile"]);
    expect(splitTeamPath("/team")).toEqual([null, "/team"]);
  });

  it("sends every old address to the current team's", () => {
    const redirects = legacyRedirects();
    expect(redirects).toContainEqual({ source: "/posts/:path*", destination: "/t/_/posts/:path*", permanent: false });
    expect(redirects).toContainEqual({ source: "/home", destination: "/t/_/home", permanent: false });
    expect(redirects).toContainEqual({ source: "/t/:team", destination: "/t/:team/home", permanent: false });
    expect(redirects).toHaveLength(TEAM_PAGES.length * 2 + 1);
  });

  it("has a page folder for every team page, and no other", () => {
    expect(readdirSync("app/(app)/t/[team]").sort()).toEqual([...TEAM_PAGES].sort());
  });

  // A bare <Link href="/posts"> or router.push("/posts") still works through the redirect, but lands on the
  // account's current team, which is the wrong team in a second tab. Team links go through components/team-link.tsx.
  it("no component links to a team page around the helper", () => {
    const page = `["\`]/(${TEAM_PAGES.join("|")})\\b`;
    const files = (readdirSync(".", { recursive: true }) as string[]).filter((f) => /^(components|app)\/.*\.tsx$/.test(f) && f !== "components/team-link.tsx");
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/from "next\/link"/.test(src)) expect(src, f).not.toMatch(new RegExp(`href[=:]\\s*\\{?${page}`));
      if (/useRouter \} from "next\/navigation"|useRouter, /.test(src)) expect(src, f).not.toMatch(new RegExp(`router\\.(push|replace)\\(${page}`));
    }
  });
});
