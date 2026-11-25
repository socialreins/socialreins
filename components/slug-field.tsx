"use client";

import { useEffect, useState } from "react";
import { checkSlug, slugProblem, slugReason, suggestSlug } from "@/lib/teams";
import { isFailure } from "@/components/team-ui";

// What the live check says about the typed address. "free" and "unknown" let the form submit (brain decides again on save).
export type SlugState = { kind: "empty" | "checking" | "free" | "unknown" } | { kind: "wrong"; text: string };
export const slugOk = (s: SlugState) => s.kind === "free" || s.kind === "unknown";

const WAIT_MS = 350;

// Checks `slug` against the format rules at once and against brain after a short pause in typing.
// `forTeam` is the code of the team that would take it, absent for a team not made yet.
export function useSlugCheck(slug: string, forTeam?: string): SlugState {
  const local = slug ? slugProblem(slug) : null;
  const [answer, setAnswer] = useState<{ slug: string; state: SlugState } | null>(null);
  useEffect(() => {
    if (!slug || local) return;
    let live = true;
    const timer = setTimeout(async () => {
      const r = await checkSlug(slug, forTeam);
      if (!live) return;
      const state: SlugState = isFailure(r) ? { kind: "unknown" } : r.available ? { kind: "free" } : { kind: "wrong", text: slugReason(r.reason) };
      setAnswer({ slug, state });
    }, WAIT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [slug, local, forTeam]);
  if (!slug) return { kind: "empty" };
  if (local) return { kind: "wrong", text: local };
  return answer?.slug === slug ? answer.state : { kind: "checking" };
}

// An address field with its live message. `prefix` is the start of every address ("socialreins.com/t/"); a name that
// suggests an address shows it as a button while the field is empty.
export function SlugField({
  id,
  label,
  value,
  onChange,
  state,
  prefix,
  placeholder,
  suggestFrom,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  state: SlugState;
  prefix: string;
  placeholder?: string;
  suggestFrom?: string;
  help?: string;
}) {
  const suggestion = !value && suggestFrom ? suggestSlug(suggestFrom) : "";
  const wrong = state.kind === "wrong";
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1">
        <span className="text-sm text-ink-soft">{prefix}</span>
        <input
          id={id}
          className="field min-w-0 flex-1"
          maxLength={32}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
          aria-invalid={wrong || undefined}
          aria-describedby={`${id}-help`}
        />
      </div>
      {suggestion && (
        <button type="button" className="btn btn-quiet btn-sm justify-self-start" onClick={() => onChange(suggestion)}>
          Use {suggestion}
        </button>
      )}
      <p id={`${id}-help`} className="hint" aria-live="polite">
        {state.kind === "wrong" && <span className="text-signal-deep">{state.text} </span>}
        {state.kind === "checking" && <span>Checking... </span>}
        {state.kind === "free" && <span className="text-ink">That address is free. </span>}
        {help}
      </p>
    </div>
  );
}
