import { codes, getTabTeam, type Failure } from "@/lib/auth";
import { apiUrl } from "@/lib/waitlist";

// A file brain stored from the device; `url` goes in a post's media like any link.
export type Upload = { id: string; url: string; content_type: string; size: number };

// What brain takes from a device (it checks the bytes, not this): images, LinkedIn's PDF and videos.
export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/quicktime";

// Sends `file` raw to POST /v1/uploads, reporting the share sent so far (0 to 1). XMLHttpRequest,
// since fetch reports no upload progress. No timeout: a large video takes as long as it takes.
// `signal` cancels it; the caller tells a cancel by the signal, as it answers "error".
export function uploadFile(file: Blob, onProgress?: (sent: number) => void, signal?: AbortSignal): Promise<Upload | Failure> {
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
      let body: { url?: unknown; error?: unknown } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201 && typeof body?.url === "string") return resolve(body as Upload);
      const known = codes.find((c) => c === body?.error);
      resolve(known ?? (xhr.status === 401 ? "signed_out" : xhr.status === 429 ? "rate_limited" : "error"));
    };
    xhr.onerror = () => resolve("error");
    xhr.send(file);
  });
}
