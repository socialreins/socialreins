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

describe("the other boundaries", () => {
  it("the admin one points home at the overview, the public one at the home page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Admin = (await import("@/app/admin/error")).default;
    render(<Admin error={new Error("x")} retry={() => {}} />);
    expect(screen.getByRole("link", { name: "Go to the admin overview" }).getAttribute("href")).toBe("/admin");
    cleanup();
    const Public = (await import("@/app/error")).default;
    render(<Public error={new Error("x")} retry={() => {}} />);
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
  });

  it("the root one is a whole document with a retry", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const Global = (await import("@/app/global-error")).default;
    const html = renderToStaticMarkup(<Global error={new Error("x")} retry={() => {}} />);
    expect(html).toMatch(/^<html[^>]*>.*<body[^>]*>/);
    expect(html).toMatch(/Something went wrong/);
    expect(html).toMatch(/Try again/);
  });
});
