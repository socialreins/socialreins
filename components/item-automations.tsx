"use client";

import { useEffect, useState } from "react";
import { itemAutomations, whyNot, type Verdict } from "@/lib/automations";
import { TeamLink as Link } from "@/components/team-link";
import { addressOf } from "@/lib/ref";
import { isFailure } from "@/components/team-ui";

// What the team's automations did with one inbox item: which ran, and for each that did not, why. Nothing shows
// when no automation has a say (none was on when the item came, or it is older than 14 days).
export function ItemAutomations({ itemId }: { itemId: string }) {
  const [list, setList] = useState<Verdict[] | null>(null);
  useEffect(() => {
    let live = true;
    itemAutomations(itemId).then((r) => live && setList(isFailure(r) ? [] : r.automations));
    return () => {
      live = false;
    };
  }, [itemId]);
  if (!list || list.length === 0) return null;
  const ran = list.filter((v) => v.outcome === "ran");
  // A run that failed, was held back, or never started: each with its reasons.
  const not = list.filter((v) => v.outcome !== "ran");
  const link = (v: Verdict) => (
    <Link href={`/automations/${addressOf(v.automation_id, v.automation_number)}`} className="font-bold underline decoration-signal decoration-2 underline-offset-4">
      {v.name}
    </Link>
  );
  return (
    <section aria-label="Automations" className="grid gap-1 rounded-xl bg-canvas px-3 py-2 text-sm">
      <p>
        <strong>Automations:</strong>{" "}
        {ran.length > 0 ? (
          <>
            {ran.map((v, i) => (
              <span key={v.automation_id}>
                {i > 0 && ", "}
                {link(v)}
              </span>
            ))}{" "}
            ran.
          </>
        ) : (
          "none ran because"
        )}
      </p>
      {not.length > 0 && (
        <ul className="grid gap-0.5 text-ink-soft">
          {not.map((v) => (
            <li key={v.automation_id}>
              {link(v)}: {v.outcome === "failed" && "it failed. "}
              {v.reasons.length > 0 ? v.reasons.map(whyNot).join("; ") : v.outcome === "failed" ? "" : "it did not run"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
