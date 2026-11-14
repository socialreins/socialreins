"use client";

import { createContext, useContext, type ComponentProps } from "react";
import Link from "next/link";
import { MY_TEAM, teamPath } from "@/lib/team-path";

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
