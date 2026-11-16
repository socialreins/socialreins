"use client";

import { useEffect, useState } from "react";
import { DETAILS_MAX, getPostPage, savePostPage, type PostPage } from "@/lib/posts";
import { useSession } from "@/components/app-shell";
import { postMessages } from "@/components/posts";
import { TeamLink as Link } from "@/components/team-link";
import { isFailure, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

const messages = {
  ...postMessages,
  details_too_long: `The details are too long: at most ${DETAILS_MAX.toLocaleString("en")} characters.`,
  public_pages_off: "Public pages are switched off for this team. Switch them on under Team first.",
};

// The public page of a saved post (of the whole post, when it has a version per platform): a switch and
// free details. Anyone with the link can open it once a version is published.
export function PostPagePanel({ id }: { id: string }) {
  const on = useSession().user.current_team.public_pages;
  const [page, setPage] = useState<PostPage | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [details, setDetails] = useState("");
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    if (!on) return;
    getPostPage(id).then((r) => {
      if (isFailure(r)) return;
      setPage(r);
      setEnabled(r.enabled);
      setDetails(r.details);
    });
  }, [id, on]);

  if (!on)
    return (
      <p className="hint">
        A post can have a public page with extra details and links. Switch public pages on under{" "}
        <Link href="/team" className="font-bold underline">
          Team
        </Link>
        .
      </p>
    );
  if (!page) return null;
  const url = page.code ? `${window.location.origin}/p/${page.code}` : "";
  return (
    <section aria-labelledby="page-heading" className="card grid gap-4 p-5">
      <h2 id="page-heading" className="font-display text-lg font-extrabold tracking-tight">
        Public page
      </h2>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run("page", () => savePostPage(id, { enabled, details }), (r) => {
            setPage(r);
            return r.enabled ? "Public page saved." : "Saved. The page is switched off.";
          });
        }}
      >
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Anyone with the link can see this post and its details
        </label>
        <div className="grid gap-1.5">
          <label htmlFor="page-details" className="label">
            Details
          </label>
          <textarea
            id="page-details"
            className="field min-h-32"
            value={details}
            maxLength={DETAILS_MAX}
            onChange={(e) => setDetails(e.target.value)}
            aria-describedby="page-details-note"
            aria-invalid={problem === "details_too_long" || undefined}
          />
          <p id="page-details-note" className="hint">
            Resources, links, anything that did not fit in the post. Links become clickable. {[...details].length.toLocaleString("en")} of {DETAILS_MAX.toLocaleString("en")} characters.
          </p>
        </div>
        <button type="submit" className="btn btn-primary btn-sm justify-self-start" disabled={busy !== null}>
          {busy ? "Saving..." : "Save public page"}
        </button>
      </form>
      <Status problem={problem} done={done} overrides={messages} />
      {page.enabled && page.code && (
        <p className="text-sm">
          {page.live ? "The page is open: " : "The page opens once the post is published: "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-bold underline">
            {url}
            <Icon name="external" className="ml-1 inline size-3.5" />
          </a>
        </p>
      )}
    </section>
  );
}
