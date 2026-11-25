"use client";

import { useEffect, useState } from "react";
import { isFailure } from "@/components/team-ui";
import { listPosts } from "@/lib/posts";

type Option = { id: string; label: string };

// A Threads link holds a code, not the post's number brain matches comments against, so the posts of the picked Threads accounts
// that were published through SocialReins are listed to pick from. Choosing one adds its number to the post lines.
export function ThreadsPostPicker({ accountIds, onPick }: { accountIds: string[]; onPick: (id: string) => void }) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const key = accountIds.join(",");
  useEffect(() => {
    let live = true;
    listPosts({ status: "published" }).then((posts) => {
      if (!live) return;
      if (isFailure(posts)) return setOptions([]);
      const ours = new Set(key.split(",").filter(Boolean));
      const out: Option[] = [];
      for (const p of posts) {
        for (const t of p.targets) {
          if (t.remote_id && t.social_account_id && ours.has(t.social_account_id) && !out.some((o) => o.id === t.remote_id)) {
            const text = p.body.replace(/\s+/g, " ").trim();
            out.push({ id: t.remote_id, label: `${text.length > 60 ? `${text.slice(0, 60)}...` : text || "(no text)"} (${t.remote_id})` });
          }
        }
      }
      setOptions(out.slice(0, 50));
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (!options) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-bold">Add a Threads post</span>
      <select
        className="field w-auto max-w-full py-1 text-sm font-normal"
        value=""
        disabled={options.length === 0}
        onChange={(e) => e.target.value && onPick(e.target.value)}
      >
        <option value="">{options.length ? "Pick a post" : "No Threads post made here yet"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
