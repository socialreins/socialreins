// Team addresses a team gave up (/t/<old>/...) lead to the team's address now. brain keeps them for 400 days
// (GET /v1/public/team-slugs/<slug>); proxy.ts asks it and redirects. Server only.

type Entry = { address: string | null; until: number };
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<string | null>>();
const MAX_ENTRIES = 500;
// Kept briefly, so a team that takes an old address back (and so turns the redirect around) is not chased for long.
const HIT_MS = 15_000;
const MISS_MS = 15_000;
// brain slow or down: no redirect, and the failure is remembered a few seconds so every /t/ request does not wait on it.
const FAIL_MS = 5_000;
const ASK_MS = 2_000;

function remember(key: string, address: string | null, until: number) {
  cache.delete(key);
  // The oldest entry goes first, so a flood of made up addresses cannot push out the redirects in use for long.
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { address, until });
}

async function ask(key: string, brain: string, get: typeof fetch, now: number): Promise<string | null> {
  try {
    const res = await get(`${brain}/v1/public/team-slugs/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(ASK_MS), cache: "no-store" });
    if (res.status !== 200 && res.status !== 404) throw new Error(`brain answered ${res.status}`);
    const body = res.status === 200 ? await res.json() : null;
    const address = typeof body?.address === "string" && /^[a-z0-9-]{3,32}$/.test(body.address) && body.address !== key ? body.address : null;
    remember(key, address, now + (address ? HIT_MS : MISS_MS));
    return address;
  } catch {
    remember(key, null, now + FAIL_MS);
    return null;
  }
}

// The address `team` (as read from /t/<team>) leads to now, or null when it is not a given-up address.
export async function retiredAddress(team: string, brain: string, get: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  const key = team.toLowerCase();
  // Not a possible address ("_" stands for "my current team"): nothing to ask.
  if (!/^[a-z0-9-]{3,32}$/.test(key)) return null;
  const seen = cache.get(key);
  if (seen && seen.until > now) return seen.address;
  // One question at a time per address, however many requests wait on it.
  const asking = pending.get(key) ?? ask(key, brain, get, now).finally(() => pending.delete(key));
  pending.set(key, asking);
  return asking;
}

// "/t/old/posts/3" with the address "new" gives "/t/new/posts/3"; the query and the hash stay with the caller.
export const retiredRedirect = (pathname: string, address: string) => pathname.replace(/^\/t\/[^/]+/, `/t/${address}`);

export const forgetRetired = () => {
  cache.clear();
  pending.clear();
};
