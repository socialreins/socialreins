import { expect, test } from "@playwright/test";

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" } };

// Text on its surface, read from the app's own CSS in the browser. Each is [name, text, what it sits on, bottom first]:
// a token name, or a class list (with data-* attributes) whose color or background is taken.
const pairs: [string, string, string[]][] = [
  ["ink on paper", "--color-ink", ["--color-paper"]],
  ["ink on canvas", "--color-ink", ["--color-canvas"]],
  ["soft ink on paper", "--color-ink-soft", ["--color-paper"]],
  ["soft ink on the sidebar", "--color-ink-soft", ["--side"]],
  ["faint text on paper", "--faint", ["--color-paper"]],
  ["faint text on the sidebar", "--faint", ["--side"]],
  ["nav text on the sidebar", "--nav", ["--side"]],
  ["accent text on paper", "--color-signal-deep", ["--color-paper"]],
  ["danger text on paper", "--color-danger", ["--color-paper"]],
  ["primary button", "btn btn-primary", ["--color-paper", "btn btn-primary"]],
  ["danger button", "btn btn-danger-solid", ["--color-paper", "btn btn-danger-solid"]],
  ...["", "status=scheduled", "status=queued", "status=published", "status=failed", "status=draft", "approval=pending", "approval=rejected", "kind=comment", "kind=mention", "kind=dm"].map(
    (data): [string, string, string[]] => [`badge ${data || "plain"}`, `badge tone ${data}`, ["--color-paper", `badge tone ${data}`]],
  ),
];

for (const theme of ["light", "dark"])
  test(`text meets WCAG AA contrast on its surface in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem("theme", t);
      localStorage.setItem("passkey-prompt-snoozed-at", String(Date.now()));
    }, theme);
    await page.route("**/auth/me", (r) => r.fulfill({ json: me }));
    await page.route("**/auth/passkeys", (r) => r.fulfill({ json: [] }));
    await page.route(/\/v1\//, (r) => r.fulfill({ json: [] }));
    await page.goto("/profile");
    await expect(page.locator(".app-root #main")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const ratios = await page.evaluate((pairs) => {
      const root = document.querySelector(".app-root")!;
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      // The computed color of a token or of a class's text or background, whatever syntax the browser gives it in.
      const css = (spec: string, prop: "color" | "backgroundColor") => {
        const el = root.appendChild(document.createElement("span"));
        if (spec.startsWith("--")) el.style[prop] = `var(${spec})`;
        else
          for (const word of spec.split(" ").filter(Boolean)) {
            const [key, value] = word.split("=");
            if (value) el.dataset[key] = value;
            else el.classList.add(key);
          }
        const color = getComputedStyle(el)[prop];
        el.remove();
        return color;
      };
      // Paint the layers over each other on a canvas and read the pixel: translucent fills land on what is under them.
      const paint = (layers: string[]) => {
        ctx.clearRect(0, 0, 1, 1);
        for (const layer of layers) {
          ctx.fillStyle = layer;
          ctx.fillRect(0, 0, 1, 1);
        }
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return pairs.map(([name, text, under]) => {
        const surface = under.map((u) => css(u, "backgroundColor"));
        const [a, b] = [luminance(paint(surface)), luminance(paint([...surface, css(text, "color")]))];
        return { name, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 };
      });
    }, pairs);

    expect(ratios.filter((r) => r.ratio < 4.5)).toEqual([]);
    expect(ratios).toHaveLength(pairs.length);
  });
