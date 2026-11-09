import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { LoginForm, LoginFormWithError } from "@/components/login-form";

export const metadata: Metadata = { title: "Sign up for SocialReins", robots: { index: false } };

export default function Signup() {
  return (
    <AuthPage title="Create your account" terms>
      <Suspense fallback={<LoginForm mode="signup" linkError={null} />}>
        <LoginFormWithError mode="signup" />
      </Suspense>
    </AuthPage>
  );
}
