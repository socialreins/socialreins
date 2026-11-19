"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { tracked } from "@/lib/ga";

type GaWindow = Window & { __GA_ID?: string | null; dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

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
    if (!w.gtag) {
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
    w.gtag("config", id, { send_page_view: false, page_location });
    w.gtag("event", "page_view", { page_location, page_path: path, page_title: document.title });
  }, [path]);
  return null;
}
