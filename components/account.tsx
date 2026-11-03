"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import { Icon } from "@/components/ui";

// Who is signed in, and Sign out, at the foot of the app's sidebar.
export function Account() {
  const router = useRouter();
  const { user } = useSession();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-[var(--line)] px-2 pt-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-ink/10 text-xs font-bold">
          {[...(user.name || user.email)][0].toUpperCase()}
        </span>
        <p className="min-w-0 text-sm leading-snug">
          {user.name && <span className="block truncate font-bold">{user.name}</span>}
          <span className="block text-ink-soft">Signed in as</span>{" "}
          <strong className="block truncate" title={user.email}>
            {user.email}
          </strong>
        </p>
      </div>
      <Suspense fallback={null}>
        <AdminLink />
      </Suspense>
      <button
        type="button"
        disabled={signingOut}
        className="btn btn-quiet btn-sm justify-self-start"
        onClick={async () => {
          setSigningOut(true);
          setSignOutFailed(false);
          if (await signOut()) return router.push("/");
          setSignOutFailed(true);
          setSigningOut(false);
        }}
      >
        <Icon name="out" className="size-4" />
        Sign out
      </button>
      {signOutFailed && (
        <p role="alert" className="waitlist-error text-sm">
          Sign out didn&apos;t go through. Try again in a moment.
        </p>
      )}
    </div>
  );
}

// Site admins switch between the app and the admin console here; nobody else sees it.
function AdminLink() {
  const { user } = useSession();
  const inAdmin = usePathname().startsWith("/admin");
  if (!user.is_admin) return null;
  return (
    <Link href={inAdmin ? "/app" : "/admin"} className="btn btn-quiet btn-sm justify-self-start">
      <Icon name={inAdmin ? "left" : "admin"} className="size-4" />
      {inAdmin ? "Back to the app" : "Admin console"}
    </Link>
  );
}
