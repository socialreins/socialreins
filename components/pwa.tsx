"use client";

import { useEffect } from "react";
import { watchInstall } from "@/lib/install";

// Mounted once in the root layout: registers the offline service worker (public/sw.js) in production only, since a
// dev server's pages must never be intercepted, and starts listening for the browser's install offer (lib/install.ts).
export function Pwa() {
  useEffect(() => {
    watchInstall();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      // Same-origin by construction: the worker file is served from the site it controls.
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
