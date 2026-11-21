"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Failure } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import { getAiKey, getBilling, getCredits, removeAiKey, setAiKey, type AiKey, type Billing, type Credits, type Plan, type Provider } from "@/lib/billing";
import { manages } from "@/lib/teams";
import { isFailure, linkButton, Status, useAction } from "@/components/team-ui";
import { LoadFailed, Skeleton } from "@/components/ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const date = (d: string) => new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
const providerName: Record<Provider, string> = { anthropic: "Anthropic", openai: "OpenAI" };
const overrides = {
  invalid_key: "That key doesn't look right for the provider. Anthropic keys start with sk-ant-, OpenAI keys with sk-.",
  forbidden: "Only team owners and admins can change the AI key.",
};

// When the plan ends or renews, in a sentence.
function planDate(p: Plan) {
  if (p.status === "trialing" && p.trial_ends_at) return `Trial ends ${date(p.trial_ends_at)}.`;
  if (p.status === "past_due") return "Payment failed, retrying.";
  if (!p.current_period_end) return null;
  if (p.status === "canceled") return `Ended ${date(p.current_period_end)}.`;
  return p.cancel_at_period_end ? `Ends ${date(p.current_period_end)}, at the end of the paid period.` : `Renews ${date(p.current_period_end)}.`;
}

// A 404 means the key is already gone, which is what Remove wanted.
const removeGone = async () => {
  const r = await removeAiKey();
  return r === "not_found" ? "ok" : r;
};

const limitText = (used: number, limit: number | null) => (limit === null ? `${used}, unlimited` : `${used} of ${limit}`);

export function BillingPage() {
  const { user } = useSession();
  return (
    <div className="grid max-w-3xl gap-10">
      <PlanSection />
      {manages(user.current_team.role) ? <AiKeySection /> : <p className="text-ink-soft">Only team owners and admins can set the team&apos;s own AI key.</p>}
    </div>
  );
}

function PlanSection() {
  const [data, setData] = useState<{ billing: Billing; credits: Credits | Failure } | Failure | null>(null);
  const load = useCallback(async () => {
    setData(null);
    const [billing, credits] = await Promise.all([getBilling(), getCredits()]);
    setData(isFailure(billing) ? billing : { billing, credits });
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() resets, then fills, state around a request
    void load();
  }, [load]);

  if (data === null) return <Skeleton className="h-40 w-full" />;
  if (isFailure(data))
    return (
      <LoadFailed what="billing" retry={load}>
        Billing couldn&apos;t be loaded.
      </LoadFailed>
    );
  const { billing, credits } = data;
  if (!billing.enabled)
    return (
      <section aria-labelledby="plan-heading" className="card grid gap-2 p-5">
        <h2 id="plan-heading" className={heading}>
          Plan
        </h2>
        <p>Self-hosted: nothing is capped.</p>
      </section>
    );
  const { plan, limits, usage } = billing;
  return (
    <>
      <section aria-labelledby="plan-heading" className="card grid gap-2 p-5">
        <h2 id="plan-heading" className={heading}>
          Plan
        </h2>
        {plan ? (
          <>
            <p>
              <strong>{plan.name}</strong>, {plan.status.replaceAll("_", " ")}
            </p>
            {planDate(plan) && <p className="text-ink-soft">{planDate(plan)}</p>}
          </>
        ) : (
          <p>No plan</p>
        )}
        <button type="button" disabled className="btn btn-primary justify-self-start">
          Checkout opens soon
        </button>
      </section>
      <section aria-labelledby="usage-heading" className="grid gap-2">
        <h2 id="usage-heading" className={heading}>
          Usage
        </h2>
        <dl className="card grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 p-5">
          <dt className="text-ink-soft">Accounts</dt>
          <dd>{limitText(usage.accounts, limits.accounts)}</dd>
          <dt className="text-ink-soft">Team members</dt>
          <dd>{limitText(usage.members, limits.members)}</dd>
        </dl>
      </section>
      <section aria-labelledby="credits-heading" className="grid gap-2">
        <h2 id="credits-heading" className={heading}>
          Credits
        </h2>
        {isFailure(credits) ? (
          <p role="alert" className="waitlist-error">
            Credits couldn&apos;t be loaded.
          </p>
        ) : (
          <dl className="card grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 p-5">
            <dt className="text-ink-soft">X posts</dt>
            <dd>{credits.x}</dd>
            <dt className="text-ink-soft">AI</dt>
            <dd>{credits.ai}</dd>
          </dl>
        )}
      </section>
    </>
  );
}

// Rendered for owners and admins only. The key goes to brain and is never shown again, only its provider and last 4 characters.
function AiKeySection() {
  // undefined: loading; null: none set.
  const [saved, setSaved] = useState<AiKey | null | Failure | undefined>(undefined);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [key, setKey] = useState("");
  const action = useAction();

  useEffect(() => {
    getAiKey().then((r) => setSaved(r === "not_found" ? null : r));
  }, []);

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    action.run("save", () => setAiKey(provider, key), (r) => {
      setSaved(r);
      setKey("");
      return `Saved your ${providerName[r.provider]} key.`;
    });
  }

  const current = saved && !isFailure(saved) ? saved : null;
  return (
    <section aria-labelledby="ai-key-heading" className="grid gap-3">
      <h2 id="ai-key-heading" className={heading}>
        Bring your own AI key
      </h2>
      <p className="text-ink-soft">With your own key, AI steps in automations are not metered. Without one, they use credits.</p>
      {saved === undefined ? (
        <Skeleton className="h-10 w-full" />
      ) : isFailure(saved) ? (
        <p role="alert" className="waitlist-error">
          The AI key couldn&apos;t be loaded.
        </p>
      ) : (
        <>
          <p>{current ? `Using your ${providerName[current.provider]} key ending in ${current.last4}.` : "No key set."}</p>
          <form onSubmit={onSave} className="waitlist">
            <label htmlFor="ai-provider">Provider</label>
            <select id="ai-provider" className="field w-auto" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
            <label htmlFor="ai-key">API key</label>
            <div className="waitlist-row">
              <input
                id="ai-key"
                type="password"
                required
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                aria-invalid={(action.failedKey === "save" && action.problem === "invalid_key") || undefined}
              />
              <button type="submit" disabled={action.busy !== null}>
                {action.busy === "save" ? "Saving..." : "Save"}
              </button>
            </div>
            <p className="waitlist-note">Saving the key needs a sign-in from the last 10 minutes.</p>
          </form>
          {current && (
            <button
              type="button"
              className={`justify-self-start ${linkButton}`}
              disabled={action.busy !== null}
              onClick={() =>
                action.run("remove", removeGone, () => {
                  setSaved(null);
                  return "Removed the key. AI steps use credits again.";
                })
              }
            >
              {action.busy === "remove" ? "Removing..." : "Remove key"}
            </button>
          )}
        </>
      )}
      <Status problem={action.problem} done={action.done} overrides={overrides} />
    </section>
  );
}
