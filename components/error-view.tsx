"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * What a page shows when it throws (an unexpected answer from brain, a chunk a deploy removed):
 * try again, reload (fetches the new build), or go home. Used by `app/error.tsx` and
 * `app/(app)/error.tsx`, the latter inside the app shell, so the sidebar and team switcher stay.
 */
export function ErrorView({ error, retry, home }: { error: unknown; retry: () => void; home: string }) {
  // Nothing sends it anywhere yet (no error tracker); the console and Next's digest are what there is.
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="grid max-w-xl gap-3 py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-ink-soft">
        This page hit a problem. Your posts and settings are safe. If SocialReins was just updated, a reload fixes it.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          Try again
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
          Reload the page
        </button>
        <Link href={home} className="btn btn-quiet">
          Go to {home === "/" ? "the home page" : "your team"}
        </Link>
      </div>
    </div>
  );
}
