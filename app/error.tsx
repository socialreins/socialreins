"use client";

import { ErrorView } from "@/components/error-view";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4">
      <ErrorView error={error} retry={retry} home="/" />
    </main>
  );
}
