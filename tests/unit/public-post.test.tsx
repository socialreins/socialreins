// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicPostView } from "@/components/public-post";

const post = {
  team: "Acme",
  body: "Hello from the page",
  media: [],
  thread: [],
  details: "",
  newsletter: false,
  published_at: "2026-11-20T09:00:00Z",
  links: [],
};

// brain's answers: the page itself, and the providers the sign-up forms ask for.
const mock = (page: () => Response) =>
  vi.fn((url: string) => Promise.resolve(String(url).endsWith("/auth/providers") ? Response.json({ google: false, turnstileSiteKey: null }) : page()));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PublicPostView", () => {
  it("offers Retry when the post could not be read, and shows it once the retry works", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      mock(() => (++calls === 1 ? new Response(null, { status: 503 }) : Response.json(post))),
    );
    render(<PublicPostView code="abcd234567" />);
    expect(await screen.findByText(/couldn't be loaded/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Hello from the page")).toBeTruthy();
    expect(calls).toBe(2);
  });

  it("gives a picture its author's alt text and caps the report's email box", async () => {
    vi.stubGlobal("fetch", mock(() => Response.json({ ...post, media: ["https://example.com/cat.png"], media_alt: ["A cat on a wall"] })));
    render(<PublicPostView code="abcd234567" />);
    expect(await screen.findByAltText("A cat on a wall")).toBeTruthy();
    expect(screen.getByLabelText("Email for an answer (optional)").getAttribute("maxlength")).toBe("254");
  });
});
