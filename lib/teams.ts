import { api, type Role, type Team } from "@/lib/auth";
import type { Subscriber } from "@/lib/newsletter";

export type Member = { id: string; name: string; email: string; role: Role; joined_at: string };
export type Invitation = {
  id: string;
  email: string;
  role: Exclude<Role, "owner">;
  invited_by: string | null;
  expires_at: string;
  created_at: string;
};
export type InvitationPreview = {
  team: string;
  email: string;
  role: Role;
  invited_by: string | null;
  expires_at: string;
};

const enc = encodeURIComponent;

export const listTeams = () => api<Team[]>("/v1/teams");
// `slug` is the address the team starts at; left out, brain gives it its code.
export const createTeam = (name: string, slug?: string) => api<Team>("/v1/teams", "POST", slug ? { name, slug } : { name });
export const switchTeam = (teamId: string) => api<Team>("/v1/current-team", "PUT", { team_id: teamId });
export const setPublicPages = (on: boolean) => api<Team>("/v1/team", "PATCH", { public_pages: on });
export const setNewsletter = (on: boolean) => api<Team>("/v1/team", "PATCH", { newsletter: on });
export const setAutomationsPaused = (on: boolean) => api<Team>("/v1/team", "PATCH", { automations_paused: on });
export const setRequireApproval = (on: boolean) => api<Team>("/v1/team", "PATCH", { require_approval: on });
// The team's newsletter sign-ups, newest first, at most the 5000 brain lists. `total` is every
// sign-up of the team, shown or not; missing from an older brain.
export type Subscribers = { subscribers: Subscriber[]; total?: number };
export const listSubscribers = () => api<Subscribers>("/v1/subscribers");
export const removeSubscriber = (id: string) => api(`/v1/subscribers/${enc(id)}`, "DELETE");
export const renameTeam = (name: string) => api<Team>("/v1/team", "PATCH", { name });
// The team's own address (/t/<slug>/...); null goes back to the code. Owners only, with a sign-in from the last 10 minutes
// (else reauth_required), and a team gives up its address at most 3 times in 30 days (slug_changed_too_often).
export const setSlug = (slug: string | null) => api<Team>("/v1/team/slug", "PATCH", { slug });

export type SlugCheck = { slug: string; available: boolean; reason: string | null };
// Whether `slug` can be taken now. `forTeam` (a code) is the team that would take it, so its own old addresses read as free.
export const checkSlug = (slug: string, forTeam?: string) =>
  api<SlugCheck>(`/v1/slugs/check?slug=${enc(slug)}${forTeam ? `&for_team=${enc(forTeam)}` : ""}`);

// What is wrong with a typed address that needs no call to brain, or null. Mirrors brain's format rules; reserved and
// blocked words, and addresses in use, are brain's to say (checkSlug).
export const slugProblem = (slug: string) =>
  slug.length < 3 || slug.length > 32
    ? "Use 3 to 32 characters."
    : /[^a-z0-9-]/.test(slug)
      ? "Use only lowercase letters, digits and dashes."
      : /^-|-$/.test(slug)
        ? "Start and end with a letter or digit."
        : slug.includes("--")
          ? "Use one dash at a time, not two in a row."
          : null;

// brain's reason for refusing an address, in words.
export const slugReason = (reason: string | null) =>
  reason === "taken"
    ? "That address is taken, or another team gave it up lately. Pick a different one."
    : reason === "reserved"
      ? "That address is reserved. Pick a different one."
      : reason === "blocked"
        ? "That address is not allowed. Pick a different one."
        : reason === "current"
          ? "That is already the team's address."
          : "That address doesn't work. Pick a different one.";

// An address from a team name ("Acme Co." gives "acme-co"), or "" when the name has too few letters or digits.
export const suggestSlug = (name: string) => {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  return slug.length >= 3 ? slug : "";
};

// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export const deleteTeam = () => api("/v1/team", "DELETE", {});
export const listMembers = () => api<Member[]>("/v1/team/members");
export const setRole = (userId: string, role: Role) => api<Member>(`/v1/team/members/${enc(userId)}`, "PATCH", { role });
// Removing yourself is leaving the team.
export const removeMember = (userId: string) => api(`/v1/team/members/${enc(userId)}`, "DELETE");
export const listInvitations = () => api<Invitation[]>("/v1/team/invitations");
// `token` is the Turnstile token, sent only when brain has Turnstile on.
export const invite = (email: string, role: Invitation["role"], token?: string | null) =>
  api<Invitation>("/v1/team/invitations", "POST", { email, role, ...(token && { turnstile_token: token }) });
export const revokeInvitation = (id: string) => api(`/v1/team/invitations/${enc(id)}`, "DELETE");
export const previewInvitation = (token: string) => api<InvitationPreview>(`/v1/invitations/${enc(token)}`);
export const acceptInvitation = (token: string) => api<Team>(`/v1/invitations/${enc(token)}`, "POST");

export const manages = (role: Role) => role !== "member";

// "an owner", "an admin", "a member".
export const roleArticle = (role: Role) => (role === "member" ? "a" : "an");

// Mirrors brain's Role::may_change: only an owner touches the owner role, on either side.
export const mayChange = (mine: Role, theirs: Role) => mine === "owner" || (mine === "admin" && theirs !== "owner");

// The roles `mine` may hand out.
export const grantable = (mine: Role): Role[] =>
  mine === "owner" ? ["owner", "admin", "member"] : mine === "admin" ? ["admin", "member"] : [];
