import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { EmailLinkForm } from "@/components/email-link-form";

export const metadata: Metadata = { title: "Sign up with email", robots: { index: false } };

export default function SignupEmail() {
  return (
    <AuthPage title="Sign up with Email" terms>
      <EmailLinkForm mode="signup" />
    </AuthPage>
  );
}
