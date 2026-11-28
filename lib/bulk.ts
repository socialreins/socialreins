// Bulk upload: a CSV of posts read into rows, checked here first, then by brain's validate_only, and
// created one after another. Columns: text (required), networks, media, time, first_comment.
import { api, type Failure } from "@/lib/auth";
import { csvCell, parseCsv } from "@/lib/csv";
import { platformName } from "@/components/platform-icons";
import { isPlatform, limits, publishing, type Platform, type PostGroupInput, type PostInput } from "@/lib/posts";

export const MAX_ROWS = 200;
export const MAX_FILE_BYTES = 1_000_000;
export const COLUMNS = ["text", "networks", "media", "time", "first_comment"] as const;
type Column = (typeof COLUMNS)[number];

// When a row's post goes out: a draft, the set's next free queue slot, or a time (ISO, UTC).
export type When = { kind: "draft" } | { kind: "queue" } | { kind: "at"; iso: string };
export type BulkRow = {
  // 1-based, counting the rows under the header that are not blank.
  n: number;
  // The row's cells as the file has them, for the failures CSV.
  cells: Record<Column, string>;
  text: string;
  networks: Platform[];
  media: string[];
  when: When | null;
  first_comment: string;
  // What is wrong with the row, in plain words; empty when it can go to brain.
  errors: string[];
};

const HTTPS = /^https:\/\/[^\s/]+\/?\S*$/;
// Seconds are optional: a spreadsheet saved as CSV writes "2026-11-25 09:30:00".
const TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

// "2026-11-25 09:30" in the browser's zone; null for a date or time that does not exist there
// (30 February, or an hour a clock change skips).
export function parseTime(value: string): Date | null {
  const m = TIME.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((part) => (part === undefined ? 0 : Number(part))) as [number, number, number, number, number, number];
  const at = new Date(y, mo - 1, d, h, mi, s);
  return at.getFullYear() === y && at.getMonth() === mo - 1 && at.getDate() === d && at.getHours() === h && at.getMinutes() === mi && at.getSeconds() === s ? at : null;
}

// One CSV row as a post for the set whose connected networks are `available`. TikTok is never one: its
// privacy and disclosure choices can't be made honestly in a spreadsheet, so it is posted from the composer.
export function readRow(n: number, cells: Record<Column, string>, available: Platform[], now = new Date()): BulkRow {
  const errors: string[] = [];
  const text = cells.text.trim() ? cells.text : "";
  if (!text) errors.push("The text is missing.");

  const media = cells.media.split(/\s+/).filter(Boolean);
  const names = cells.networks.toLowerCase().split(/[\s,]+/).filter(Boolean);
  let networks: Platform[] = [];
  if (names.length === 0) {
    // Instagram and YouTube need media, so a row without any leaves them out unless it names them. Pinterest needs
    // media and the account's default board, so a row goes there only when it names it.
    networks = available.filter((p) => p !== "tiktok" && p !== "pinterest" && (media.length > 0 || (p !== "instagram" && p !== "youtube")));
    if (networks.length === 0) errors.push("The set has no connected network a CSV can post to. Connect one under Accounts.");
  }
  for (const name of new Set(names)) {
    if (name === "tiktok") errors.push("TikTok needs privacy and disclosure choices a CSV can't make. Post to TikTok from the composer.");
    else if (!isPlatform(name)) errors.push(`"${name}" isn't a network. Use ${publishing.filter((p) => p !== "tiktok").join(", ")}.`);
    else if (!available.includes(name)) errors.push(`The set has no ${platformName(name)} account.`);
    else networks.push(name);
  }

  const bad = media.filter((m) => !HTTPS.test(m));
  if (bad.length) errors.push(`Media must be public https links: ${bad.join(" ")} isn't one.`);
  if (networks.includes("youtube") && media.length === 0) errors.push("YouTube needs a video: add its link under media.");
  if (networks.includes("pinterest") && media.length === 0) errors.push("Pinterest needs an image or a video: add its link under media.");

  const time = cells.time.trim();
  let when: When | null = null;
  if (!time) when = { kind: "draft" };
  else if (time.toLowerCase() === "queue") when = { kind: "queue" };
  else {
    const at = parseTime(time);
    if (!at) errors.push(`"${time}" isn't a time. Write it like 2026-11-25 09:30, or queue, or leave it empty for a draft.`);
    else if (at.getTime() <= now.getTime()) errors.push(`${time} is in the past.`);
    else when = { kind: "at", iso: at.toISOString() };
  }

  const first_comment = cells.first_comment.trim() ? cells.first_comment : "";
  if (first_comment && networks.length > 0 && !networks.some((p) => limits[p].comment !== null))
    errors.push("Only Facebook, Instagram, LinkedIn and YouTube take a first comment.");

  return { n, cells, text, networks, media, when, first_comment, errors };
}

// The file's rows, or why it can't be read. The header names the columns in any order and case;
// other columns are ignored, and so are blank lines.
export function readCsv(csv: string, available: Platform[], now = new Date()): BulkRow[] | string {
  const [head, ...body] = parseCsv(csv);
  const columns = (head ?? []).map((h) => h.trim().toLowerCase());
  if (!columns.includes("text")) return "The first line must name the columns, with at least text. Download the template to start from.";
  const lines = body.filter((cells) => cells.some((c) => c.trim()));
  if (lines.length === 0) return "The file has no posts under its header.";
  if (lines.length > MAX_ROWS) return `The file has ${lines.length} posts. Upload at most ${MAX_ROWS} at a time.`;
  return lines.map((cells, i) => {
    // A failures CSV starts a cell that looks like a formula with a quote (csvCell); one quote there is dropped.
    const get = (c: Column) => (columns.includes(c) ? (cells[columns.indexOf(c)] ?? "") : "").replace(/^'(?=[=@+\-\t\r])/, "");
    return readRow(i + 1, Object.fromEntries(COLUMNS.map((c) => [c, get(c)])) as Record<Column, string>, available, now);
  });
}

// What brain's create takes for a row: one post for one network, a group for more. Platforms that
// can't post a first comment get an empty one, as the composer sends it.
export function rowInput(row: BulkRow, setId: string): { one: PostInput } | { group: PostGroupInput } {
  const when = row.when ?? { kind: "draft" };
  const shared = {
    social_set_id: setId,
    body: row.text,
    media: row.media,
    ...(when.kind === "queue" ? { queue: true as const } : { scheduled_at: when.kind === "at" ? when.iso : null }),
    ...(row.first_comment ? { first_comment: row.first_comment } : {}),
    // brain uploads as private without a choice; said here so the payload matches the composer's default.
    ...(row.networks.includes("youtube") ? { youtube: { privacy: "private" as const } } : {}),
  };
  if (row.networks.length === 1) return { one: { ...shared, platform: row.networks[0]! } };
  const silent = row.first_comment ? row.networks.filter((p) => limits[p].comment === null) : [];
  const overrides = silent.length ? Object.fromEntries(silent.map((p) => [p, { first_comment: "" }])) : undefined;
  return { group: { ...shared, platforms: row.networks, ...(overrides ? { overrides } : {}) } };
}

// brain's validate_only answer: every problem of every platform, and of the request as a whole.
export type Problem = { code: string; field?: string; part?: number; detail?: string };
export type Validation = { ok: boolean; platforms: { platform: string; ok: boolean; problems: Problem[] }[]; problems: Problem[] };
export function validateRow(row: BulkRow, setId: string): Promise<Validation | Failure> {
  const input = rowInput(row, setId);
  return "one" in input
    ? api<Validation>("/v1/posts?validate_only=true", "POST", input.one)
    : api<Validation>("/v1/post-groups?validate_only=true", "POST", input.group);
}

// The rows that weren't created, as the file had them, with an `error` column, ready to fix and upload again.
export function failuresCsv(rows: { cells: Record<Column, string>; error: string }[]): string {
  const lines = rows.map((r) => [...COLUMNS.map((c) => r.cells[c]), r.error].map((v) => csvCell(v)).join(","));
  return [[...COLUMNS, "error"].join(","), ...lines].join("\r\n") + "\r\n";
}

const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
// A template to start from: a post at a time (tomorrow, 09:30), one in the queue, one draft.
export function templateCsv(now = new Date()): string {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 30);
  return [
    COLUMNS.join(","),
    `"Our autumn opening hours, now online.",bluesky linkedin,,${local(at)},`,
    `"A photo post, at the next free time in the queue.",,https://example.com/photo.jpg,queue,`,
    `"A draft to finish later. Quotes ""like this"" and commas, are fine in quotes.",,,,`,
    `"A Facebook post with a first comment.",facebook,,,The link is in the comments.`,
  ].join("\r\n") + "\r\n";
}
