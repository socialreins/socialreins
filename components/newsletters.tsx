"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Failure } from "@/lib/auth";
import { relativeTime } from "@/lib/inbox";
import {
  cancelNewsletter,
  createNewsletter,
  deleteNewsletter,
  draftProblem,
  footerWhy,
  getNewsletter,
  isProblem,
  length,
  linkCount,
  listNewsletters,
  MAX_ADDRESS,
  MAX_BODY,
  MAX_LINKS,
  MAX_LOGO,
  MAX_RECIPIENTS,
  MAX_SENDER_NAME,
  MAX_SUBJECT,
  MIN_ADDRESS,
  newsletterText,
  reachable,
  renderBody,
  resumeNewsletter,
  sendNewsletter,
  setSender,
  subscribers,
  testNewsletter,
  updateNewsletter,
  type Newsletter,
  type Problem,
} from "@/lib/newsletter";
import { listSubscribers, manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { Confirm, Progress, StatusBadge } from "@/components/broadcasts";
import { TeamLink as Link, useTeamRouter as useRouter } from "@/components/team-link";
import { isFailure, linkButton, problemText } from "@/components/team-ui";
import { EmptyState, Icon, LoadFailed, Skeleton } from "@/components/ui";

const say = (code: Failure, field?: string): ReactNode => newsletterText(code, field) ?? problemText(code);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const ago = (iso: string) => (relativeTime(iso) === "now" ? "just now" : relativeTime(iso));
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const heading = "font-display text-lg font-extrabold tracking-tight";
const PARTS = ["sent", "failed", "pending"] as const;
const useTeam = () => useSession().user.current_team;

const ownersOnly = <p className="card max-w-3xl p-5 text-ink-soft">Only team owners and admins can write and send newsletters.</p>;

const Sent = ({ n }: { n: Newsletter }) => <Progress counts={{ ...n.counts, skipped: 0 }} parts={PARTS} />;

// How many people a newsletter would go to now: the confirmed subscribers who did not unsubscribe.
function useAudience() {
  const [count, setCount] = useState<number | Failure | null>(null);
  const [tries, setTries] = useState(0);
  // brain lists at most the newest 5000 sign-ups and has no count: at that many the count here is a lower bound,
  // and brain's own number arrives with its answer to a send (`audience_changed`).
  const [capped, setCapped] = useState(false);
  useEffect(() => {
    let live = true;
    listSubscribers().then((r) => {
      if (!live) return;
      setCapped(!isFailure(r) && r.subscribers.length >= 5000);
      setCount(isFailure(r) ? r : r.subscribers.filter(reachable).length);
    });
    return () => {
      live = false;
    };
  }, [tries]);
  return {
    count,
    capped,
    again: () => {
      setCount(null);
      setTries((n) => n + 1);
    },
  };
}

// The sender's logo. A link that is not https or does not load shows `children` instead.
function SenderLogo({ src, alt, className, children = null }: { src?: string | null; alt: string; className: string; children?: ReactNode }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!src?.startsWith("https://") || broken === src) return children;
  // eslint-disable-next-line @next/next/no-img-element -- any https host, which next/image would need listed
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setBroken(src)} className={className} />;
}

// The email as its reader sees it, laid out as brain's `compose` does: the logo (else the sender's name), a card
// with the subject and the body by brain's rules, and the foot of every newsletter.
export function EmailPreview({ subject, body, label = "Email preview" }: { subject: string; body: string; label?: string }) {
  const team = useTeam();
  const sender = team.newsletter_sender;
  const name = sender?.name ?? "Your sender name";
  const paragraphs = renderBody(body);
  return (
    <section aria-label={label} className="grid content-start gap-3 rounded-lg border border-ink/15 bg-canvas p-4 text-sm">
      <div data-testid="preview-header" className="px-1 font-display text-lg font-extrabold tracking-tight break-words">
        <SenderLogo src={sender?.logo} alt={name} className="h-10 w-auto max-w-60">
          {name}
        </SenderLogo>
      </div>
      <div className="grid gap-3 rounded-2xl border border-ink/10 bg-paper p-5">
        <h3 data-testid="preview-subject" className="font-display text-xl font-extrabold tracking-tight break-words">
          {subject.trim() || "Your subject"}
        </h3>
        <div data-testid="preview-body" className="grid gap-3 break-words">
          {paragraphs.length === 0 && <p className="text-ink-soft">Your newsletter shows here as you type.</p>}
          {paragraphs.map((pieces, i) => (
            <p key={i} className="whitespace-pre-line">
              {pieces.map((p, j) => {
                const text = p.href ? (
                  <a href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                    {p.text}
                  </a>
                ) : (
                  p.text
                );
                return p.bold ? <strong key={j}>{text}</strong> : <span key={j}>{text}</span>;
              })}
            </p>
          ))}
        </div>
      </div>
      <footer data-testid="preview-footer" className="grid gap-0.5 px-1 text-xs text-ink-soft">
        <span>{name}</span>
        <span className="whitespace-pre-line">{sender?.address ?? "Your postal address"}</span>
        <span>{footerWhy(team.name)}</span>
        {/* Not a link here: the real one carries each reader's own token. */}
        <span className="underline">Unsubscribe</span>
      </footer>
    </section>
  );
}

// Who the newsletters come from. The postal address is not optional: the law wants it in every email.
function SenderForm({ onDone }: { onDone?: () => void }) {
  const { setTeam } = useSession();
  const saved = useTeam().newsletter_sender;
  const [name, setName] = useState(saved?.name ?? "");
  const [address, setAddress] = useState(saved?.address ?? "");
  const [logo, setLogo] = useState(saved?.logo ?? "");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    flushSync(() => {
      setProblem(null);
      setBusy(true);
    });
    const r = await setSender({ name: name.trim(), address: address.trim(), logo: logo.trim() || null });
    setBusy(false);
    // A team has a `code` of its own, so tell the two apart by the id.
    if (!("id" in r)) return setProblem(r);
    setTeam(r);
    onDone?.();
  }
  const field = problem?.code === "invalid_sender" ? problem.field : undefined;
  const err = (f: string) =>
    problem && field === f ? (
      <p id={`sender-${f}-error`} role="alert" className="waitlist-error">
        {say(problem.code, f)}
      </p>
    ) : null;
  const bad = (f: string) => ({ "aria-invalid": field === f || undefined, "aria-describedby": field === f ? `sender-${f}-error` : undefined });
  return (
    <form onSubmit={onSave} aria-label="Sender details" className="grid gap-4">
      <p className="text-sm text-ink-soft">Every newsletter email ends with who sent it and a postal address where they can be reached. The law requires both in every email, so nothing can be sent without them.</p>
      <div className="grid gap-1.5">
        <label htmlFor="sender-name" className="label">
          Sender name
        </label>
        <input id="sender-name" required maxLength={MAX_SENDER_NAME} className="field" placeholder="Acme Bakery" value={name} onChange={(e) => setName(e.target.value)} {...bad("name")} />
        {err("name") ?? <p className="hint">Shown as who the email is from.</p>}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="sender-address" className="label">
          Postal address
        </label>
        <textarea id="sender-address" required rows={3} minLength={MIN_ADDRESS} maxLength={MAX_ADDRESS} className="field resize-y" placeholder={"12 Mill Lane\n10115 Berlin\nGermany"} value={address} onChange={(e) => setAddress(e.target.value)} {...bad("address")} />
        {err("address") ?? <p className="hint">A real address where mail reaches you or your business. Readers see it at the foot of every email.</p>}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="sender-logo" className="label">
          Logo <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <input id="sender-logo" type="url" pattern="\s*https://.+" title="A link that starts with https://" maxLength={MAX_LOGO} className="field" placeholder="https://example.com/logo.png" value={logo} onChange={(e) => setLogo(e.target.value)} {...bad("logo")} />
        {err("logo") ?? <p className="hint">A link to your logo image (PNG or JPEG, https). Shown at the top of every newsletter. Leave empty to show the sender name instead.</p>}
      </div>
      {problem && !field && (
        <p role="alert" className="waitlist-error">
          {say(problem.code)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving..." : "Save sender details"}
        </button>
        {onDone && (
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function SenderCard() {
  const sender = useTeam().newsletter_sender;
  const [editing, setEditing] = useState(false);
  return (
    <section aria-label="Sender" className="card grid gap-3 p-5">
      <h2 className="label">Sender details</h2>
      {!sender ? (
        <SenderForm />
      ) : editing ? (
        <SenderForm onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-2">
            <SenderLogo src={sender.logo} alt={`${sender.name} logo`} className="h-8 w-auto max-w-48 justify-self-start" />
            <p className="text-sm break-words">
              <strong className="block">{sender.name}</strong>
              <span className="whitespace-pre-line text-ink-soft">{sender.address}</span>
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Edit sender details
          </button>
        </div>
      )}
    </section>
  );
}

// Who gets a newsletter, and where to switch the sign-up on when it is off.
function Audience({ count, capped, again }: ReturnType<typeof useAudience>) {
  const team = useTeam();
  if (isFailure(count))
    return (
      <LoadFailed what="the subscriber count" retry={again}>
        The subscribers couldn&apos;t be counted. {say(count)}
      </LoadFailed>
    );
  return (
    <p data-testid="audience" className="text-sm text-ink-soft">
      {count === null ? "Counting subscribers..." : <strong className="text-ink">{subscribers(count, capped)}.</strong>}{" "}
      {team.public_pages && team.newsletter ? (
        "People sign up on your public pages and confirm their email."
      ) : (
        <>
          The newsletter sign-up is switched off, so nobody new can sign up. Switch it on in{" "}
          <Link href="/team" className={linkButton}>
            Team, Sharing
          </Link>
          .
        </>
      )}
    </p>
  );
}

// The list: sender details, who would get one, and a card per newsletter, newest first.
export function Newsletters() {
  const canManage = manages(useTeam().role);
  return canManage ? <List /> : ownersOnly;
}

function List() {
  const audience = useAudience();
  const [list, setList] = useState<Newsletter[] | Failure | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    listNewsletters().then((r) => live && setList(r));
    return () => {
      live = false;
    };
  }, [tries]);

  return (
    <div className="grid max-w-3xl gap-4">
      <SenderCard />
      <Audience {...audience} />
      {list === null ? (
        <div role="status" className="grid gap-3">
          <span className="sr-only">Loading newsletters...</span>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="card grid gap-3 p-4">
              <Skeleton className={`h-4 ${i % 2 ? "w-1/4" : "w-1/3"}`} />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : isFailure(list) ? (
        <LoadFailed
          what="newsletters"
          retry={() => {
            setList(null);
            setTries((n) => n + 1);
          }}
        >
          Newsletters couldn&apos;t be loaded. {say(list)}
        </LoadFailed>
      ) : list.length === 0 ? (
        <EmptyState
          title="No newsletters yet."
          action={
            <Link href="/newsletters/new" className="btn btn-primary btn-sm">
              Write your first newsletter
            </Link>
          }
        >
          A newsletter is one email to the people who signed up on your public pages and confirmed their address.
        </EmptyState>
      ) : (
        <div className="enter grid gap-3">
          <Link href="/newsletters/new" className="btn btn-primary btn-sm justify-self-end">
            <Icon name="plus" className="size-4" />
            New newsletter
          </Link>
          <ul aria-label="Newsletters" className="grid gap-3">
            {list.map((n) => (
              <li key={n.id}>
                <Link href={`/newsletters/${n.id}`} className="card grid gap-3 p-4 hover:shadow-[0_0_0_1px_var(--edge)]">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <strong className="min-w-0 truncate">{n.subject}</strong>
                    <StatusBadge status={n.status} />
                  </span>
                  {n.status === "draft" ? <span className="text-sm text-ink-soft">Not sent yet. Open it to test and send.</span> : <Sent n={n} />}
                  {n.status === "paused" && n.pause_reason && <span className="text-sm font-bold text-signal-deep">Paused: {n.pause_reason}</span>}
                  <span className="text-xs text-ink-soft">
                    {n.finished_at ? (n.status === "cancelled" ? "Cancelled" : "Finished") : n.started_at ? "Started" : "Created"}{" "}
                    <time dateTime={n.finished_at ?? n.started_at ?? n.created_at}>{ago(n.finished_at ?? n.started_at ?? n.created_at)}</time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const Count = ({ label, n, max }: { label: string; n: number; max: number }) => (
  <span aria-label={label} className={`hint tabular-nums ${n > max ? "font-bold !text-signal-deep" : ""}`}>
    {n.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
  </span>
);

// A new draft, or a saved one with its send steps. Saving never sends.
// `onStale`: the saved draft is no longer the one in the editor, so the page opens it again.
export function NewsletterDraft({ saved, notice, onChange, onStale, onDeleted }: { saved?: Newsletter; notice?: string; onChange?: (n: Newsletter) => void; onStale?: (n: Newsletter) => void; onDeleted?: () => void }) {
  const router = useRouter();
  const canManage = manages(useTeam().role);
  const [subject, setSubject] = useState(saved?.subject ?? "");
  const [body, setBody] = useState(saved?.body ?? "");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!canManage) return ownersOnly;

  const dirty = !saved || subject.trim() !== saved.subject || body.trim() !== saved.body;
  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const wrong = draftProblem(subject, body);
    if (wrong) return setProblem({ code: "invalid_newsletter", field: wrong });
    const input = { subject: subject.trim(), body: body.trim() };
    flushSync(() => {
      setProblem(null);
      setDone(false);
      setBusy(true);
    });
    const r = await (saved ? updateNewsletter(saved.id, input) : createNewsletter(input));
    setBusy(false);
    if (isProblem(r)) return setProblem(r);
    if (!saved) return router.push(`/newsletters/${r.id}`);
    setDone(true);
    onChange?.(r);
  }

  // brain names the body for a link problem too.
  const field = problem?.code === "invalid_newsletter" ? (problem.field === "links" ? "body" : problem.field) : undefined;
  const err = (f: string) =>
    problem && field === f ? (
      <p id={`newsletter-${f}-error`} role="alert" className="waitlist-error">
        {say(problem.code, problem.field)}
      </p>
    ) : null;
  const bad = (f: string) => ({ "aria-invalid": field === f || undefined, "aria-describedby": field === f ? `newsletter-${f}-error` : undefined });

  return (
    <div className="enter grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-4">
      {notice && (
        <p role="alert" className="tone rounded-lg px-3 py-2 text-sm font-bold" data-approval="pending">
          {notice}
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 lg:items-start">
        <form onSubmit={onSave} aria-label="Newsletter" className="card grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
          <div className="grid gap-1.5">
            <span className="flex items-baseline justify-between gap-2">
              <label htmlFor="newsletter-subject" className="label">
                Subject
              </label>
              <Count label="Subject characters" n={length(subject)} max={MAX_SUBJECT} />
            </span>
            <input id="newsletter-subject" required className="field" placeholder="What is new this month" value={subject} onChange={(e) => setSubject(e.target.value)} {...bad("subject")} />
            {err("subject")}
          </div>
          <div className="grid gap-1.5">
            <span className="flex items-baseline justify-between gap-2">
              <label htmlFor="newsletter-body" className="label">
                Newsletter
              </label>
              <span className="flex gap-3">
                <span className="hint">
                  Links <Count label="Links" n={linkCount(body)} max={MAX_LINKS} />
                </span>
                <Count label="Newsletter characters" n={length(body)} max={MAX_BODY} />
              </span>
            </span>
            <textarea id="newsletter-body" required rows={14} className="field resize-y" value={body} onChange={(e) => setBody(e.target.value)} {...bad("body")} />
            {err("body") ?? <p className="hint">Plain text. Leave a blank line to start a paragraph, write **bold** for bold, and paste a full https link to make it a link. HTML is shown as typed, not run.</p>}
          </div>
          {problem && !field && (
            <p role="alert" className="waitlist-error">
              {say(problem.code)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={`btn ${dirty ? "btn-primary" : "btn-secondary"}`} disabled={busy}>
              {busy ? "Saving..." : "Save draft"}
            </button>
            {!saved && (
              <Link href="/newsletters" className="btn btn-quiet">
                Cancel
              </Link>
            )}
            <span role="status" className="hint">
              {done && !dirty ? "Draft saved." : "Saving sends nothing."}
            </span>
          </div>
        </form>
        <div className="grid gap-2 lg:sticky lg:top-4">
          <h2 className="label">Preview</h2>
          <EmailPreview subject={subject} body={body} />
        </div>
      </div>
      {saved && <SendSteps n={saved} dirty={dirty} onChange={onChange!} onStale={onStale!} onDeleted={onDeleted!} />}
    </div>
  );
}

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <li aria-label={`Step ${n}: ${title}`} className="grid gap-2 border-t border-ink/10 pt-4 first:border-0 first:pt-0">
    <h3 className="flex items-center gap-2 font-bold">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs text-paper">
        {n}
      </span>
      {title}
    </h3>
    {children}
  </li>
);

// The three steps from a saved draft to a send: a test to yourself, a review, then Send behind a second answer
// that repeats the number. Nothing is sent again by itself.
function SendSteps({ n, dirty, onChange, onStale, onDeleted }: { n: Newsletter; dirty: boolean; onChange: (n: Newsletter) => void; onStale: (n: Newsletter) => void; onDeleted: () => void }) {
  const { user } = useSession();
  const sender = user.current_team.newsletter_sender;
  const audience = useAudience();
  // brain's own count after it refused a send because the number moved.
  const [newTotal, setNewTotal] = useState<number | null>(null);
  const [asking, setAsking] = useState<"send" | "delete" | null>(null);
  const [busy, setBusy] = useState<"test" | "send" | "delete" | null>(null);
  const [problem, setProblem] = useState<{ step: "test" | "send"; code: Failure } | null>(null);
  const [tested, setTested] = useState(false);
  // An edit clears `tested_at`: remember that a test was sent, to say why another one is needed.
  const [wasTested, setWasTested] = useState(!!n.tested_at);
  if (n.tested_at && !wasTested) setWasTested(true);

  const total = newTotal ?? (typeof audience.count === "number" ? audience.count : null);
  // The list was cut off, so `total` is a lower bound until brain answers a send with its own count.
  const orMore = audience.capped && newTotal === null;
  const atLeast = orMore ? "at least " : "";

  async function test() {
    flushSync(() => {
      setProblem(null);
      setTested(false);
      setBusy("test");
    });
    const r = await testNewsletter(n.id);
    if (isFailure(r)) {
      setBusy(null);
      return setProblem({ step: "test", code: r });
    }
    const now = await getNewsletter(n.id);
    setBusy(null);
    if (isFailure(now)) return setProblem({ step: "test", code: now });
    setTested(true);
    onChange(now);
  }

  async function send(confirmTotal: number) {
    flushSync(() => {
      setProblem(null);
      setBusy("send");
    });
    // brain checks only the count: make sure the draft is still the one tested and reviewed here.
    const fresh = await getNewsletter(n.id);
    if (isFailure(fresh) || fresh.status !== "draft" || fresh.subject !== n.subject || fresh.body !== n.body || !fresh.tested_at) {
      setBusy(null);
      setAsking(null);
      return isFailure(fresh) ? setProblem({ step: "send", code: fresh }) : fresh.status === "draft" ? onStale(fresh) : onChange(fresh);
    }
    const r = await sendNewsletter(n.id, confirmTotal);
    if (isProblem(r) && r.code === "audience_changed" && r.total !== undefined) {
      setBusy(null);
      setAsking(null);
      return setNewTotal(r.total);
    }
    // An unclear failure may still have started it: show what brain has now.
    const now = await getNewsletter(n.id);
    setBusy(null);
    setAsking(null);
    if (!isFailure(now) && now.status !== "draft") return onChange(now);
    if (isProblem(r)) return setProblem({ step: "send", code: r.code });
    onChange(r);
  }

  async function remove() {
    setBusy("delete");
    const r = await deleteNewsletter(n.id);
    if (!isFailure(r)) return onDeleted();
    setBusy(null);
    setAsking(null);
    setProblem({ step: "send", code: r });
  }

  const blocked = dirty
    ? "Save the draft first."
    : !n.tested_at
      ? "Send yourself a test first (step 1)."
      : !sender
        ? null
        : total === null
          ? null
          : total === 0 && !orMore
            ? "Nobody has a confirmed subscription yet, so there is nobody to send to."
            : total > MAX_RECIPIENTS
              ? newsletterText("too_many_recipients")
              : null;
  const ready = !dirty && !!n.tested_at && !!sender && total !== null && (total > 0 || orMore) && total <= MAX_RECIPIENTS;
  // A confirm must come from a fresh click on this very test: an edit and a new test ask again.
  const [askedFor, setAskedFor] = useState<string | null>(null);

  return (
    <section aria-label="Send" className="card grid gap-4 p-5">
      <h2 className={heading}>Test, review and send</h2>
      <ol className="grid gap-4">
        <Step n={1} title="Send yourself a test">
          <p data-testid="test-state" className="text-sm text-ink-soft">
            {dirty
              ? "You have changes that are not saved. Save the draft, then send a test of it."
              : n.tested_at
                ? `Tested ${when(n.tested_at)}. Read it in your inbox before you go on.`
                : wasTested
                  ? "You changed the newsletter after the last test, so a new test is needed."
                  : "Not tested yet. A test is required before sending, so you see the email as your readers will."}
          </p>
          <button type="button" className={`btn btn-sm justify-self-start ${n.tested_at ? "btn-secondary" : "btn-primary"}`} disabled={dirty || busy !== null} onClick={test}>
            {busy === "test" ? "Sending the test..." : `Send a test to ${user.email}`}
          </button>
          <p role="status" className="text-sm">
            {tested && !dirty && n.tested_at ? `The test is on its way to ${user.email}.` : ""}
          </p>
          {problem?.step === "test" && (
            <p role="alert" className="waitlist-error">
              {problem.code === "rate_limited" ? "You sent 10 tests today, the most allowed. Try again tomorrow." : say(problem.code)}
            </p>
          )}
        </Step>
        <Step n={2} title="Review">
          {isFailure(audience.count) ? (
            <LoadFailed what="the subscriber count" retry={audience.again} className="">
              The subscribers couldn&apos;t be counted. {say(audience.count)}
            </LoadFailed>
          ) : (
            <p data-testid="reach" className="font-display text-xl font-extrabold tracking-tight">
              {total === null ? "Counting subscribers..." : `This goes to ${subscribers(total, orMore)}`}
            </p>
          )}
          {orMore && total !== null && (
            <p data-testid="reach-note" className="text-sm text-ink-soft">
              This list has more sign-ups than this page can count. The exact number is counted when you send, and you are asked again with it before anything goes out.
            </p>
          )}
          {newTotal !== null && (
            <p role="alert" className="tone rounded-lg px-3 py-2 text-sm font-bold" data-approval="pending">
              {audience.capped ? "The confirmed subscribers are counted now" : "The number of confirmed subscribers changed while you were looking"}, so nothing was sent. It is now {newTotal}. Check it, then send again.
            </p>
          )}
          {!sender && (
            <p className="text-sm font-bold text-signal-deep">
              Add your sender name and postal address on the{" "}
              <Link href="/newsletters" className={linkButton}>
                Newsletters page
              </Link>{" "}
              first. The law requires them in every email.
            </p>
          )}
          {dirty ? <p className="text-sm text-ink-soft">Save the draft to review what will be sent.</p> : <EmailPreview label="What will be sent" subject={n.subject} body={n.body} />}
        </Step>
        <Step n={3} title="Send">
          {asking === "send" && ready && askedFor === n.tested_at ? (
            <Confirm
              id="newsletter-send"
              title={`Send to ${atLeast}${people(total)}?`}
              about={`Each of the ${subscribers(total, orMore)} gets this email, starting now. A sent email can't be taken back.`}
              yes={`Yes, send to ${atLeast}${people(total)}`}
              no="Not yet"
              busy={busy === "send"}
              onYes={() => send(total)}
              onNo={() => setAsking(null)}
            />
          ) : (
            <button type="button" className="btn btn-primary justify-self-start" disabled={!ready || busy !== null} aria-describedby={blocked ? "newsletter-blocked" : undefined}
              onClick={() => {
                setAskedFor(n.tested_at);
                setAsking("send");
              }}
            >
              <Icon name="send" className="size-4" />
              {total === null ? "Send" : `Send to ${atLeast}${people(total)}`}
            </button>
          )}
          {blocked && (
            <p id="newsletter-blocked" className="text-sm font-bold text-signal-deep">
              {blocked}
            </p>
          )}
          {problem?.step === "send" && (
            <p role="alert" className="waitlist-error">
              {say(problem.code)}
            </p>
          )}
        </Step>
      </ol>
      <div className="grid gap-2 border-t border-ink/10 pt-4">
        {asking === "delete" ? (
          <Confirm id="newsletter-delete" title="Delete this draft?" about="The draft is removed. Nothing was sent." yes="Yes, delete draft" no="Keep it" danger busy={busy === "delete"} onYes={remove} onNo={() => setAsking(null)} />
        ) : (
          <button type="button" className="btn btn-danger-outline btn-sm justify-self-start" disabled={busy !== null} onClick={() => setAsking("delete")}>
            Delete draft
          </button>
        )}
      </div>
    </section>
  );
}

// One newsletter: a draft opens on its editor and send steps, a started one on its progress.
export function NewsletterDetail({ id }: { id: string }) {
  const router = useRouter();
  const canManage = manages(useTeam().role);
  const [n, setN] = useState<Newsletter | Failure | null>(null);
  const [tries, setTries] = useState(0);
  // Bumped when the draft changed under the editor, which then opens again on the new text.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!canManage) return;
    let live = true;
    getNewsletter(id).then((r) => live && setN(r));
    return () => {
      live = false;
    };
  }, [id, tries, canManage]);

  // While it sends: ask again every 10 seconds, not while the tab is hidden, and at once when it shows again.
  const sending = !isFailure(n) && n?.status === "sending";
  useEffect(() => {
    if (!sending) return;
    let live = true;
    const tick = () => {
      if (!document.hidden) getNewsletter(id).then((r) => live && !isFailure(r) && setN(r));
    };
    const timer = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [id, sending]);

  if (!canManage) return ownersOnly;
  if (n === null)
    return (
      <div role="status" className="card grid max-w-3xl gap-4 p-5">
        <span className="sr-only">Loading the newsletter...</span>
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    );
  if (isFailure(n))
    return (
      <LoadFailed
        what="this newsletter"
        retry={() => {
          setN(null);
          setTries((t) => t + 1);
        }}
      >
        This newsletter couldn&apos;t be loaded. {say(n)}
      </LoadFailed>
    );
  if (n.status !== "draft") return <Started n={n} onChange={setN} />;
  return (
    <NewsletterDraft
      key={version}
      saved={n}
      notice={version > 0 ? "This draft changed while you were looking, so nothing was sent. Read it again, send yourself a new test if it asks for one, then send." : undefined}
      onChange={setN}
      onStale={(r) => {
        setVersion((v) => v + 1);
        setN(r);
      }}
      onDeleted={() => router.replace("/newsletters")}
    />
  );
}

// A newsletter that was started: where it stands, Resume and Cancel, and what was sent.
function Started({ n, onChange }: { n: Newsletter; onChange: (n: Newsletter) => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<"cancel" | "resume" | null>(null);
  const [problem, setProblem] = useState<Failure | null>(null);
  const live = n.status === "sending" || n.status === "paused";
  async function act(key: "cancel" | "resume") {
    flushSync(() => {
      setProblem(null);
      setBusy(key);
    });
    const r = await (key === "cancel" ? cancelNewsletter(n.id) : resumeNewsletter(n.id));
    setBusy(null);
    setAsking(false);
    if (isFailure(r)) return setProblem(r);
    onChange(r);
  }
  return (
    <div className="enter grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="min-w-0 font-display text-xl font-extrabold tracking-tight break-words">{n.subject}</h2>
        <StatusBadge status={n.status} />
      </header>
      {n.status === "paused" && (
        <section role="alert" aria-label="Paused" className="card card-danger grid gap-2 p-5">
          <h3 className={`flex items-center gap-2 ${heading}`}>
            <Icon name="warning" className="size-5 text-signal-deep" />
            This newsletter paused itself
          </h3>
          <p data-testid="pause-reason" className="font-bold break-words">
            {n.pause_reason || "The mail service refused it or slowed it down."}
          </p>
          <p className="text-sm text-ink-soft">
            Nothing more goes out until someone resumes it. {people(n.counts.pending)} still {n.counts.pending === 1 ? "waits" : "wait"}. The people it failed for are not tried again.
          </p>
          {!asking && (
            <button type="button" className="btn btn-primary btn-sm justify-self-start" disabled={busy !== null} onClick={() => act("resume")}>
              {busy === "resume" ? "Resuming..." : "Resume sending"}
            </button>
          )}
        </section>
      )}
      <section aria-label="Status" className="card grid gap-3 p-5">
        <Sent n={n} />
        <p className="text-sm text-ink-soft">
          {n.started_at && (
            <>
              Started <time dateTime={n.started_at}>{when(n.started_at)}</time>.{" "}
            </>
          )}
          {n.finished_at && (
            <>
              {n.status === "cancelled" ? "Cancelled" : "Finished"} <time dateTime={n.finished_at}>{when(n.finished_at)}</time>.{" "}
            </>
          )}
          {n.status === "sending" && "Going out a few at a time. These numbers refresh every 10 seconds."}
        </p>
        {live &&
          (asking ? (
            <Confirm
              id="newsletter-cancel"
              title="Cancel this newsletter?"
              about={`${people(n.counts.pending)} still waiting will not get it. Emails already sent stay sent, and a cancelled newsletter can't be started again.`}
              yes="Yes, cancel newsletter"
              no="Keep it"
              danger
              busy={busy === "cancel"}
              onYes={() => act("cancel")}
              onNo={() => setAsking(false)}
            />
          ) : (
            <button type="button" className="btn btn-danger-outline btn-sm justify-self-start" disabled={busy !== null} onClick={() => setAsking(true)}>
              Cancel newsletter
            </button>
          ))}
        {problem && (
          <p role="alert" className="waitlist-error">
            {say(problem)}
          </p>
        )}
      </section>
      <EmailPreview label="What was sent" subject={n.subject} body={n.body} />
    </div>
  );
}
