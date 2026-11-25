"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { addPasskey, getMe, safeNext, type AddResult, type MeResult, type Passkey } from "@/lib/auth";
import { snoozePasskeyPrompt } from "@/components/passkey-prompt";
import { linkButton, reverify, Status, useAction } from "@/components/team-ui";
import { SlugField, slugOk, useSlugCheck } from "@/components/slug-field";
import { setSlug } from "@/lib/teams";
import type { Team } from "@/lib/auth";

const noSubscribe = () => () => {};
const hasWebAuthn = () => typeof window.PublicKeyCredential === "function";

const failures: Partial<Record<Exclude<AddResult, Passkey>, ReactNode>> = {
  cancelled: "Adding the passkey was cancelled. Try again, or skip it for now.",
  passkey_exists: "This device already has a passkey for your account.",
  invalid_passkey: "Your device's passkey couldn't be checked. Try again.",
  invalid_challenge: "That took too long. Try again.",
  reauth_required: reverify,
  rate_limited: "Too many attempts. Wait a minute, then try again.",
  timeout: "The server took too long to answer. Try again in a moment.",
};

// Shown once after sign-up. brain sends a brand-new user here; anyone else just passes through.
export function Welcome() {
  const router = useRouter();
  // Where to go next, e.g. back to an invitation; only a path on this site, else /home.
  const next = safeNext(useSearchParams().get("next"));
  const [me, setMe] = useState<MeResult | null>(null);
  const [state, setState] = useState<"idle" | "adding" | Exclude<AddResult, Passkey>>("idle");
  // null until hydrated, so the server render never decides for a browser it can't see.
  const webauthn = useSyncExternalStore(noSubscribe, hasWebAuthn, () => null);

  useEffect(() => {
    getMe().then((r) => {
      if (r === "signed_out") router.replace("/login");
      else setMe(r);
    });
  }, [router]);

  // Without WebAuthn there is nothing to offer here.
  useEffect(() => {
    if (webauthn === false) router.replace(next);
  }, [webauthn, router, next]);

  if (me === null || me === "signed_out" || me === "not_found" || !webauthn) return <p className="text-ink-soft">Checking your sign-in...</p>;
  if (me === "error") return <p role="alert" className="waitlist-error">Sign-in couldn&apos;t be checked. Reload to try again.</p>;

  async function onAdd() {
    flushSync(() => setState("adding"));
    const r = await addPasskey("");
    if (typeof r === "object") return router.push(next);
    setState(r);
  }

  const failed = state !== "idle" && state !== "adding";
  return (
    <div className="grid gap-6">
      {me.user.current_team.role === "owner" && !me.user.current_team.slug && <AddressStep team={me.user.current_team} />}
      <div className="grid gap-3">
        <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-balance">
          Add a passkey to sign in faster
        </h1>
        <p className="text-ink-soft">Next time, sign in with Face ID, Touch ID or your device PIN instead of waiting for an email.</p>
      </div>
      {failed && (
        <p role="alert" className="waitlist-error">
          {failures[state] ?? "Something went wrong. Try again in a moment."}
        </p>
      )}
      <div className="waitlist">
        <div className="waitlist-row">
          <button type="button" disabled={state === "adding"} onClick={onAdd}>
            {state === "adding" ? "Waiting for your device..." : "Add a passkey"}
          </button>
        </div>
      </div>
      <Link href={next} className={`justify-self-start ${linkButton}`} onClick={snoozePasskeyPrompt}>
        Skip for now
      </Link>
    </div>
  );
}

// The first-run choice of the team address: optional, and it can be changed later in Team settings.
function AddressStep({ team }: { team: Team }) {
  const [slug, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(team.slug ?? null);
  const state = useSlugCheck(slug, team.code);
  const { busy, problem, done, run } = useAction();
  const prefix = `${window.location.host}/t/`;
  return (
    <form
      className="grid gap-3 rounded-lg border border-[var(--line)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (slug && slugOk(state))
          run("slug", () => setSlug(slug), (t) => {
            setSaved(t.slug ?? null);
            setText("");
            return `Your team address is now ${prefix}${t.slug}.`;
          });
      }}
    >
      <h2 className="text-base font-semibold">Choose your team address</h2>
      <p className="hint">
        Your team <strong className="text-ink">{team.name}</strong> is at <code>{prefix + (saved ?? team.code)}</code>. Pick a shorter, nicer one now, or keep it
        and change it later in Team settings.
      </p>
      <SlugField id="welcome-slug" label="Address" value={slug} onChange={setText} state={state} prefix={prefix} placeholder={saved ?? team.code} suggestFrom={team.name} />
      <div>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={busy !== null || !slug || !slugOk(state)}>
          {busy ? "Saving..." : "Save address"}
        </button>
      </div>
      <Status problem={problem} done={done} />
    </form>
  );
}
