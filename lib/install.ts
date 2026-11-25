// Installing the app. Chrome and Edge offer an install prompt (`beforeinstallprompt`); Safari has none, so it gets a hint.
type Offer = Event & { prompt(): Promise<void> };

let offer: Offer | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

// Called once from components/pwa.tsx. The browser fires `beforeinstallprompt` at most once per page load, so it is kept here
// until the user picks "Install app" in the account menu.
let watching = false;
export function watchInstall() {
  if (watching) return;
  watching = true;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    offer = e as Offer;
    changed();
  });
  addEventListener("appinstalled", () => {
    offer = null;
    changed();
  });
}

export const subscribeInstall = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

// What the menu shows: nothing (already installed, or no way to install), a button, or how to do it in Safari.
export type InstallMode = "none" | "prompt" | "ios" | "safari";

export function installMode(): InstallMode {
  if (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) return "none";
  if (offer) return "prompt";
  const ua = navigator.userAgent;
  // Firefox on iOS cannot add to the home screen. iPadOS 13 and later reports itself as a Mac, with a touch screen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return /FxiOS/.test(ua) ? "none" : "ios";
  // Safari 17 and later on a Mac has "Add to Dock". Chrome, Edge and Firefox name themselves too, so leave them out.
  return /Macintosh/.test(ua) && /Version\/\d+.*Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua) ? "safari" : "none";
}

export async function promptInstall() {
  const o = offer;
  // The offer works once.
  offer = null;
  changed();
  await o?.prompt();
}
