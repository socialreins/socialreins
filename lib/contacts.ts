import { api } from "@/lib/auth";
import type { Item } from "@/lib/inbox";

// A person who wrote to one of the team's accounts, kept by brain per network.
export type Contact = {
  id: string;
  platform: string;
  external_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  tags: string[];
  notes: string | null;
  first_seen_at: string;
  last_seen_at: string;
  items_count: number;
};
export type ContactPage = { items: Contact[]; next_cursor: string | null };
// One contact comes with its latest inbox items, 20 at most.
export type ContactDetail = Contact & { recent: Item[] };
export type TagCount = { tag: string; count: number };

export const MAX_TAGS = 20;
export const MAX_TAG = 30;
export const MAX_NOTES = 2000;

// A typed tag as brain keeps it: lower case, no commas, 1 to 30 characters. Empty when nothing is left.
export const cleanTag = (raw: string) => [...raw.replaceAll(",", " ").trim().replace(/\s+/g, " ").toLowerCase()].slice(0, MAX_TAG).join("").trim();
// `tags` with `raw` added; the same list back when it is empty, already there or the list is full.
export function addTag(tags: string[], raw: string, max = MAX_TAGS) {
  const tag = cleanTag(raw);
  return !tag || tags.includes(tag) || tags.length >= max ? tags : [...tags, tag];
}

const enc = encodeURIComponent;

export type ContactQuery = { q?: string; tag?: string; platform?: string };
// Latest seen first; pass `next_cursor` back as `cursor` for the next page.
export function listContacts({ q, tag, platform }: ContactQuery, cursor?: string | null) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (tag) p.set("tag", tag);
  if (platform) p.set("platform", platform);
  if (cursor) p.set("cursor", cursor);
  return api<ContactPage>(`/v1/contacts${p.size ? `?${p}` : ""}`);
}
export const getContact = (id: string) => api<ContactDetail>(`/v1/contacts/${enc(id)}`);
// `tags` replaces the whole set; `notes` null clears them.
export const updateContact = (id: string, patch: { notes?: string | null; tags?: string[] }) => api<Contact>(`/v1/contacts/${enc(id)}`, "PATCH", patch);
// Owners and admins only. The contact's name, tags and notes go; its items stay in the inbox.
export const deleteContact = (id: string) => api(`/v1/contacts/${enc(id)}`, "DELETE");
export const listContactTags = () => api<TagCount[]>("/v1/contact-tags");

export const contactName = (c: Pick<Contact, "display_name" | "handle" | "external_id">) => c.display_name || (c.handle ? `@${c.handle}` : c.external_id);
