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
export const createTeam = (name: string) => api<Team>("/v1/teams", "POST", { name });
export const switchTeam = (teamId: string) => api<Team>("/v1/current-team", "PUT", { team_id: teamId });
export const setPublicPages = (on: boolean) => api<Team>("/v1/team", "PATCH", { public_pages: on });
export const setNewsletter = (on: boolean) => api<Team>("/v1/team", "PATCH", { newsletter: on });
export const setRequireApproval = (on: boolean) => api<Team>("/v1/team", "PATCH", { require_approval: on });
export const listSubscribers = () => api<{ subscribers: Subscriber[] }>("/v1/subscribers");
export const removeSubscriber = (id: string) => api(`/v1/subscribers/${enc(id)}`, "DELETE");
export const renameTeam = (name: string) => api<Team>("/v1/team", "PATCH", { name });
// The team's own address (/t/<slug>/...); null goes back to the code.
export const setSlug = (slug: string | null) => api<Team>("/v1/team", "PATCH", { slug });
// What is wrong with a typed address, or null. Mirrors brain's rules, except its reserved words.
export const slugProblem = (slug: string) =>
  slug.length < 3 || slug.length > 30
    ? "Use 3 to 30 characters."
    : /[^a-z0-9-]/.test(slug)
      ? "Use only lowercase letters, digits and dashes."
      : /^-|-$/.test(slug)
        ? "Start and end with a letter or digit."
        : slug.includes("--")
          ? "Use one dash at a time, not two in a row."
          : null;
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export const deleteTeam = () => api("/v1/team", "DELETE", {});
export const listMembers = () => api<Member[]>("/v1/team/members");
export const setRole = (userId: string, role: Role) => api<Member>(`/v1/team/members/${enc(userId)}`, "PATCH", { role });
// Removing yourself is leaving the team.
export const removeMember = (userId: string) => api(`/v1/team/members/${enc(userId)}`, "DELETE");
export const listInvitations = () => api<Invitation[]>("/v1/team/invitations");
export const invite = (email: string, role: Invitation["role"]) =>
  api<Invitation>("/v1/team/invitations", "POST", { email, role });
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
