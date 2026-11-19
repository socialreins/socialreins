import { describe, expect, it } from "vitest";
import { gaId, tracked } from "@/lib/ga";

describe("ga", () => {
  it("tracks public marketing pages only", () => {
    for (const p of ["/", "/pricing", "/compare/buffer", "/docs", "/privacy", "/login", "/signup", "/post-types"]) expect(tracked(p)).toBe(true);
    for (const p of ["/t/abc123/home", "/app", "/app/posts", "/admin", "/admin/users", "/p/abcdefghjk", "/profile", "/security", "/welcome", "/invitations/tok", "/newsletter/verify", "/waitlist/verify", "/billing", "/login/email", "/signup/email"])
      expect(tracked(p)).toBe(false);
  });

  it("reads only a well-formed GA4 id", () => {
    expect(gaId("G-ABC123XYZ9")).toBe("G-ABC123XYZ9");
    expect(gaId(" G-ABC123XYZ9 ")).toBe("G-ABC123XYZ9");
    for (const bad of [undefined, "", "UA-1234-1", "G-abc", "G-ABC\";alert(1)//"]) expect(gaId(bad)).toBeNull();
  });
});
