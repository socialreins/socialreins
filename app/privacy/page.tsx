import type { Metadata } from "next";
import { publicPage } from "@/lib/seo";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/components/legal-page";
import { CookieSettings } from "@/components/cookie-settings";

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

export const metadata: Metadata = { title: "Privacy Policy: SocialReins", ...publicPage("/privacy") };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="26 November 2026">
      <p>
        SocialReins is an open-source social media manager. The hosted service at socialreins.com is operated by Binary Labs
        LLC, a company in Wyoming, United States, and built and supported by Bytech, a company in Bangladesh, which controls
        the data on the service. This page explains what the service stores about you, why, and how to have it deleted. In this policy, &quot;we&quot; means Binary Labs LLC and Bytech together. If you have a question, <ContactLink />.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your account: your email address and name.</li>
        <li>
          If you sign in with Google: your Google account id, email address, name and profile picture link, the basics Google
          shares for sign-in.
        </li>
        <li>Sign-in data: your sessions, passkeys (their public keys, never your fingerprint or face) and short-lived email sign-in links.</li>
        <li>Your teams: their names, members, roles and invitations.</li>
        <li>
          Connected social accounts: each account&apos;s handle, display name, avatar link, and the tokens or app passwords
          that let SocialReins post for you. Tokens and app passwords are encrypted before they are stored and are never
          shown back to anyone.
        </li>
        <li>
          Your posts: their text, the links to their images, when they are scheduled, and where they were published. Files
          you upload from your device for a post (images, video, PDFs) are kept for as long as described under Keeping and
          deleting data.
        </li>
        <li>
          Your inbox, if you use it: the comments, replies and direct messages your connected accounts receive, with the
          sender&apos;s name and handle as the network gives them, and the contacts, automations, broadcasts and newsletter
          subscribers your team sets up.
        </li>
        <li>
          Billing: your team&apos;s plan, its status and renewal dates, its Stripe customer and subscription ids, and its
          credit balance. Card details stay with Stripe; we never see or store your full card number.
        </li>
        <li>Basic security records, such as counts of recent attempts used for rate limits.</li>
        <li>
          Site visits, only if you accept analytics cookies: our public pages (not the app, not public post pages) then
          use Google Analytics, which tells us which pages are visited and from where. It never sees your posts,
          accounts or anything you do once signed in. See Cookies below.
        </li>
      </ul>

      <h2>Why we store it</h2>
      <p>
        Only to run SocialReins for you: to sign you in, keep your account secure, let your team work together, and
        publish, schedule and take down your posts on the accounts you connect. We do not sell your data, share it with
        advertisers, or use it for ads.
      </p>

      <h2 id="cookies">Cookies</h2>
      <ul>
        <li>
          To run the site: a cookie that keeps you signed in, and small settings your browser keeps, such as the theme and
          which menu groups are open. These are needed for SocialReins to work, so we do not ask first.
        </li>
        <li>
          Your choice: if our public pages offer analytics cookies, we remember whether you pressed Accept or Reject in a
          cookie called sr_consent for 6 months, then ask again.
        </li>
        <li>
          Google Analytics: loaded only on our public pages (not the app, not public post pages, not pages with a link
          token in the address) and only after you press Accept. Before that, and after Reject, nothing is loaded from
          Google. We turn off Google&apos;s advertising features and send page addresses without anything after the question mark.
          If you reject after accepting, we clear its cookies.
        </li>
        <li>
          The sign-in and contact forms may load a check from Cloudflare (Turnstile) that tells people from bots. Cloudflare
          receives your IP address and browser details for that.
        </li>
      </ul>
      <p>
        You can change your choice at any time: <CookieSettings className={link} />
      </p>

      <h2>AI replies and AI steps</h2>
      <p>
        SocialReins sends nothing to an AI provider unless a team has set up an automation with an AI step: an AI
        reply by direct message, an AI public reply, or an AI check of whether a message asks a question. For a
        reply we send the provider the instructions the team wrote for it, the text of the incoming comment or message
        (its first 1,000 characters), the sender&apos;s name (the first 64 characters) and the name of the network. For the
        question check we send only the message text (its first 1,000 characters). We do not send your posts, your other
        messages, your contacts or your sign-in details.
      </p>
      <p>
        By default the provider is Anthropic, using our account. A team can instead add its own API key for Anthropic or
        OpenAI (bring your own key). The key is stored encrypted, and only its last 4 characters are ever shown back. With a team&apos;s own key, the text is
        sent to the team&apos;s own account with that provider, under the agreement between the team and the provider. Each
        provider handles what it receives under its own terms and privacy policy, which we do not control.
      </p>

      <h2>Google user data</h2>
      <p>
        When you choose &quot;Continue with Google&quot;, SocialReins asks Google only for the openid, email and profile
        scopes. We use that data solely to sign you in and to create or find your account. We do not read your Gmail,
        contacts, files or anything else in your Google account.
      </p>
      <p>
        SocialReins&apos; use and transfer of information received from Google APIs to any other app will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We do not transfer Google user data to others except as needed to run
        the service, to comply with the law, or with your consent, and no person reads it unless you ask us to for
        support or the law requires it.
      </p>

      <h2>Who helps us run it</h2>
      <p>The hosted service uses these providers (sub-processors), each only to run SocialReins:</p>
      <ul>
        <li>Railway hosts the servers and the database.</li>
        <li>
          Cloudflare provides our domain names and the Turnstile check on the sign-in and contact forms, and holds
          temporary copies of post images and video and the encrypted database backups in its R2 storage. Only the www
          address goes through Cloudflare (it redirects to socialreins.com); visits to socialreins.com and to our API go
          straight to Railway.
        </li>
        <li>Resend sends our emails: sign-in links, invitations, notices, and the newsletters your team sends.</li>
        <li>Stripe takes payments for plans and credits.</li>
        <li>Google Analytics counts visits to our public pages, only if you accept (see Cookies).</li>
        <li>Anthropic, and OpenAI if a team adds its own key, write and judge AI replies (see AI replies and AI steps).</li>
        <li>
          The networks you connect. When you publish, or when SocialReins reads your inbox, it talks to the network&apos;s own
          service (such as Bluesky, Facebook, Instagram, Threads, LinkedIn, X, TikTok, YouTube or Pinterest) under that
          network&apos;s own terms. Your browser also loads some images, such as avatars, straight from those services.
        </li>
        <li>
          Addresses your team gives us: when SocialReins downloads an image or feed, or sends a webhook, from or to a link
          your team provided, the site behind that link sees our server&apos;s address.
        </li>
      </ul>

      <h2>Keeping and deleting data</h2>
      <ul>
        <li>We keep your account data for as long as your account exists.</li>
        <li>Email sign-in links expire after 15 minutes and sessions end when you sign out or they expire.</li>
        <li>Disconnecting a social account deletes its stored token or app password at once.</li>
        <li>A deleted set can be restored for 30 days, then it is purged for good.</li>
        <li>
          Images and video that SocialReins downloads from a link for a post are deleted once the post is done, and any left
          over are removed after 7 days. A file you upload from your device is kept for a day, then for as long as a post
          that uses it can still publish (not published yet, or with a failed target to retry), and is then deleted.
        </li>
        <li>
          If your team uses the API with an API token and an Idempotency-Key, we keep that key and our answer for 30 days.
        </li>
        <li>
          Records of webhook deliveries to your team&apos;s own address are deleted once they are over 30 days old and were delivered or given up on.
        </li>
        <li>
          Notes on why an automation did not run on a message are kept for 14 days, and at most 100 of each kind per
          automation.
        </li>
        <li>
          Backups: every 6 hours we save an encrypted copy of the database to Cloudflare R2. We keep every copy for 2
          days, then one a day until 14 days, then one a week until 30 days, and delete the rest. Data you delete stays in
          these copies until they expire, so up to 30 days. We use backups only to restore the service.
        </li>
      </ul>

      <h2>Your data: deleting and getting a copy</h2>
      <ul>
        <li>
          You can download a copy of your data yourself: sign in, open Profile, then Your data, then Download my data. It is
          one JSON file with your profile and, for each team you belong to, what your role in it may read. For a team owner or
          admin that is the team&apos;s posts, connected accounts (never their tokens), contacts and inbox messages. It never
          holds passwords, tokens or other members&apos; details, and it says what it leaves out. You can download one copy an
          hour.
        </li>
        <li>
          You can delete your account yourself: sign in, open Profile, then Your data, then Delete my account. You must have
          signed in within the last 10 minutes and type your email address. It happens at once and cannot be undone. It deletes
          your account, passkeys and sessions, and every team only you belong to, with its invitations, sets, connected
          accounts, posts, inbox, contacts and API tokens, and cancels that team&apos;s paid plan. A team with other members
          stays: if you are its only owner, make someone else an owner or delete the team first. Posts already published on
          social networks stay there. We email you to confirm. Copies in our encrypted backups are removed within 30 days, and
          Stripe keeps its own payment records. We keep a hash of your email address so a free trial cannot be used twice, and a
          count of deleted accounts that holds no personal data.
        </li>
        <li>
          A team owner can delete a team on the Team page. That removes the team with its members, invitations, sets, connected
          accounts, posts, inbox, contacts and API tokens. It asks you to sign in again first, you cannot delete the last team
          you have, and it does not cancel a paid plan, so cancel that on the Billing page first.
        </li>
        <li>
          You can still ask by email: <ContactLink /> using the email address on your account to have your data deleted or to get
          a copy, for example if you cannot sign in or want something the download leaves out. We answer within 30 days and
          confirm when it is done. Step by step instructions are on the{" "}
          <Link href="/data-deletion" className={link}>
            Data Deletion
          </Link>{" "}
          page.
        </li>
      </ul>

      <h2>Self-hosted SocialReins</h2>
      <p>
        SocialReins is open source, so anyone can run their own copy. A self-hosted instance is controlled by its
        operator, not by Binary Labs LLC or Bytech, and this policy does not cover it. Ask that operator how they handle your data.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, we update the date at the top of this page. See also our <Link href="/terms" className="font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
