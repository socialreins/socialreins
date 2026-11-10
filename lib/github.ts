export const org = "https://github.com/socialreins";

export const repos = [
  { name: "socialreins", href: `${org}/socialreins`, blurb: "Start here: install and self-host", main: true },
  { name: "brain", href: `${org}/brain`, blurb: "The API server, in Rust", main: false },
] as const;

export type Stars = { total: number; byRepo: Record<string, number> };

// Stars across the org's public repos, archived ones and forks left out, in one request to the
// public GitHub API; null when it can't be read (rate limit, outage).
// shortcut: reads the first 100 repos only, page through `Link` if the org ever has more.
export async function fetchStars(): Promise<Stars | null> {
  try {
    const res = await fetch("https://api.github.com/orgs/socialreins/repos?type=public&per_page=100", {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const list = (await res.json()) as { name?: unknown; stargazers_count?: unknown; archived?: unknown; fork?: unknown }[];
    if (!Array.isArray(list)) return null;
    const byRepo: Record<string, number> = {};
    let total = 0;
    for (const r of list) {
      if (r.archived || r.fork) continue;
      if (typeof r.name !== "string" || typeof r.stargazers_count !== "number") return null;
      byRepo[r.name] = r.stargazers_count;
      total += r.stargazers_count;
    }
    return { total, byRepo };
  } catch {
    return null;
  }
}

export const formatStars = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
