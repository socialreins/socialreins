"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Failure } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import { buyCredits, getAiKey, getBilling, getCredits, isLive, openPortal, removeAiKey, setAiKey, startCheckout, type AiKey, type Billing, type Credits, type Interval, type Pack, type Plan, type PlanChoice, type Provider } from "@/lib/billing";
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
const planOverrides = {
  forbidden: "Only the team owner can change the plan.",
  already_subscribed: "This team already has a plan. Use Manage billing to change it.",
  no_customer: "There is no billing account yet. Choose a plan first.",
  billing_unavailable: "Billing is not available right now. Try again later.",
  stripe_failed: "Payment page could not be opened. Try again.",
  invalid_plan: "That plan is not available.",
  invalid_pack: "That credit pack is not available.",
};
// USD, decision 0006: yearly is two months free.
const choices: { plan: PlanChoice; name: string; monthly: number; yearly: number; features: string[] }[] = [
  { plan: "scheduler", name: "Scheduler", monthly: 19, yearly: 190, features: ["10 connected accounts", "3 team members", "No inbox or automations"] },
  {
    plan: "automation",
    name: "Scheduler and Automation",
    monthly: 49,
    yearly: 490,
    features: ["25 connected accounts", "Unlimited team members", "Inbox, automations, broadcasts and newsletters", "2,500 contacts"],
  },
];
const banners: Record<string, string> = {
  success: "Thanks. Your plan will show here in a moment.",
  canceled: "Checkout was canceled.",
  credits_success: "Thanks. Your credits will show here in a moment. Reload if they don't.",
  credits_canceled: "The credit purchase was canceled.",
};
// USD, decision 0006: one credit is one X post, and credits never expire.
const packs: { pack: Pack; posts: number; price: number }[] = [
  { pack: "x100", posts: 100, price: 5 },
  { pack: "x500", posts: 500, price: 20 },
];
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// When the plan ends or renews, in a sentence.
function planDate(p: Plan, owner: boolean) {
  if (p.status === "trialing" && p.trial_ends_at) return `Trial ends ${date(p.trial_ends_at)}.`;
  if (p.status === "past_due") return owner ? "Payment failed, update your card in Manage billing." : "Payment failed, retrying.";
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
  // Brain sends the browser back from Stripe to /billing?checkout= (a plan) or ?credits= (a pack), success or canceled; show it once, then clean the address.
  const [returned] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const credits = q.get("credits");
    return q.get("checkout") ?? (credits ? `credits_${credits}` : null);
  });
  useEffect(() => {
    if (returned) window.history.replaceState(null, "", window.location.pathname);
  }, [returned]);
  return (
    <div className="grid max-w-3xl gap-10">
      {returned && banners[returned] ? (
        <p role="status" className={returned.endsWith("success") ? "waitlist-done" : "text-ink-soft"}>
          {banners[returned]}
        </p>
      ) : null}
      <PlanSection polling={returned === "success"} />
      {manages(user.current_team.role) ? <AiKeySection /> : <p className="text-ink-soft">Only team owners and admins can set the team&apos;s own AI key.</p>}
    </div>
  );
}

function PlanSection({ polling }: { polling: boolean }) {
  const { user } = useSession();
  const owner = user.current_team.role === "owner";
  const action = useAction();
  // The key of the button that sent the browser to Stripe: its buttons stay off until the page is shown again from history.
  const [leaving, setLeaving] = useState<string | null>(null);
  // Back from checkout and polling ended without a live plan.
  const [gaveUp, setGaveUp] = useState(false);
  const [period, setPeriod] = useState<Interval>("year");
  const [data, setData] = useState<{ billing: Billing; credits: Credits | Failure } | Failure | null>(null);
  const load = useCallback(async () => {
    setData(null);
    const [billing, credits] = await Promise.all([getBilling(), getCredits()]);
    setData(isFailure(billing) ? billing : { billing, credits });
    return billing;
  }, []);
  useEffect(() => {
    let stop = false;
    (async () => {
      let b = await load();
      // Back from Stripe, the webhook may lag a few seconds: look again, up to 5 times, until a plan shows.
      for (let i = 0; polling && i < 5 && !stop && !isFailure(b) && !isLive(b.plan); i++) {
        await sleep(2000);
        const next = await getBilling();
        if (stop || isFailure(next)) continue;
        b = next;
        setData((d) => (d && !isFailure(d) ? { ...d, billing: next } : d));
      }
      if (polling && !stop && !isFailure(b) && !isLive(b.plan)) setGaveUp(true);
    })();
    return () => {
      stop = true;
    };
  }, [load, polling]);
  // Back or forward from Stripe can restore this page from the browser's cache with the buttons still off.
  useEffect(() => {
    const show = (e: PageTransitionEvent) => e.persisted && setLeaving(null);
    window.addEventListener("pageshow", show);
    return () => window.removeEventListener("pageshow", show);
  }, []);
  const off = action.busy !== null || leaving !== null;
  const label = (key: string, text: string) => (action.busy === key || leaving === key ? "Opening..." : text);
  // Both buttons end on a Stripe page: send the browser there, and keep the buttons off meanwhile so a second click can't start a second session.
  const go = (key: string, call: () => Promise<{ url: string } | Failure>) =>
    action.run(key, call, ({ url }) => {
      setLeaving(key);
      window.location.assign(url);
    });

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
            {planDate(plan, owner) && <p className="text-ink-soft">{planDate(plan, owner)}</p>}
          </>
        ) : (
          <p>No plan</p>
        )}
        {isLive(plan) && owner && (
          <button type="button" className="btn btn-primary justify-self-start" disabled={off} onClick={() => go("portal", openPortal)}>
            {label("portal", "Manage billing")}
          </button>
        )}
        {!owner && <p className="text-ink-soft">Only the team owner can change the plan.</p>}
        <Status problem={action.problem} done={action.done} overrides={planOverrides} />
      </section>
      {owner && polling && !isLive(plan) && <p role="status">{gaveUp ? "Still confirming. Refresh in a minute." : "Confirming your payment..."}</p>}
      {/* While the payment is being confirmed the plan may already be paid: no cards, or a second subscription could be started. */}
      {owner && !polling && !isLive(plan) && (
        <section aria-labelledby="choose-heading" className="grid gap-3">
          <h2 id="choose-heading" className={heading}>
            Choose a plan
          </h2>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Billing period</legend>
            {(["year", "month"] as const).map((i) => (
              <label key={i} className="flex items-center gap-2">
                <input type="radio" name="interval" value={i} checked={period === i} onChange={() => setPeriod(i)} />
                {i === "year" ? "Yearly, 2 months free" : "Monthly"}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {choices.map((c) => (
              <div key={c.plan} className="card grid content-between gap-4 p-5">
                <div className="grid gap-2">
                  <h3 className="font-bold">{c.name}</h3>
                  <p>
                    {period === "year" ? (
                      <>
                        <span className="text-lg font-bold">${c.yearly}</span> a year <span className="text-ink-soft">(${(c.yearly / 12).toFixed(2)} a month)</span>
                      </>
                    ) : (
                      <>
                        <span className="text-lg font-bold">${c.monthly}</span> a month
                      </>
                    )}
                  </p>
                  <ul className="list-disc pl-5 text-ink-soft">
                    {c.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <button type="button" className="btn btn-primary justify-self-start" disabled={off} onClick={() => go(c.plan, () => startCheckout(c.plan, period))} aria-label={`Choose ${c.name}`}>
                  {label(c.plan, "Choose")}
                </button>
              </div>
            ))}
          </div>
          <p className="text-ink-soft">New plans start with a 7-day free trial.</p>
        </section>
      )}
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
        {owner && (
          <>
            <div className="flex flex-wrap gap-3">
              {packs.map((p) => (
                <button key={p.pack} type="button" className="btn btn-secondary" disabled={off} onClick={() => go(p.pack, () => buyCredits(p.pack))}>
                  {label(p.pack, `Buy ${p.posts} X posts, $${p.price}`)}
                </button>
              ))}
            </div>
            <p className="text-ink-soft">One credit posts once to X, and each thread part counts. Credits never expire.</p>
          </>
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
