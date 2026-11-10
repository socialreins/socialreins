import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { robots: { index: false } };

// The admin console: the app's shell with admin nav and colours, for site admins only.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AppShell admin>{children}</AppShell>;
}
