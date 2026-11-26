// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getProviders: vi.fn(async () => ({ google: false, turnstileSiteKey: null })),
  requestLink: vi.fn(async () => "sent" as const),
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { EmailLinkForm, RESEND_AFTER_MS } from "@/components/email-link-form";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EmailLinkForm", () => {
  it("offers to send the link again once a minute has passed", async () => {
    vi.useFakeTimers();
    render(<EmailLinkForm mode="login" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    });
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use a different email" })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(RESEND_AFTER_MS - 1000);
    });
    expect(screen.queryByRole("button", { name: "Send it again" })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole("button", { name: "Send it again" }));
    // Back at the form with the address still there.
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("a@b.co");
  });
});
