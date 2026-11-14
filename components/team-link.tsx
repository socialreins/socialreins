"use client";

import { createContext, useContext, type ComponentProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MY_TEAM, splitTeamPath, teamPath } from "@/lib/team-path";

// The code of the team on screen, set by the app shell. Outside the shell, links lead to "my current team".
export const TeamCode = createContext(MY_TEAM);

// Turns an app path ("/posts/new") into its address in the team on screen.
export function useTeamPath() {
  const code = useContext(TeamCode);
  return (path: string) => teamPath(code, path);
}

// A Link to a page of the team on screen. Every link inside the app uses this, never a bare /posts.
export function TeamLink({ href, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  return <Link href={useTeamPath()(href)} {...rest} />;
}

// useRouter whose push and replace take app paths ("/posts") and go to them in the team on screen.
export function useTeamRouter() {
  const router = useRouter();
  const to = useTeamPath();
  const push: typeof router.push = (path, options) => router.push(to(path), options);
  const replace: typeof router.replace = (path, options) => router.replace(to(path), options);
  return { ...router, push, replace };
}

// The page inside the team ("/posts/12" at /t/k7q2mf/posts/12), for marking the current nav item. Needs a Suspense boundary, like usePathname.
export const usePagePath = () => splitTeamPath(usePathname())[1];
