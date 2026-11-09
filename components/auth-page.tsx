import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";

const legalLink = "underline underline-offset-2 hover:text-signal-deep";

export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-balance">{title}</h1>
      {children}
      <p className="text-sm text-ink-soft">
        By continuing you agree to the{" "}
        <Link href="/terms" className={legalLink}>
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className={legalLink}>
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
