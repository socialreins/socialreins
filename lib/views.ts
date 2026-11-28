import { api } from "@/lib/auth";

// A person's saved filters for a list page, kept in brain per person and team (`/v1/views`). `filters` is the page's own
// query as short strings; the page decides what its keys mean. At most one view per page is the default.
export type ViewScope = "comments" | "inbox";
export type View = {
  id: string;
  scope: ViewScope;
  name: string;
  filters: Record<string, string>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};
export const MAX_VIEWS = 20;

const enc = encodeURIComponent;

// The default first, then by name, as brain lists them.
export const listViews = (scope: ViewScope) => api<View[]>(`/v1/views?scope=${scope}`);
export const createView = (scope: ViewScope, name: string, filters: Record<string, string>, isDefault = false) =>
  api<View>("/v1/views", "POST", { scope, name, filters, is_default: isDefault });
// A change names only what it changes; `is_default: false` clears the default and keeps the view.
export const changeView = (id: string, change: { name?: string; filters?: Record<string, string>; is_default?: boolean }) =>
  api<View>(`/v1/views/${enc(id)}`, "PUT", change);
export const deleteView = (id: string) => api(`/v1/views/${enc(id)}`, "DELETE");

// The view a shortcut key (1 to 9) means: the n-th chip.
export const viewForKey = (key: string, views: View[]) => (/^[1-9]$/.test(key) ? views[Number(key) - 1] : undefined);
// What the stored view names, said for people: "Name" or "Name (default)".
export const viewLabel = (v: Pick<View, "name" | "is_default">) => (v.is_default ? `${v.name} (default)` : v.name);
