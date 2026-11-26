"use client";

import { ErrorView } from "@/components/error-view";

// Inside the app shell (app/(app)/layout.tsx stays mounted), so the sidebar and team switcher remain.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} home="/home" />;
}
