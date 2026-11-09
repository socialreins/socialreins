import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { EmailLinkForm } from "@/components/email-link-form";

export const metadata: Metadata = { title: "Log in with email" };

export default function LoginEmail() {
  return (
    <AuthPage title="Login with Email">
      <EmailLinkForm mode="login" />
    </AuthPage>
  );
}
