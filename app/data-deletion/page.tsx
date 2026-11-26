import type { Metadata } from "next";
import { publicPage } from "@/lib/seo";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Data Deletion: SocialReins", ...publicPage("/data-deletion") };

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export default function DataDeletion() {
  return (
    <LegalPage title="Data Deletion" updated="26 November 2026">
      <p>
        You can remove what SocialReins stores about you at any time. This covers the hosted service at socialreins.com.
      </p>

      <h2>Remove a connected account</h2>
      <ul>
        <li>Sign in and open Accounts.</li>
        <li>Choose Disconnect on the account, then Yes, disconnect. Its stored token or app password is deleted at once.</li>
        <li>Only team owners and admins can disconnect. Other members can ask one of them, or <ContactLink />.</li>
      </ul>
      <p>
        For Facebook, Instagram or Threads you can also remove SocialReins in your Facebook or Instagram settings under
        Apps and websites. That stops SocialReins from using the account; disconnect it here as well to delete the stored
        token.
      </p>

      <h2>Delete your whole account</h2>
      <ul>
        <li>Sign in, open Profile and find Your data.</li>
        <li>Choose Delete my account. You must have signed in within the last 10 minutes, so sign in again if it asks.</li>
        <li>Type your email address to confirm, then choose Delete my account. It happens at once and cannot be undone, and we email you to confirm.</li>
      </ul>
      <p>
        This deletes your account, passkeys and sessions, and every team only you belong to, with its connected accounts,
        posts, inbox, contacts and settings, and cancels that team&apos;s paid plan. A team with other members stays: if you
        are its only owner, make someone else an owner or delete the team first. Posts already published on social networks
        stay there; remove them on the network. Copies in our encrypted backups expire within 30 days after that.
      </p>
      <p>
        If you cannot sign in, <ContactLink /> from the email address on your account and ask for it to be deleted. We answer
        within 30 days and confirm by email when it is done. To get a copy of your data first, use Download my data in the
        same place, or ask us the same way.
      </p>
      <p>
        A team owner can also delete a team on the Team page, after signing in again. That removes the team and its
        members, invitations, sets, connected accounts, posts, inbox, contacts and API tokens, but not your account. It does
        not cancel a paid plan, so cancel that on the Billing page first. Stripe keeps its own payment records under its own rules.
      </p>

      <p>
        See the <Link href="/privacy" className={link}>Privacy Policy</Link> for what we store and why.
      </p>
    </LegalPage>
  );
}
