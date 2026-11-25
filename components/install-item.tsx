"use client";

import { useState, useSyncExternalStore } from "react";
import { installMode, promptInstall, subscribeInstall, type InstallMode } from "@/lib/install";
import { Icon } from "@/components/ui";

const hints = {
  ios: "Tap the Share button, then Add to Home Screen.",
  safari: "In the menu bar choose File, then Add to Dock.",
};

// "Install app" in the account menu. Hidden once the app is installed and where the browser cannot install it:
// Chrome and Edge show the browser's own prompt, Safari shows a short hint.
export function InstallItem({ className }: { className: string }) {
  const mode = useSyncExternalStore<InstallMode>(subscribeInstall, installMode, () => "none");
  const [hint, setHint] = useState(false);
  if (mode === "none") return null;
  return (
    <li>
      <button type="button" className={className} aria-expanded={mode === "prompt" ? undefined : hint} onClick={() => (mode === "prompt" ? promptInstall() : setHint(!hint))}>
        <Icon name="download" className="size-4 text-[var(--faint)]" />
        Install app
      </button>
      {hint && mode !== "prompt" && <p className="px-2 pt-1 pb-1.5 text-xs text-ink-soft">{hints[mode]}</p>}
    </li>
  );
}
