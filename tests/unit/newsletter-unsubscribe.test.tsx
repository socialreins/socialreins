// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewsletterUnsubscribe } from "@/components/newsletter-unsubscribe";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NewsletterUnsubscribe", () => {
  it("says the link is incomplete, and calls nothing, when the code is missing", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<NewsletterUnsubscribe token="  " />);
    expect(screen.getByText("That link is incomplete")).toBeTruthy();
    expect(screen.getByText(/missing the code/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unsubscribe" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still unsubscribes when the link has its code", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ status: "ok" })));
    vi.stubGlobal("fetch", fetch);
    render(<NewsletterUnsubscribe token={"a".repeat(64)} />);
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    expect(await screen.findByText("You are unsubscribed")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
