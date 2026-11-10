import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { LoginForm, LoginFormWithError } from "@/components/login-form";

export const metadata: Metadata = { title: "Log in to SocialReins", robots: { index: false } };

export default function Login() {
  return (
    <AuthPage title="Log in">
      {/* ?error= is only known in the browser, so the prerendered HTML carries the same form without it. */}
      <Suspense fallback={<LoginForm mode="login" linkError={null} />}>
        <LoginFormWithError mode="login" />
      </Suspense>
    </AuthPage>
  );
}
