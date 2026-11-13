"use client";

import { useEffect } from "react";
import { read, store, useStored } from "@/components/app-shell";
import { Icon, type IconName } from "@/components/ui";

type Theme = "light" | "dark" | "system";
const themes: { id: Theme; label: string; icon: IconName }[] = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "System", icon: "monitor" },
];
const valid = (v: string | null): Theme => (v === "light" || v === "dark" ? v : "system");

// Light, Dark or System (the default) in localStorage `theme`, set as data-theme on <html>.
// The inline script in app/layout.tsx sets it before paint; this keeps it in step with the choice and, on System, the OS.
export function ThemeSwitch({ collapsed }: { collapsed: boolean }) {
  const theme = valid(useStored("theme"));

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    // Read again here: on the first render after hydration the hook still gives the server's null.
    const apply = () => {
      const t = valid(read("theme"));
      document.documentElement.dataset.theme = t === "system" ? (mq.matches ? "dark" : "light") : t;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const current = themes.find((t) => t.id === theme)!;
  const next = themes[(themes.indexOf(current) + 1) % themes.length];
  return (
    <>
      <div role="group" aria-label="Theme" className={`flex gap-0.5 justify-self-start rounded-md bg-ink/[0.05] p-0.5 ${collapsed ? "md:hidden" : ""}`}>
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            aria-pressed={t.id === theme}
            title={t.label}
            onClick={() => store("theme", t.id)}
            className={`grid h-6 w-7 place-items-center rounded ${
              t.id === theme ? "bg-paper text-ink shadow-[0_0_0_1px_var(--line),0_1px_1px_rgb(0_0_0/0.06)]" : "text-[var(--faint)] hover:text-ink"
            }`}
          >
            <Icon name={t.icon} className="size-3.5" />
          </button>
        ))}
      </div>
      {collapsed && (
        <button
          type="button"
          aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
          data-tip={`Theme: ${current.label}`}
          onClick={() => store("theme", next.id)}
          className="hidden h-8 w-full place-items-center rounded-md text-[var(--faint)] hover:bg-ink/[0.05] hover:text-ink md:grid"
        >
          <Icon name={current.icon} className="size-4" />
        </button>
      )}
    </>
  );
}
