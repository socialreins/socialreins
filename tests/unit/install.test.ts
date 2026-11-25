import { afterEach, describe, expect, it, vi } from "vitest";
import { installMode, promptInstall, watchInstall } from "@/lib/install";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const env = (ua: string, o: { standalone?: boolean; touch?: number } = {}) => {
  vi.stubGlobal("navigator", { userAgent: ua, maxTouchPoints: o.touch ?? 0 });
  vi.stubGlobal("matchMedia", () => ({ matches: !!o.standalone }));
};

afterEach(() => vi.unstubAllGlobals());

describe("installMode", () => {
  it("shows a Share hint on iPhone and iPad, and the Dock hint in Safari on a Mac", () => {
    env(IPHONE);
    expect(installMode()).toBe("ios");
    env(MAC_SAFARI, { touch: 5 });
    expect(installMode()).toBe("ios");
    env(MAC_SAFARI);
    expect(installMode()).toBe("safari");
  });

  it("shows nothing in other desktop browsers, in Firefox on iOS or once installed", () => {
    env(MAC_CHROME);
    expect(installMode()).toBe("none");
    env(IPHONE + " FxiOS/127.0");
    expect(installMode()).toBe("none");
    env(IPHONE, { standalone: true });
    expect(installMode()).toBe("none");
    env(MAC_SAFARI, { standalone: true });
    expect(installMode()).toBe("none");
  });

  it("offers the browser's prompt once beforeinstallprompt fired, and only once", async () => {
    const handlers: Record<string, (e: Event) => void> = {};
    vi.stubGlobal("addEventListener", (name: string, f: (e: Event) => void) => (handlers[name] = f));
    watchInstall();
    env(MAC_CHROME);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const preventDefault = vi.fn();
    handlers.beforeinstallprompt({ prompt, preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalled();
    expect(installMode()).toBe("prompt");
    await promptInstall();
    expect(prompt).toHaveBeenCalledOnce();
    expect(installMode()).toBe("none");
    await promptInstall();
    expect(prompt).toHaveBeenCalledOnce();
  });
});
