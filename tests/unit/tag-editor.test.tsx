// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagEditor } from "@/components/tag-editor";
import { MAX_TAGS } from "@/lib/contacts";

afterEach(cleanup);

const full = Array.from({ length: MAX_TAGS }, (_, i) => `tag${i}`);

describe("TagEditor", () => {
  it("says when the contact has the most tags, instead of taking one that would go nowhere", () => {
    const onChange = vi.fn();
    render(<TagEditor id="tags" tags={full} suggestions={[]} onChange={onChange} />);
    const input = screen.getByLabelText("New tag");
    expect(input).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Add tag" })).toHaveProperty("disabled", true);
    expect(screen.getByText(new RegExp(`${MAX_TAGS} tags is the most`))).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adds a typed tag while there is room", () => {
    const onChange = vi.fn();
    render(<TagEditor id="tags" tags={["one"]} suggestions={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "Two Words" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onChange).toHaveBeenCalledWith(["one", "two words"]);
  });
});
