import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { suggestSlug } from "@/lib/teams";
import { TEAM_PAGES } from "@/lib/team-path";

describe("suggestSlug", () => {
  it("makes an address from a team name, or none", () => {
    expect(suggestSlug("Acme Co.")).toBe("acme-co");
    expect(suggestSlug("  Café  Münch ")).toBe("cafe-munch");
    expect(suggestSlug("A".repeat(40))).toBe("a".repeat(32));
    expect(suggestSlug(`${"ab ".repeat(11)}cd`)).toBe("ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab");
    expect(suggestSlug("Ab")).toBe("");
    expect(suggestSlug("東京チーム")).toBe("");
  });
});

// brain refuses a team address that is the first path segment of a web route (crates/core/src/team.rs, RESERVED_SLUGS).
// The brain checkout is a submodule, which CI may not have; with it, a new route that brain does not reserve fails here.
const brainTeam = "brain/crates/core/src/team.rs";
describe.skipIf(!existsSync(brainTeam))("reserved team addresses", () => {
  const source = existsSync(brainTeam) ? readFileSync(brainTeam, "utf8") : "";
  const reserved = new Set([...(source.match(/RESERVED_SLUGS: &\[&str\] = &\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]));

  it("holds every first path segment of the web app", () => {
    const routes = readdirSync("app", { withFileTypes: true })
      .filter((d) => d.isDirectory() || /\.(txt|ts|js)$/.test(d.name))
      .map((d) => d.name.replace(/\.(txt|ts|js)$/, ""))
      // Groups, dynamic and private folders and files such as favicon or the images are not paths.
      .filter((n) => !/^[(\[_]/.test(n) && n !== "favicon" && !n.includes("-image") && n !== "icon" && n !== "apple-icon" && n !== "layout" && n !== "page" && n !== "globals" && n !== "opengraph-image");
    expect(reserved.size).toBeGreaterThan(50);
    expect(routes.filter((r) => !reserved.has(r))).toEqual([]);
  });

  it("holds the pages of a team and the sign-in and account pages", () => {
    const missing = [...TEAM_PAGES, "login", "signup", "welcome", "profile", "security", "admin", "invitations", "t", "p"].filter((p) => !reserved.has(p));
    expect(missing).toEqual([]);
  });
});
