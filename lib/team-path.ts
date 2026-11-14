// Team addresses: every page about a team lives at /t/<code>/<page>, where <code> is the team's
// permanent 6-character code from brain. This file is the one place that builds and reads them.

// First path segments of the pages that belong to a team. Profile, security, /admin and the
// sign-in pages are about the person, so they stay outside /t/.
export const TEAM_PAGES = ["home", "posts", "calendar", "lists", "inbox", "automations", "connections", "sets", "team", "api-tokens", "billing"];

// Stands for "my current team" where the code is not known (old addresses, links in emails,
// after sign-in). The app shell swaps it for the real code.
export const MY_TEAM = "_";

const segment = (path: string) => path.split(/[/?#]/)[1] ?? "";

// `path` ("/posts/new?x=1") inside team `code`. A path that is not a team page comes back as it is.
export const teamPath = (code: string, path: string) => (TEAM_PAGES.includes(segment(path)) ? `/t/${code}${path}` : path);

// The team code of an address and the page inside it: "/t/k7q2mf/posts/1" gives ["k7q2mf", "/posts/1"],
// and an address outside /t/ gives [null, the address].
export function splitTeamPath(pathname: string): [string | null, string] {
  const m = /^\/t\/([^/]+)(\/.*)?$/.exec(pathname);
  return m ? [m[1].toLowerCase(), m[2] ?? "/home"] : [null, pathname];
}

// Old addresses (/home, /posts/12) for next.config.ts: each goes to the current team's address.
// Next keeps the query string on a redirect.
export const legacyRedirects = () =>
  TEAM_PAGES.flatMap((p) => [
    { source: `/${p}`, destination: `/t/${MY_TEAM}/${p}`, permanent: false },
    { source: `/${p}/:path*`, destination: `/t/${MY_TEAM}/${p}/:path*`, permanent: false },
  ]);
