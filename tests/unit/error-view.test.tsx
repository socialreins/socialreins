// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorView } from "@/components/error-view";
import AppError from "@/app/(app)/error";

afterEach(cleanup);

describe("ErrorView", () => {
  it("offers to try again and a way home, and logs the error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const boom = new Error("boom");
    render(<ErrorView error={boom} retry={retry} home="/home" />);
    expect(screen.getByRole("alert").textContent).toMatch(/Something went wrong/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Go to your team" }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeTruthy();
    expect(log).toHaveBeenCalledWith(boom);
    log.mockRestore();
  });

  it("the app's boundary points home at the team", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppError error={new Error("x")} retry={() => {}} />);
    expect(screen.getByRole("link", { name: "Go to your team" }).getAttribute("href")).toBe("/home");
  });
});
