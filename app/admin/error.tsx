"use client";

import { ErrorView } from "@/components/error-view";

// Inside the admin shell (app/admin/layout.tsx stays mounted).
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} home="/admin" />;
}
