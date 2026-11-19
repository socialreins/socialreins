import { failure, request, type Failure } from "@/lib/auth";

// The team's media library: links to files kept for reuse, nothing uploaded. `created_by` is a user id.
export type MediaItem = { id: string; url: string; name: string; created_at: string; created_by: string };
export type MediaPage = { items: MediaItem[]; next_cursor: string | null };
export type SnippetKind = "caption" | "hashtags";
export type Snippet = { id: string; kind: SnippetKind; name: string; body: string; created_at: string; updated_at: string };

// A refusal with what brain adds to it: the field it is about (`invalid_media`, `invalid_snippet`) and, for
// `already_in_library`, the id of the item already holding the link.
export type Problem = { code: Failure; field?: string; id?: string };
export const isProblem = (r: unknown): r is Problem => typeof r === "object" && r !== null && "code" in r;

const enc = encodeURIComponent;

async function call<T = "ok">(path: string, method = "GET", body?: unknown): Promise<T | Problem> {
  const res = await request(path, method, body);
  if (typeof res === "string") return { code: res };
  if (res.ok) return (res.status === 204 ? "ok" : await res.json()) as T;
  const code = await failure(res.clone());
  const extra = await res.json().catch(() => null);
  return {
    code,
    ...(typeof extra?.field === "string" && { field: extra.field }),
    ...(typeof extra?.id === "string" && { id: extra.id }),
  };
}

// Newest first; pass `next_cursor` back as `cursor` for the next page.
export function listMedia(q = "", cursor: string | null = null, limit = 24) {
  const p = new URLSearchParams({ limit: String(limit) });
  if (q.trim()) p.set("q", q.trim());
  if (cursor) p.set("cursor", cursor);
  return call<MediaPage>(`/v1/media-library?${p}`);
}
export const addMedia = (url: string, name = "") => call<MediaItem>("/v1/media-library", "POST", { url, name: name.trim() });
export const renameMedia = (id: string, name: string) => call<MediaItem>(`/v1/media-library/${enc(id)}`, "PATCH", { name: name.trim() });
export const deleteMedia = (id: string) => call(`/v1/media-library/${enc(id)}`, "DELETE");

// Sorted by name.
export const listSnippets = (kind: SnippetKind) => call<{ items: Snippet[] }>(`/v1/snippets?kind=${kind}`);
export const createSnippet = (s: { kind: SnippetKind; name: string; body: string }) => call<Snippet>("/v1/snippets", "POST", s);
export const updateSnippet = (id: string, s: { kind: SnippetKind; name: string; body: string }) => call<Snippet>(`/v1/snippets/${enc(id)}`, "PUT", s);
export const deleteSnippet = (id: string) => call(`/v1/snippets/${enc(id)}`, "DELETE");

// What the library's own refusals mean; null for the rest, which the shared messages in team-ui cover.
export function libraryText(p: Problem): string | null {
  switch (p.code) {
    case "already_in_library":
      return "That link is already in the library.";
    case "library_full":
      return "The library is full. Delete some media first.";
    case "invalid_media":
      return p.field === "name" ? "That name is too long. Use a shorter one." : "Use a public https link, like https://example.com/photo.jpg.";
    case "snippet_name_taken":
      return "Another snippet already has that name. Pick a different one.";
    case "too_many_snippets":
      return "The team has as many snippets as it can keep. Delete one first.";
    case "invalid_snippet":
      return p.field === "name" ? "Give the snippet a name, and keep it short." : p.field === "body" ? "Write the snippet's text, and keep it within the limit." : "That snippet isn't valid. Check its name and text.";
    default:
      return null;
  }
}

// Media links as https URLs, as brain takes them; null when it isn't one.
export const httpsUrl = (raw: string) => {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};

// `snippet` put in place of the selection [start, end) of `text`, with a separator (a space for hashtags, a
// new line for a caption) where it would touch other text. `caret` is where the cursor goes: right after it.
export function insertAt(text: string, start: number, end: number, snippet: string, kind: SnippetKind) {
  const sep = kind === "hashtags" ? " " : "\n";
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !/\s$/.test(before) ? sep : "";
  const trail = after && !/^\s/.test(after) ? sep : "";
  const inserted = lead + snippet + trail;
  return { text: before + inserted + after, caret: before.length + lead.length + snippet.length };
}

// What a library item is called when it has no name: the file name (a last path part with an extension), else the host.
export function mediaLabel(item: Pick<MediaItem, "url" | "name">) {
  if (item.name.trim()) return item.name;
  try {
    const u = new URL(item.url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return last.includes(".") ? last : u.host;
  } catch {
    return item.url;
  }
}
