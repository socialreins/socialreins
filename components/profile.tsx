"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSession } from "@/components/app-shell";
import { Status, useAction } from "@/components/team-ui";
import { cleanName, MAX_NAME, updateName } from "@/lib/auth";
import { Icon, type IconName } from "@/components/ui";

const links: { href: string; label: string; text: string; icon: IconName }[] = [
  { href: "/app/security", label: "Sign-in and security", text: "How you sign in to SocialReins.", icon: "security" },
  { href: "/app/security#passkeys", label: "Passkeys", text: "Add or remove the devices you sign in with.", icon: "fingerprint" },
];

const nameMessages = { invalid_name: `Use 1 to ${MAX_NAME} characters.` };

// The signed-in user, with a form to change the name.
export function Profile() {
  const { user } = useSession();
  return (
    <div className="grid gap-8">
      <div className="card flex items-center gap-4 p-5">
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-ink font-display text-2xl font-extrabold text-paper">
          {(user.name || user.email).charAt(0).toUpperCase()}
        </span>
        <dl className="grid min-w-0 gap-1">
          <div className="min-w-0">
            <dt className="sr-only">Name</dt>
            <dd className="truncate font-display text-xl font-extrabold tracking-tight">{user.name || "No name yet"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="sr-only">Email</dt>
            <dd className="truncate text-ink-soft">{user.email}</dd>
          </div>
        </dl>
      </div>
      <NameForm />
      <ul className="grid gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="card flex items-center gap-4 p-4 hover:border-ink">
              <Icon name={l.icon} className="size-6 text-signal-deep" />
              <span className="grid flex-1 gap-0.5">
                <span className="font-bold">{l.label}</span>
                <span className="text-sm text-ink-soft">{l.text}</span>
              </span>
              <Icon name="right" className="size-5 text-ink-soft" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NameForm() {
  const { user, setUser } = useSession();
  const [name, setName] = useState(user.name);
  // Set when the name fails the local check, so no request goes out.
  const [invalid, setInvalid] = useState(false);
  const { busy, problem, done, run } = useAction();
  const shown = invalid ? "invalid_name" : problem;
  return (
    <section aria-labelledby="name-heading" className="grid gap-3">
      <h2 id="name-heading" className="font-display text-lg font-extrabold tracking-tight">
        Your name
      </h2>
      <form
        className="waitlist"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const clean = cleanName(name);
          // Clear first so a repeated message is announced again.
          flushSync(() => setInvalid(false));
          if (!clean) return setInvalid(true);
          run("name", () => updateName(clean), (u) => {
            setUser(u);
            setName(u.name);
            return "Your name is saved.";
          });
        }}
      >
        <label htmlFor="profile-name">Name</label>
        <div className="waitlist-row">
          <input
            id="profile-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={shown === "invalid_name" || undefined}
          />
          <button type="submit" disabled={busy !== null}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
      <Status problem={shown} done={done} overrides={nameMessages} />
    </section>
  );
}
