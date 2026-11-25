// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaitlistForm } from "@/components/waitlist-form";

const respond = (status: number) => vi.fn().mockResolvedValue(new Response(null, { status }));

async function submit(email = "a@b.co") {
  fireEvent.change(screen.getByLabelText("Email for the hosted version waitlist"), { target: { value: email } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "Join the waitlist" }).closest("form")!);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WaitlistForm", () => {
  it("shows success in the live region and moves focus to it", async () => {
    vi.stubGlobal("fetch", respond(200));
    render(<WaitlistForm />);
    const message = screen.getByRole("status");
    expect(message).toHaveProperty("textContent", "");
    await submit();
    expect(message.textContent).toMatch(/Check your email for a link to confirm your spot/);
    expect(document.activeElement).toBe(message);
  });

  it("shows the count, refetches it after joining and sends no Turnstile token", async () => {
    let count = 41;
    const fetch = vi.fn((url: string) =>
      Promise.resolve(url.endsWith("/count") ? Response.json({ count: count++ }) : new Response(null, { status: 200 })),
    );
    vi.stubGlobal("fetch", fetch);
    render(<WaitlistForm />);
    expect(await screen.findByText("41 people on the waitlist")).toBeTruthy();
    await submit();
    expect(await screen.findByText("42 people on the waitlist")).toBeTruthy();
    const join = fetch.mock.calls.find(([url]) => url.endsWith("/v1/waitlist")) as unknown as [string, RequestInit];
    expect(JSON.parse(String(join[1].body))).toEqual({ email: "a@b.co", source: "landing" });
  });

  it("waits for a Turnstile token when brain has it on, sends it, then resets the widget", async () => {
    const reset = vi.fn();
    let pass!: (token: string) => void;
    window.turnstile = {
      render: (_el, o) => ((pass = o.callback), "w1"),
      reset,
      remove: vi.fn(),
    };
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith("/auth/providers")
          ? Response.json({ google: false, turnstile_site_key: "site" })
          : url.endsWith("/count")
            ? Response.json({ count: 1 })
            : new Response(null, { status: 200 }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<WaitlistForm />);
    const button = screen.getByRole("button", { name: "Join the waitlist" });
    await waitFor(() => expect(button).toHaveProperty("disabled", true));
    await waitFor(() => expect(pass).toBeTypeOf("function"));
    act(() => pass("tok"));
    expect(button).toHaveProperty("disabled", false);
    await submit();
    const join = fetch.mock.calls.find(([url]) => url.endsWith("/v1/waitlist")) as unknown as [string, RequestInit];
    expect(JSON.parse(String(join[1].body))).toEqual({ email: "a@b.co", source: "landing", turnstile_token: "tok" });
    expect(reset).toHaveBeenCalled();
    delete window.turnstile;
  });

  it("shows the captcha message when brain refuses the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "captcha_failed" }, { status: 422 })));
    render(<WaitlistForm />);
    await submit();
    expect(screen.getByRole("status").textContent).toMatch(/check didn't pass/);
  });

  it("keeps the same live region for errors and the form usable", async () => {
    vi.stubGlobal("fetch", respond(422));
    render(<WaitlistForm />);
    const message = screen.getByRole("status");
    await submit("bad");
    expect(screen.getByRole("status")).toBe(message);
    expect(message.textContent).toMatch(/doesn't look right/);
    expect(screen.getByLabelText("Email for the hosted version waitlist").getAttribute("aria-invalid")).toBe("true");
  });

  it("clears the message while sending so a repeated error is announced again", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    render(<WaitlistForm />);
    const message = screen.getByRole("status");
    fireEvent.change(screen.getByLabelText("Email for the hosted version waitlist"), { target: { value: "a@b.co" } });
    fireEvent.submit(message.closest("form")!);
    expect(message.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Joining..." })).toHaveProperty("disabled", true);
    await act(async () => resolve(new Response(null, { status: 429 })));
    expect(message.textContent).toMatch(/Too many attempts/);
  });
});
