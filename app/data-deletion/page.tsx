import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Data Deletion: SocialReins" };

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export default function DataDeletion() {
  return (
    <LegalPage title="Data Deletion">
      <p>
        You can remove what SocialReins stores about you at any time. This covers the hosted service at socialreins.com.
      </p>

      <h2>Remove a connected account</h2>
      <ol>
        <li>Sign in and open Accounts.</li>
        <li>Choose Disconnect on the account. Its stored token or app password is deleted at once.</li>
      </ol>
      <p>
        For Facebook, Instagram or Threads you can also remove SocialReins in your Facebook or Instagram settings under
        Apps and websites. That stops SocialReins from using the account; disconnect it here as well to delete the stored
        token.
      </p>

      <h2>Delete your whole account</h2>
      <p>
        <ContactLink /> from the email address on your account and ask for it to be deleted. We delete your account and the
        data tied to it, including your connected accounts and posts, and confirm by email when it is done.
      </p>

      <p>
        See the <Link href="/privacy" className={link}>Privacy Policy</Link> for what we store and why.
      </p>
    </LegalPage>
  );
}
