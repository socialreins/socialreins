"use client";

import { useEffect, useState } from "react";
import { isFailure } from "@/components/team-ui";
import { listPosts } from "@/lib/posts";

type Option = { id: string; label: string };
const MAX_OPTIONS = 50;

// A Threads link holds a code, not the post's number brain matches comments against, so the posts of the Threads accounts in
// scope that were published through SocialReins are listed to pick from. Add puts the chosen post's number in the post lines.
export function ThreadsPostPicker({ accountIds, onPick }: { accountIds: string[]; onPick: (id: string) => void }) {
  const [state, setState] = useState<Option[] | "loading" | "failed">("loading");
  const [chosen, setChosen] = useState("");
  const [cut, setCut] = useState(false);
  const key = accountIds.join(",");
  useEffect(() => {
    let live = true;
    listPosts({ status: "published" }).then((posts) => {
      if (!live) return;
      if (isFailure(posts)) return setState("failed");
      const ours = new Set(key.split(",").filter(Boolean));
      const out: Option[] = [];
      for (const p of posts) {
        for (const t of p.targets) {
          if (t.status === "published" && t.remote_id && t.social_account_id && ours.has(t.social_account_id) && !out.some((o) => o.id === t.remote_id)) {
            const text = p.body.replace(/\s+/g, " ").trim();
            out.push({ id: t.remote_id, label: `${text.length > 60 ? `${text.slice(0, 60)}...` : text || "(no text)"} (${t.remote_id})` });
          }
        }
      }
      setCut(out.length > MAX_OPTIONS);
      setState(out.slice(0, MAX_OPTIONS));
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (state === "loading") return <p className="hint">Loading your Threads posts...</p>;
  if (state === "failed") return <p className="hint">Your Threads posts could not be loaded. Type a post&apos;s number instead.</p>;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="threads-post-picker" className="font-bold">
          Add a Threads post
        </label>
        <select id="threads-post-picker" className="field w-auto max-w-full py-1 text-sm font-normal" value={chosen} disabled={state.length === 0} onChange={(e) => setChosen(e.target.value)}>
          <option value="">{state.length ? "Pick a post" : "No Threads post made here yet"}</option>
          {state.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!chosen}
          onClick={() => {
            onPick(chosen);
            setChosen("");
          }}
        >
          Add
        </button>
      </div>
      {cut && <p className="hint">Only the newest {MAX_OPTIONS} are listed. Type an older post&apos;s number to watch it.</p>}
    </div>
  );
}
