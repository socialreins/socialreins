// Team addresses: every page about a team lives at /t/<team>/<page>, where <team> is the team's own
// address (its slug) when it has one, else its permanent 6-character code from brain. Both lead to the
// team. This file is the one place that builds and reads them.

// First path segments of the pages that belong to a team. Profile, security, /admin and the
// sign-in pages are about the person, so they stay outside /t/.
export const TEAM_PAGES = ["home", "posts", "calendar", "queue", "lists", "library", "feeds", "analytics", "inbox", "contacts", "automations", "connections", "sets", "team", "api-tokens", "billing"];

// Stands for "my current team" where the code is not known (old addresses, links in emails,
// after sign-in). The app shell swaps it for the real code.
export const MY_TEAM = "_";

type Addressed = { code: string; slug?: string | null };
// The team's part of every address built: the slug when it has one, else the code.
export const teamSegment = (team: Addressed) => team.slug ?? team.code;
// Whether a team segment read from an address names this team: its slug or its code.
export const isTeamSegment = (team: Addressed, part: string) => part === team.code || (!!team.slug && part === team.slug);

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
// A team's bare address (/t/k7q2mf) goes to its home.
export const legacyRedirects = () => [
  ...TEAM_PAGES.flatMap((p) => [
    { source: `/${p}`, destination: `/t/${MY_TEAM}/${p}`, permanent: false },
    { source: `/${p}/:path*`, destination: `/t/${MY_TEAM}/${p}/:path*`, permanent: false },
  ]),
  { source: "/t/:team", destination: "/t/:team/home", permanent: false },
];
