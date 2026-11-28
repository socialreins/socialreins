"use client";

import { useState } from "react";
import { addTag, MAX_TAG, MAX_TAGS } from "@/lib/contacts";
import { TeamLink as Link } from "@/components/team-link";
import { Icon } from "@/components/ui";

// A contact's tags as chips, each with a remove button, and an inline box to add one. `onChange` gets the
// whole new set, which is what brain saves. `suggestions` are the team's existing tags; `href` makes each chip a link.
export function TagEditor({
  id,
  tags,
  suggestions,
  onChange,
  disabled,
  href,
}: {
  id: string;
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  href?: (tag: string) => string;
}) {
  const [draft, setDraft] = useState("");
  // At the limit, typing a tag would look accepted and quietly add nothing: say why instead.
  const full = tags.length >= MAX_TAGS;
  const add = () => {
    if (full) return;
    const next = addTag(tags, draft);
    setDraft("");
    if (next !== tags) onChange(next);
  };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tags.length > 0 && (
        <ul aria-label="Tags" className="contents">
          {tags.map((t) => (
            <li key={t} className="badge tone gap-1 pr-1 text-ink">
              {href ? (
                <Link href={href(t)} className="hover:underline" title={`Inbox items tagged ${t}`}>
                  {t}
                </Link>
              ) : (
                t
              )}
              <button type="button" aria-label={`Remove tag ${t}`} disabled={disabled} className="grid size-5 place-items-center rounded-full hover:bg-ink/10" onClick={() => onChange(tags.filter((x) => x !== t))}>
                <Icon name="close" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="flex items-center gap-1">
        <input
          id={id}
          aria-label="New tag"
          placeholder="Add tag"
          list={`${id}-list`}
          maxLength={MAX_TAG}
          disabled={disabled || full}
          aria-describedby={full ? `${id}-full` : undefined}
          className="field w-28 px-2 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== ",") return;
            e.preventDefault();
            add();
          }}
        />
        <button type="button" className="btn btn-quiet btn-sm px-2" aria-label="Add tag" title="Add tag" disabled={disabled || full || !draft.trim()} onClick={add}>
          <Icon name="plus" className="size-4" />
        </button>
      </span>
      {full && (
        <p id={`${id}-full`} className="hint basis-full text-xs">
          {MAX_TAGS} tags is the most a contact can have. Remove one to add another.
        </p>
      )}
      <datalist id={`${id}-list`}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
