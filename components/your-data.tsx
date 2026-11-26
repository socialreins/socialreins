"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { Status, useAction } from "@/components/team-ui";
import { deleteAccount, exportData } from "@/lib/account";
import { Icon } from "@/components/ui";

// Download a copy of your data, or delete the account. Both are for the signed-in person only.
export function YourData() {
  return (
    <section aria-labelledby="data-heading" className="grid gap-3">
      <h2 id="data-heading" className="font-display text-lg font-extrabold tracking-tight">
        Your data
      </h2>
      <Export />
      <DeleteAccount />
    </section>
  );
}

function Export() {
  const { busy, problem, done, run } = useAction();
  function save({ blob, name }: { blob: Blob; name: string }) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "Your data was downloaded.";
  }
  return (
    <div className="card grid gap-3 p-4">
      <div className="grid gap-1">
        <h3 className="font-bold">Download a copy</h3>
        <p className="hint">
          One JSON file with your profile and, for each team you belong to, what your role may read: for an owner or admin
          that includes the team&apos;s posts, accounts (never their tokens), contacts and inbox messages. The file says
          what is left out. You can download one copy an hour.
        </p>
      </div>
      <button type="button" className="btn btn-sm justify-self-start" disabled={busy !== null} onClick={() => run("export", exportData, save)}>
        {busy ? "Preparing..." : "Download my data"}
      </button>
      <Status problem={problem} done={done} />
    </div>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="card card-danger grid gap-3 p-4">
      <div className="grid gap-1">
        <h3 className="font-bold">Delete account</h3>
        <p className="hint">
          Removes your account, your sign-in methods and every team that only you belong to, with its connected accounts, posts,
          inbox and contacts. This cannot be undone.
        </p>
      </div>
      <button ref={trigger} type="button" className="btn btn-sm btn-danger-outline justify-self-start" onClick={() => setOpen(true)}>
        Delete my account...
      </button>
      {open && (
        <ConfirmDelete
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function ConfirmDelete({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useSession();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const [shared, setShared] = useState<string[]>([]);
  const { busy, problem, run } = useAction();
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function onDelete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShared([]);
    await run("delete", () => deleteAccount(typed), (r) => {
      if (r === "ok") {
        router.push("/");
        return;
      }
      setShared(r.shared);
    });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => busy && e.preventDefault()}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <form onSubmit={onDelete} className="grid gap-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="min-w-0 font-display text-xl font-extrabold tracking-tight">
            Delete your account?
          </h2>
          <button type="button" className="icon-btn shrink-0" aria-label="Close" disabled={busy !== null} onClick={() => ref.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <div className="grid gap-2 text-sm">
          <p>This happens at once and cannot be undone.</p>
          <ul className="grid list-disc gap-1 pl-5">
            <li>Your account, passkeys and sessions are deleted, and you are signed out.</li>
            <li>Every team that only you belong to is deleted with its accounts, posts, inbox, contacts and settings, and its paid plan is cancelled.</li>
            <li>Teams that other people belong to stay. You leave them, and the API tokens you made there stop working.</li>
            <li>Posts already published on social networks stay where they are.</li>
            <li>Copies in our encrypted backups are removed within 30 days. Stripe keeps its own payment records.</li>
          </ul>
          <p>You need to have signed in within the last 10 minutes. We email you a confirmation.</p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="delete-email" className="label">
            Type {user.email} to confirm
          </label>
          <input
            id="delete-email"
            type="email"
            className="field"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        {shared.length > 0 && (
          <div role="alert" className="waitlist-error">
            <p>You are the only owner of {shared.length === 1 ? "a team" : "teams"} with other members:</p>
            <ul className="list-disc pl-5">
              {shared.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p>Make someone else an owner, or delete the team, on its Team page. Then try again.</p>
          </div>
        )}
        {shared.length === 0 && <Status problem={problem} done={null} />}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className={`btn btn-sm ${matches ? "btn-danger-solid" : "btn-danger-outline"}`} disabled={busy !== null || !matches}>
            {busy ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
