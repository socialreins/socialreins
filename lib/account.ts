import { failure, request, type Failure } from "@/lib/auth";

// Your data as a JSON file brain streams; one export an hour (rate_limited after that).
export async function exportData(): Promise<{ blob: Blob; name: string } | Failure> {
  const res = await request("/v1/account/export", "POST", undefined, 120_000);
  if (typeof res === "string") return res;
  if (!res.ok) return failure(res);
  try {
    return { blob: await res.blob(), name: `socialreins-export-${new Date().toISOString().slice(0, 10)}.json` };
  } catch {
    // The stream ended early: brain failed part way, so the file would be cut short.
    return "error";
  }
}

// `shared` is the teams the person owns alone that others belong to: they hand those over first.
export type Deleted = "ok" | { shared: string[] };

// Deletes the signed-in account for good. Needs a sign-in from the last 10 minutes (reauth_required).
export async function deleteAccount(email: string): Promise<Deleted | Failure> {
  const res = await request("/v1/account", "DELETE", { email });
  if (typeof res === "string") return res;
  if (res.ok) return "ok";
  const body = await res.clone().json().catch(() => null);
  if (body?.error === "owns_shared_team" && Array.isArray(body.teams)) return { shared: body.teams.map(String) };
  return failure(res);
}
