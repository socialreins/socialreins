import { failure, request, type Failure } from "@/lib/auth";
import { platformName } from "@/components/platform-icons";

// A comment or mention a team keeps to reuse as content. The text and author are brain's own copy,
// taken when it was made, so a purged inbox item never empties it.
export type Permission = "not_asked" | "granted" | "declined";
export type Testimonial = {
  id: string;
  // The comment or mention it came from; null once that item is purged or removed.
  inbox_item_id: string | null;
  contact_id: string | null;
  text: string;
  author_name: string | null;
  author_handle: string | null;
  platform: string | null;
  source_url: string | null;
  permission: Permission;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type TestimonialPage = { items: Testimonial[]; next_cursor: string | null };

// A refusal with the field brain names (`invalid_testimonial`).
export type Problem = { code: Failure; field?: string };
export const isProblem = (r: unknown): r is Problem => typeof r === "object" && r !== null && "code" in r;

const enc = encodeURIComponent;

async function call<T = "ok">(path: string, method = "GET", body?: unknown): Promise<T | Problem> {
  const res = await request(path, method, body);
  if (typeof res === "string") return { code: res };
  if (res.ok) return (res.status === 204 ? "ok" : await res.json()) as T;
  const code = await failure(res.clone());
  const extra = await res.json().catch(() => null);
  return { code, ...(typeof extra?.field === "string" && { field: extra.field }) };
}

// Newest first; pass `next_cursor` back as `cursor` for the next page.
export function listTestimonials(cursor: string | null = null, limit = 50) {
  const p = new URLSearchParams({ limit: String(limit) });
  if (cursor) p.set("cursor", cursor);
  return call<TestimonialPage>(`/v1/testimonials?${p}`);
}
// `text` left out takes the item's own, trimmed by brain.
export const addTestimonial = (inboxItemId: string, note = "") =>
  call<Testimonial>("/v1/testimonials", "POST", { inbox_item_id: inboxItemId, ...(note.trim() && { note: note.trim() }) });
export const changeTestimonial = (id: string, change: { text?: string; note?: string; permission?: Permission }) =>
  call<Testimonial>(`/v1/testimonials/${enc(id)}`, "PATCH", change);
export const deleteTestimonial = (id: string) => call(`/v1/testimonials/${enc(id)}`, "DELETE");

export const PERMISSIONS: Permission[] = ["not_asked", "granted", "declined"];
export const permissionName: Record<Permission, string> = { not_asked: "Not asked", granted: "Granted", declined: "Declined" };

// Who said it: their name, their handle, the network, in that order, each when known.
export function attribution(t: Pick<Testimonial, "author_name" | "author_handle" | "platform">): string {
  const name = t.author_name?.trim() || (t.author_handle ? `@${t.author_handle}` : "");
  const handle = t.author_name?.trim() && t.author_handle ? ` (@${t.author_handle})` : "";
  const network = t.platform ? ` on ${platformName(t.platform)}` : "";
  return `${name}${handle}${network}`.trim();
}

// The quote and who said it, as plain text for a post or a document.
export function quoteText(t: Pick<Testimonial, "text" | "author_name" | "author_handle" | "platform">): string {
  const who = attribution(t);
  const quote = `"${t.text.trim()}"`;
  return who ? `${quote}\n${who}` : quote;
}

// The quote as a Markdown blockquote, with who said it and, when brain has one, a link to the post.
export function markdownQuote(
  t: Pick<Testimonial, "text" | "author_name" | "author_handle" | "platform" | "source_url">,
): string {
  const quote = t.text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const who = attribution(t);
  const link = t.source_url ? `[the original post](${t.source_url})` : "";
  const line = [who, link].filter(Boolean).join(", ");
  return line ? `${quote}\n\n${line}` : quote;
}

// What the composer starts with on "Post it": the quote and the attribution, nothing else.
export const postText = quoteText;

// "Post it" hands the text to the composer through sessionStorage, so a long quote never has to
// fit in an address, and a shared link never carries someone's words in it.
const DRAFT = "testimonial-draft";

// What the last "Post it" handed over, kept in memory too so a rendered twice composer reads it once.
let handed: string | null = null;

// The address of a new post that starts from `t`; `takePostText` gives the composer its text.
export function startPost(t: Pick<Testimonial, "id" | "text" | "author_name" | "author_handle" | "platform">): string {
  handed = null;
  try {
    sessionStorage.setItem(DRAFT, postText(t));
  } catch {
    // A browser that refuses storage still opens the composer, just empty.
  }
  return `/posts/new?testimonial=${t.id}`;
}

// The text `startPost` left, once.
export function takePostText(): string | null {
  if (handed !== null) return handed;
  try {
    const text = sessionStorage.getItem(DRAFT);
    if (text === null) return null;
    sessionStorage.removeItem(DRAFT);
    handed = text;
    return text;
  } catch {
    return null;
  }
}

// What the page says about a permission, in one honest line.
export const permissionNote =
  "Only use a testimonial in your own posts once its person has said yes. The note is for you, and publishing their words stays your call.";
