import { describe, expect, it } from "vitest";
import { indexNowKey } from "@/lib/indexnow";

describe("indexNowKey", () => {
  it("is off when INDEXNOW_KEY is unset or malformed", () => {
    expect(indexNowKey(undefined)).toBeNull();
    expect(indexNowKey("")).toBeNull();
    expect(indexNowKey("short")).toBeNull();
    expect(indexNowKey("has spaces in it")).toBeNull();
    expect(indexNowKey("a".repeat(129))).toBeNull();
  });

  it("returns a well-formed key", () => {
    expect(indexNowKey("0123abcd-EF45")).toBe("0123abcd-EF45");
  });
});
