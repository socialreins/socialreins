// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaitlistForm } from "@/components/waitlist-form";

const TOKEN = "t".repeat(64);
const respond = (status: number) =>
  vi.fn((..._args: unknown[]) => Promise.resolve(status === 200 ? Response.json({ status: "ok", name_token: TOKEN }) : new Response(null, { status })));

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
  it("asks for an optional name next, and Skip goes to the check-your-email state", async () => {
    const fetch = respond(200);
    vi.stubGlobal("fetch", fetch);
    render(<WaitlistForm />);
    const message = screen.getByRole("status");
    expect(message).toHaveProperty("textContent", "");
    await submit();
    expect(screen.getByLabelText("What should we call you? (optional)")).toBeTruthy();
    expect(message.textContent).toMatch(/We sent a link to your email/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    });
    expect(message.textContent).toMatch(/Check your email to confirm your spot/);
    expect(document.activeElement).toBe(message);
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/name"))).toBe(false);
  });

  it("sends the trimmed name with the token, then shows the check-your-email state", async () => {
    const fetch = respond(200);
    vi.stubGlobal("fetch", fetch);
    render(<WaitlistForm />);
    await submit();
    fireEvent.change(screen.getByLabelText("What should we call you? (optional)"), { target: { value: "  Ann Lee " } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form")!);
    });
    const call = fetch.mock.calls.find(([url]) => String(url).endsWith("/v1/waitlist/name")) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toEqual({ token: TOKEN, name: "Ann Lee" });
    expect(screen.getByRole("status").textContent).toMatch(/Check your email to confirm your spot/);
  });

  it("keeps the name step open on a failed save so the person can retry or skip", async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(String(url).endsWith("/name") ? new Response(null, { status: 422 }) : Response.json({ name_token: TOKEN })),
    );
    vi.stubGlobal("fetch", fetch);
    render(<WaitlistForm />);
    await submit();
    fireEvent.change(screen.getByLabelText("What should we call you? (optional)"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form")!);
    });
    expect(screen.getByRole("status").textContent).toMatch(/doesn't work/);
    const input = screen.getByLabelText("What should we call you? (optional)");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
  });

  it("clears a bad-email flag once the retry joins, so the name field starts clean", async () => {
    let first = true;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          String(url).endsWith("/count") ? Response.json({ count: 1 }) : first ? ((first = false), new Response(null, { status: 422 })) : Response.json({ name_token: TOKEN }),
        ),
      ),
    );
    render(<WaitlistForm />);
    await submit("bad");
    expect(screen.getByLabelText("Email for the hosted version waitlist").getAttribute("aria-invalid")).toBe("true");
    await submit("a@b.co");
    expect(screen.getByLabelText("What should we call you? (optional)").getAttribute("aria-invalid")).toBeNull();
  });

  it("goes straight to the last step when brain sent no name token", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ status: "ok" }))));
    render(<WaitlistForm />);
    await submit();
    expect(screen.getByRole("status").textContent).toMatch(/Check your email to confirm your spot/);
  });

  it("shows the count of confirmed people and sends no Turnstile token", async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(url.endsWith("/count") ? Response.json({ count: 41 }) : Response.json({ name_token: TOKEN })),
    );
    vi.stubGlobal("fetch", fetch);
    render(<WaitlistForm />);
    expect(await screen.findByText("41 people on the waitlist")).toBeTruthy();
    await submit();
    const join = fetch.mock.calls.find(([url]) => url.endsWith("/v1/waitlist")) as unknown as [string, RequestInit];
    expect(JSON.parse(String(join[1].body))).toEqual({ email: "a@b.co", source: "landing" });
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
    fireEvent.submit(screen.getByRole("button", { name: "Join the waitlist" }).closest("form")!);
    expect(message.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Joining..." })).toHaveProperty("disabled", true);
    await act(async () => resolve(new Response(null, { status: 429 })));
    expect(message.textContent).toMatch(/Too many attempts/);
  });
});
