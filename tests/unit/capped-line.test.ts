import { describe, expect, it } from "vitest";
import { cappedLine } from "@/components/ui";

// The line a capped list shows: brain caps these lists (the latest 200 broadcasts and
// newsletters, the newest 5000 subscribers), and the page says plainly what is missing.
describe("cappedLine", () => {
  it("says nothing while everything fits", () => {
    expect(cappedLine(3, 3, "broadcasts")).toBe("");
    expect(cappedLine(0, 0, "newsletters")).toBe("");
    // An older brain sends no total: the rows shown stand in for it.
    expect(cappedLine(200, 200, "broadcasts")).toBe("");
  });

  it("says the true total and how many are not shown", () => {
    expect(cappedLine(200, 230, "broadcasts")).toBe(
      "Showing the 200 newest of 230 broadcasts. 30 older broadcasts are not shown.",
    );
    expect(cappedLine(5000, 8230, "subscribers")).toBe(
      "Showing the 5,000 newest of 8,230 subscribers. 3,230 older subscribers are not shown.",
    );
    expect(cappedLine(200, 201, "newsletters")).toBe(
      "Showing the 200 newest of 201 newsletters. 1 older newsletter is not shown.",
    );
  });
});
