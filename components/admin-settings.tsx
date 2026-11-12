"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { Failure } from "@/lib/auth";
import { getSignupSettings, parseDomains, saveSignupSettings, type SignupMode, type SignupSettings } from "@/lib/admin";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Forbidden } from "@/components/admin";

const modes: { value: SignupMode; label: string; text: string }[] = [
  { value: "open", label: "Open to everyone", text: "Anyone can create an account." },
  { value: "closed", label: "Closed", text: "Only invited and approved people can create an account. Everyone else goes on the waitlist." },
  { value: "domains", label: "Only these domains or addresses", text: "Only the email domains and addresses listed below can create an account." },
];
const overrides = {
  forbidden: "You don't have access to the admin panel.",
  invalid_domains:
    "That list can't be saved. Give at least one entry and at most 50, each a plain domain like example.com or a full email address.",
  invalid_mode: "Pick one of the three choices.",
};

export function AdminSettings() {
  const [saved, setSaved] = useState<SignupSettings | Failure | null>(null);
  const [mode, setMode] = useState<SignupMode>("closed");
  const [domains, setDomains] = useState("");
  // Opening sign-up to everyone asks once more before it is saved.
  const [confirming, setConfirming] = useState(false);
  const action = useAction();
  const saveRef = useRef<HTMLButtonElement>(null);

  const show = (s: SignupSettings) => {
    setSaved(s);
    setMode(s.mode);
    setDomains(s.domains.join("\n"));
  };
  useEffect(() => {
    getSignupSettings().then((s) => (isFailure(s) ? setSaved(s) : show(s)));
  }, []);

  if (saved === "forbidden") return <Forbidden />;
  if (isFailure(saved))
    return (
      <p role="alert" className="waitlist-error">
        The sign-up settings couldn&apos;t be loaded. {problemText(saved)}
      </p>
    );
  if (!saved)
    return (
      <p role="status" className="text-ink-soft">
        Loading the sign-up settings...
      </p>
    );

  // The list is sent with every mode, so it is still there when the third choice is picked again.
  const save = () =>
    action
      .run("save", () => saveSignupSettings(mode, parseDomains(domains)), (s) => {
        show(s);
        return "Sign-up settings saved.";
      })
      // Either way the question is answered; the Save button comes back with the result above it.
      .then(() => setConfirming(false));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "open" && saved !== null && !isFailure(saved) && saved.mode !== "open") return setConfirming(true);
    save();
  }

  // Cancel unmounts the focused button; put focus back on Save.
  const cancel = () => {
    flushSync(() => setConfirming(false));
    saveRef.current?.focus();
  };
  const badDomains = action.problem === "invalid_domains";

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <fieldset className="grid gap-3">
        <legend className="label mb-2">Who can create an account</legend>
        {modes.map((m) => (
          <label key={m.value} className="flex items-start gap-2.5">
            <input
              type="radio"
              name="signup-mode"
              className="mt-1"
              checked={mode === m.value}
              disabled={action.busy !== null}
              onChange={() => {
                setMode(m.value);
                setConfirming(false);
              }}
            />
            <span className="grid gap-0.5">
              <span className="font-bold">{m.label}</span>
              <span className="hint">{m.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {mode === "domains" && (
        <div className="grid gap-1.5">
          <label htmlFor="signup-domains" className="label">
            Domains and addresses
          </label>
          <textarea
            id="signup-domains"
            required
            rows={5}
            spellCheck={false}
            autoCapitalize="none"
            className="field font-mono text-sm"
            aria-describedby="signup-domains-hint"
            aria-invalid={badDomains || undefined}
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
          />
          <p id="signup-domains-hint" className="hint">
            One per line, or separated by commas. A domain like example.com lets in everyone with an address there; a full email address lets in one person.
            Up to 50.
          </p>
        </div>
      )}
      <p className="hint">Invited people, approved waitlist entries and the owner can always sign up, whatever is chosen here.</p>
      <p className="hint">
        {saved.source === "env"
          ? "The current setting comes from the server's environment. Saving here takes over from it."
          : "The current setting was saved here, and takes the place of the server's environment."}
      </p>
      <Status problem={action.problem} done={action.done} overrides={overrides} />
      {confirming ? (
        <div className="card grid gap-3 p-4">
          <p id="signup-open-q" className="font-bold">
            Open sign-up to everyone? Anyone will be able to create an account, with no invitation or approval.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" autoFocus className="btn btn-primary" aria-describedby="signup-open-q" disabled={action.busy !== null} onClick={save}>
              {action.busy === "save" ? "Saving..." : "Yes, open sign-up"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={action.busy !== null} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 justify-items-start">
          <button ref={saveRef} type="submit" className="btn btn-primary" disabled={action.busy !== null}>
            {action.busy === "save" ? "Saving..." : "Save"}
          </button>
          <p className="hint">Saving needs a sign-in from the last 10 minutes.</p>
        </div>
      )}
    </form>
  );
}
