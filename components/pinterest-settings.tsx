"use client";

import { useEffect, useState } from "react";
import type { Failure } from "@/lib/auth";
import type { Connection } from "@/lib/connections";
import { getPinterestBoards, PIN_LINK_MAX, PIN_TITLE_MAX, type PinterestBoard, type PinterestSettings } from "@/lib/posts";
import { isFailure, problemText } from "@/components/team-ui";
import { postMessages } from "@/components/posts";

// What the user types for a pin: the board's id ("" for the account's default board), the title and the link.
export type PinForm = { board: string; title: string; link: string };
export const noPin: PinForm = { board: "", title: "", link: "" };
export const pinForm = (s?: PinterestSettings | null): PinForm => ({ board: s?.board_id ?? "", title: s?.title ?? "", link: s?.link ?? "" });
// What brain's POST /v1/posts takes: blanks go as null, so an edit clears what was removed.
export const pinOut = (f: PinForm): PinterestSettings => ({ board_id: f.board.trim() || null, title: f.title.trim() || null, link: f.link.trim() || null });

// Whether `link` is an http or https address brain takes (crates/core post.rs: web_url).
export const pinLinkOk = (link: string) => {
  const l = link.trim();
  if (!l) return true;
  if (l.length > PIN_LINK_MAX || /[\s\u0000-\u001f\u007f]/.test(l)) return false;
  try {
    const u = new URL(l);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
};
export const pinTitleOk = (title: string) => [...title.trim()].length <= PIN_TITLE_MAX;
// Whether the pin has no board anywhere: none picked, and an account it goes to has no default board.
export const pinNeedsBoard = (f: PinForm, accounts: Pick<Connection, "default_board_id">[]) => !f.board.trim() && accounts.some((a) => !a.default_board_id);

// The controls for a pin: the board (read live from the one account the pin goes to), a title and a link. The
// text of the post is the pin's description.
export function PinterestPanel({ accounts, settings, onChange }: { accounts: Connection[]; settings: PinForm; onChange: (next: PinForm) => void }) {
  const set = (patch: Partial<PinForm>) => onChange({ ...settings, ...patch });
  const one = accounts.length === 1 ? accounts[0]! : null;
  const [read, setRead] = useState<{ key: string; value: PinterestBoard[] | Failure } | null>(null);
  const [tries, setTries] = useState(0);
  const key = one ? `${one.id}:${tries}` : "";
  useEffect(() => {
    if (!one) return;
    let live = true;
    getPinterestBoards(one.id).then((r) => {
      if (live) setRead({ key, value: isFailure(r) ? r : r.boards });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` holds the account's id and the retry count
  }, [key]);
  const boards = read?.key === key ? read.value : null;
  const missing = pinNeedsBoard(settings, accounts);
  const titleOver = !pinTitleOk(settings.title);
  const linkBad = !pinLinkOk(settings.link);
  const defaultName = one?.default_board_name;
  return (
    <section aria-labelledby="pinterest-heading" className="grid gap-3">
      <h3 id="pinterest-heading" className="font-display text-base font-extrabold tracking-tight">
        Pinterest settings
      </h3>
      {one ? (
        <div className="grid gap-1.5">
          <label htmlFor="pinterest-board" className="label">
            Board
          </label>
          {boards !== null && isFailure(boards) ? (
            <>
              <p role="alert" className="waitlist-error">
                The boards couldn&apos;t be read. {boards === "reconnect_required" ? "Reconnect the Pinterest account under Accounts." : problemText(boards, postMessages)}
              </p>
              <button type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={() => setTries((n) => n + 1)}>
                Try again
              </button>
            </>
          ) : (
            <select id="pinterest-board" className="field justify-self-start" value={settings.board} onChange={(e) => set({ board: e.target.value })} aria-invalid={missing || undefined} aria-describedby="pinterest-board-note">
              <option value="">{defaultName ? `Default board: ${defaultName}` : one.default_board_id ? "Default board" : "Choose a board"}</option>
              {(boards ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.privacy && b.privacy !== "PUBLIC" ? ` (${b.privacy.toLowerCase()})` : ""}
                </option>
              ))}
            </select>
          )}
          <p id="pinterest-board-note" className="hint">
            {boards === null && !read ? "Loading the boards... " : ""}
            {missing ? "This account has no default board, so choose one. " : "A pin goes to the board you choose, else to the account's default board. "}
            Secret boards aren&apos;t listed. Set the default under Accounts.
          </p>
        </div>
      ) : (
        <p id="pinterest-board-note" className="hint">
          This pin goes to {accounts.length} Pinterest accounts, each to its own default board. Set a default board for each account under Accounts, or tick one account to choose a board here.
          {missing ? " One of them has no default board yet." : ""}
        </p>
      )}
      <div className="grid gap-1.5">
        <label htmlFor="pinterest-title" className="label">
          Title (optional)
        </label>
        <input id="pinterest-title" className="field" value={settings.title} onChange={(e) => set({ title: e.target.value })} aria-invalid={titleOver || undefined} aria-describedby="pinterest-title-count" />
        <p id="pinterest-title-count" className={titleOver ? "waitlist-error" : "hint"}>
          {[...settings.title.trim()].length} of {PIN_TITLE_MAX} characters
        </p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="pinterest-link" className="label">
          Link (optional)
        </label>
        <input id="pinterest-link" type="url" inputMode="url" className="field" placeholder="https://example.com/page" value={settings.link} onChange={(e) => set({ link: e.target.value })} aria-invalid={linkBad || undefined} aria-describedby="pinterest-link-note" />
        <p id="pinterest-link-note" className={linkBad ? "waitlist-error" : "hint"}>
          {linkBad ? "Use a web address that starts with http:// or https://." : "Where the pin leads when someone clicks it."}
        </p>
      </div>
      <p className="hint">
        The text of the post is the pin&apos;s description, at most 800 characters. The first image&apos;s alt text is the pin&apos;s, cut to 500 characters. Two to five images make a carousel; a video goes on its own.
      </p>
    </section>
  );
}
