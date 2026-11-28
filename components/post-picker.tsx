"use client";

import { useEffect, useRef, useState } from "react";
import { isFailure } from "@/components/team-ui";
import { platformName } from "@/components/platform-icons";
import type { Connection } from "@/lib/connections";
import { listPosts } from "@/lib/posts";

type Option = { id: string; platform: string; label: string };
const MAX_OPTIONS = 100;

// A post's link holds the code its network shows, not always the id brain matches comments against
// (an Instagram, Threads, Facebook or LinkedIn link names a code), so the posts of the accounts in
// scope that were published through SocialReins are listed by network to pick from. A pick adds the
// exact id brain matches. `onLoad` gives the form every id it offers, so a picked line counts as a post.
export function PostPicker({
  accounts,
  onPick,
  onLoad,
}: {
  accounts: Pick<Connection, "id" | "provider">[];
  onPick: (id: string) => void;
  onLoad?: (ids: string[]) => void;
}) {
  const [state, setState] = useState<Option[] | "loading" | "failed">("loading");
  const [chosen, setChosen] = useState("");
  const [cut, setCut] = useState(false);
  const load = useRef(onLoad);
  useEffect(() => {
    load.current = onLoad;
  }, [onLoad]);
  const key = accounts.map((a) => `${a.id}:${a.provider}`).join(",");
  useEffect(() => {
    let live = true;
    listPosts({ status: "published", order: "desc", limit: 500 }).then((posts) => {
      if (!live) return;
      if (isFailure(posts)) return setState("failed");
      const ours = new Map(key.split(",").filter(Boolean).map((pair) => pair.split(":") as [string, string]));
      const out: Option[] = [];
      for (const p of posts) {
        for (const t of p.targets) {
          const platform = t.social_account_id ? ours.get(t.social_account_id) : undefined;
          if (t.status === "published" && t.remote_id && platform && !out.some((o) => o.id === t.remote_id)) {
            const text = p.body.replace(/\s+/g, " ").trim();
            out.push({ id: t.remote_id, platform, label: `${text.length > 60 ? `${text.slice(0, 60)}...` : text || "(no text)"} (${t.remote_id})` });
          }
        }
      }
      load.current?.(out.map((o) => o.id));
      setCut(out.length > MAX_OPTIONS);
      setState(out.slice(0, MAX_OPTIONS));
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (state === "loading") return <p className="hint">Loading your posts...</p>;
  if (state === "failed") return <p className="hint">Your posts could not be loaded. Type a post&apos;s link or id instead.</p>;
  const networks = [...new Set(state.map((o) => o.platform))].sort();
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="post-picker" className="font-bold">
          Add one of your posts
        </label>
        <select id="post-picker" className="field w-auto max-w-full py-1 text-sm font-normal" value={chosen} disabled={state.length === 0} onChange={(e) => setChosen(e.target.value)}>
          <option value="">{state.length ? "Pick a post" : "No published post made here yet"}</option>
          {networks.map((n) => (
            <optgroup key={n} label={platformName(n)}>
              {state
                .filter((o) => o.platform === n)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
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
      {cut && <p className="hint">Only the newest {MAX_OPTIONS} are listed. Paste the link of an older post for Bluesky, X or YouTube, or load the list again.</p>}
    </div>
  );
}
