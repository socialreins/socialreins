"use client";

import { useEffect } from "react";

// Replaces the root layout when it throws, so it brings its own document and styles (the page's
// stylesheet is not loaded here).
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en" style={{ colorScheme: "light dark" }}>
      <body role="alert" style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "4rem 1rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Something went wrong</h1>
        <p>Your posts and settings are safe. If SocialReins was just updated, a reload fixes it.</p>
        <p>
          <button type="button" onClick={() => retry()} style={{ padding: "0.5rem 1rem", marginRight: "0.5rem" }}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "0.5rem 1rem" }}>
            Reload the page
          </button>
        </p>
      </body>
    </html>
  );
}
