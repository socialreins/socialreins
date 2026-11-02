"use client";

import Link from "next/link";
import { useSession } from "@/components/app-shell";
import { Icon, type IconName } from "@/components/ui";

const links: { href: string; label: string; text: string; icon: IconName }[] = [
  { href: "/app/security", label: "Sign-in and security", text: "How you sign in to SocialReins.", icon: "security" },
  { href: "/app/security#passkeys", label: "Passkeys", text: "Add or remove the devices you sign in with.", icon: "fingerprint" },
];

// The signed-in user. Read-only: brain has no endpoint to change the name yet.
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
