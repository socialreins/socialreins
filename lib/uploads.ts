import { codes, getTabTeam, type Failure } from "@/lib/auth";
import { apiUrl } from "@/lib/waitlist";

// A file brain stored from the device; `url` goes in a post's media like any link.
export type Upload = { id: string; url: string; content_type: string; size: number };

// brain refused the file because the team's upload storage is full: the bytes it counts now and
// the team's budget, both in bytes (a budget of 0 is unlimited, so no answer carries one).
export type StorageFull = { error: "storage_limit"; used: number; budget: number };

// What brain takes from a device (it checks the bytes, not this): images, LinkedIn's PDF and videos.
export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/quicktime";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const KB = 1024;

// Bytes as the console and the composer say them, in the units brain's budgets use (GiB, said
// GB): "1.2 GB", "512 MB", "0 bytes".
export function storageText(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(1))} GB`;
  if (bytes >= MB) return `${Number((bytes / MB).toFixed(1))} MB`;
  if (bytes >= KB) return `${Number((bytes / KB).toFixed(1))} KB`;
  return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
}

// The composer's message for a full team, with the numbers brain answered.
export const storageFullText = ({ used, budget }: StorageFull) =>
  `this team's upload storage is full (${storageText(used)} of ${storageText(budget)}). An admin can raise it, or add a link in the Library instead.`;

export const isStorageFull = (r: Upload | Failure | StorageFull): r is StorageFull =>
  typeof r === "object" && "error" in r && r.error === "storage_limit";

// Sends `file` raw to POST /v1/uploads, reporting the share sent so far (0 to 1). XMLHttpRequest,
// since fetch reports no upload progress. No timeout: a large video takes as long as it takes.
// `signal` cancels it; the caller tells a cancel by the signal, as it answers "error".
export function uploadFile(file: Blob, onProgress?: (sent: number) => void, signal?: AbortSignal): Promise<Upload | Failure | StorageFull> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    if (signal?.aborted) return resolve("error");
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.onabort = () => resolve("error");
    xhr.open("POST", `${apiUrl}/v1/uploads`);
    xhr.withCredentials = true;
    const team = getTabTeam();
    if (team) xhr.setRequestHeader("X-Team", team);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: { url?: unknown; error?: unknown; used?: unknown; budget?: unknown } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201 && typeof body?.url === "string") return resolve(body as Upload);
      // A full team carries the numbers, which a bare code cannot.
      if (xhr.status === 413 && body?.error === "storage_limit" && typeof body.used === "number" && typeof body.budget === "number") {
        return resolve({ error: "storage_limit", used: body.used, budget: body.budget });
      }
      const known = codes.find((c) => c === body?.error);
      resolve(known ?? (xhr.status === 401 ? "signed_out" : xhr.status === 429 ? "rate_limited" : "error"));
    };
    xhr.onerror = () => resolve("error");
    xhr.send(file);
  });
}
