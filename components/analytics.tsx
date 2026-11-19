"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { tracked } from "@/lib/ga";

type GaWindow = Window & { __GA_ID?: string | null; dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

// Switches GA off or on for an address before the browser moves there, so gtag's own history listener never
// reports an app page or a token address.
function guardHistory(w: GaWindow, id: string) {
  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name].bind(history);
    history[name] = (data: unknown, unused: string, url?: string | URL | null) => {
      if (url != null) w[`ga-disable-${id}`] = !tracked(new URL(url, location.href).pathname);
      return original(data, unused, url);
    };
  }
  addEventListener("popstate", () => (w[`ga-disable-${id}`] = !tracked(location.pathname)));
}

// Only a referrer from another site is kept, and only its origin and path: a same-site one may be an app page or carry a token.
function externalReferrer() {
  try {
    const r = new URL(document.referrer);
    return r.origin === location.origin ? "" : r.origin + r.pathname;
  } catch {
    return "";
  }
}

// Loads gtag.js the first time a tracked page shows, and sends one page view per tracked address, without its
// query string. On any other page GA is switched off, so nothing from the app is sent even after it loaded.
export function Analytics() {
  const path = usePathname();
  useEffect(() => {
    const w = window as unknown as GaWindow;
    const id = w.__GA_ID;
    if (!id) return;
    const on = tracked(path);
    w[`ga-disable-${id}`] = !on;
    if (!on) return;
    let page_referrer = "";
    if (!w.gtag) {
      page_referrer = externalReferrer();
      guardHistory(w, id);
      w.dataLayer = w.dataLayer || [];
      w.gtag = function gtag() {
        // gtag.js reads the arguments object itself, not an array.
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments);
      };
      w.gtag("js", new Date());
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(s);
    }
    const page_location = location.origin + path;
    w.gtag("config", id, {
      send_page_view: false,
      page_location,
      page_referrer,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    w.gtag("event", "page_view", { page_location, page_referrer, page_path: path, page_title: document.title });
  }, [path]);
  return null;
}
