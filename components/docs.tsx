import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader, sitePage } from "@/components/site-header";
import { RULES } from "@/lib/broadcasts";
import { publicPage } from "@/lib/seo";

// The docs live in this app for now: one guide per page, written once for both ways of running SocialReins.
// Each guide is a function of the mode, so the self-hosted and cloud versions cannot drift apart.
export type Mode = "self-hosted" | "cloud";
export type Guide = "start" | "use" | "ai" | "apps";

const repo = "https://github.com/socialreins/socialreins";
const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";

const modes: Record<Mode, { name: string; web: string; api: string }> = {
  "self-hosted": { name: "Self-hosted", web: "https://app.example.com", api: "https://api.example.com" },
  cloud: { name: "Cloud", web: "https://socialreins.com", api: "https://brain.socialreins.com" },
};

const titles: Record<Guide, Record<Mode, string>> = {
  start: { "self-hosted": "Install SocialReins on your own server", cloud: "Get started with SocialReins Cloud" },
  use: { "self-hosted": "Connect accounts and publish, self-hosted", cloud: "Connect accounts and publish on SocialReins Cloud" },
  ai: { "self-hosted": "Connect an AI assistant to your own SocialReins", cloud: "Connect an AI assistant to SocialReins Cloud" },
  apps: { "self-hosted": "Create the network apps for your own SocialReins", cloud: "Network apps on SocialReins Cloud" },
};

const descriptions: Record<Guide, Record<Mode, string>> = {
  start: {
    "self-hosted": "Install SocialReins on your own server with Docker Compose: the settings to change, the first sign-in, domains, updates and the platform apps.",
    cloud: "SocialReins Cloud is not open yet. Join the waitlist to hear when it opens, or self-host SocialReins for free today with the same features.",
  },
  use: {
    "self-hosted": "How to use your own SocialReins install: connect accounts, schedule posts, set up the queue, feeds, approvals, the inbox, automations and more.",
    cloud: "How SocialReins Cloud works once you have an account: connect accounts, schedule posts, set up the queue, feeds, approvals, the inbox and more.",
  },
  ai: {
    "self-hosted": "Connect Claude or another AI assistant to your own SocialReins install through its MCP server, using an API token you create in the app.",
    cloud: "Connect Claude or another AI assistant to SocialReins Cloud through its MCP server, using an API token you create in the app.",
  },
  apps: {
    "self-hosted": "Create the developer app for each network, register the redirect address and add the keys to your own SocialReins install.",
    cloud: "On SocialReins Cloud we register the developer apps with each network for you, so you only connect your accounts.",
  },
};

const short: Record<Guide, Record<Mode, string>> = {
  start: { "self-hosted": "Install", cloud: "Get started" },
  use: { "self-hosted": "Connect and publish", cloud: "Connect and publish" },
  ai: { "self-hosted": "AI setup", cloud: "AI setup" },
  apps: { "self-hosted": "Network apps", cloud: "Network apps" },
};

export const guides: Guide[] = ["start", "use", "ai", "apps"];
export const docModes: Mode[] = ["self-hosted", "cloud"];
export const docPath = (mode: Mode, guide: Guide) => `/docs/${mode}${guide === "start" ? "" : `/${guide}`}`;
export const docTitle = (mode: Mode, guide: Guide) => short[guide][mode];

export function docMetadata(mode: Mode, guide: Guide): Metadata {
  return { title: titles[guide][mode], description: descriptions[guide][mode], ...publicPage(docPath(mode, guide)) };
}

function Code({ children }: { children: string }) {
  return (
    <pre className="min-w-0 overflow-x-auto rounded-xl bg-ink p-4 font-mono text-sm leading-relaxed text-paper">
      <code>{children}</code>
    </pre>
  );
}

const C = ({ children }: { children: ReactNode }) => <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-[0.9em] [overflow-wrap:anywhere]">{children}</code>;

export function CloudNotice() {
  return (
    <p className="rounded-2xl border-2 border-signal-deep bg-paper p-4">
      <strong>SocialReins Cloud is not open yet.</strong> You cannot sign up for it today.{" "}
      <Link href="/#waitlist" className={link}>
        Join the waitlist
      </Link>{" "}
      and we email you when it opens. To use SocialReins now,{" "}
      <Link href="/docs/self-hosted" className={link}>
        install it on your own server
      </Link>
      .
    </p>
  );
}

function Start({ mode }: { mode: Mode }) {
  if (mode === "cloud")
    return (
      <>
        <p>On SocialReins Cloud we run the servers and register the apps with each network, so there is nothing to install: you sign in and connect your accounts.</p>
        <h2>When it opens</h2>
        <ol>
          <li>You get an email from the waitlist with a link to create your account.</li>
          <li>You sign in with a link sent to your email. There is no password, and you can add a passkey afterwards.</li>
          <li>
            You connect your social accounts and publish. See <Link href="/docs/cloud/use" className={link}>Connect and publish</Link>.
          </li>
        </ol>
        <h2>What it will cost</h2>
        <p>
          The price is not set yet. It will be a paid subscription, and we publish the price on the <Link href="/pricing" className={link}>pricing page</Link> before anyone is charged.
        </p>
      </>
    );
  return (
    <>
      <p>
        SocialReins runs as three containers: Postgres, brain (the API) and web. You need a machine with Docker and Docker Compose. The images are built for <C>linux/amd64</C> and <C>linux/arm64</C>.
      </p>
      <h2>1. Get the files</h2>
      <Code>{`git clone --recurse-submodules ${repo}\ncd socialreins && cp .env.example .env`}</Code>
      <h2>2. Edit .env</h2>
      <ul>
        <li>
          <C>POSTGRES_PASSWORD</C>: a long random value, for example from <C>openssl rand -hex 24</C>.
        </li>
        <li>
          <C>ENCRYPTION_KEY</C>: from <C>openssl rand -base64 32</C>. It encrypts the tokens of your connected accounts, so back it up together with the database.
        </li>
        <li>
          <C>WEB_URL</C> and <C>BRAIN_URL</C>: where people will reach the app and the API. The defaults, <C>http://localhost:3000</C> and <C>http://localhost:8080</C>, work on your own machine.
        </li>
        <li>
          For a personal install, set <C>REGISTRATION_DISABLED=true</C> and <C>OWNER_EMAIL</C> to your email, so only you and the people you invite can sign up. Without <C>OWNER_EMAIL</C>, whoever signs up first owns the install.
        </li>
      </ul>
      <h2>3. Start it</h2>
      <Code>docker compose up -d</Code>
      <p>brain creates its database and brings it up to date each time it starts.</p>
      <h2>4. Sign in</h2>
      <p>
        Open your <C>WEB_URL</C>, choose Sign in and enter your email. A new <C>.env</C> has <C>MAIL_LOG=true</C>, so the sign-in link is written to the log and not sent:
      </p>
      <Code>docker compose logs brain | grep auth/magic</Code>
      <p>
        Open that link and you land in the app with your own team. To send real email, set <C>RESEND_API_KEY</C> or <C>SMTP_URL</C>, plus <C>MAIL_FROM</C>, remove <C>MAIL_LOG=true</C>, then run <C>docker compose up -d</C> again.
      </p>
      <h2>Put it on a domain</h2>
      <p>
        The ports listen on <C>127.0.0.1</C> only. For a public install, put a reverse proxy with TLS in front (Caddy, nginx or Traefik) and give the app and the API one hostname each:
      </p>
      <Code>{`app.example.com {\n\treverse_proxy 127.0.0.1:3000\n}\napi.example.com {\n\treverse_proxy 127.0.0.1:8080\n}`}</Code>
      <p>
        Then set <C>WEB_URL=https://app.example.com</C> and <C>BRAIN_URL=https://api.example.com</C>. Both hostnames must be on the same domain (<C>example.com</C> here), or the browser will not keep you signed in. Set <C>TRUST_PROXY=true</C> when brain is reachable only through the proxy.
      </p>
      <h2>Turn on the networks you want</h2>
      <p>
        Bluesky works straight away. Every other network needs your own developer app with that network, and stays off until its values are in <C>.env</C>. Register the redirect address with <C>BRAIN_URL</C> in front:
      </p>
      <div className="min-w-0 overflow-x-auto rounded-lg border border-ink/10 bg-paper">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="border-b border-ink/10 p-3">Network</th>
              <th scope="col" className="border-b border-ink/10 p-3">Values in .env</th>
              <th scope="col" className="border-b border-ink/10 p-3">Redirect address</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Facebook and Instagram", "META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN", "/connect/meta/callback"],
              ["Threads", "THREADS_APP_ID, THREADS_APP_SECRET", "/connect/threads/callback"],
              ["LinkedIn", "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET", "/connect/linkedin/callback"],
              ["X", "X_CLIENT_ID, X_CLIENT_SECRET", "/connect/x/callback"],
              ["TikTok", "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET", "/connect/tiktok/callback"],
              ["YouTube", "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET", "/connect/youtube/callback"],
            ].map(([network, values, path]) => (
              <tr key={network}>
                <th scope="row" className="border-b border-ink/10 p-3 align-top">{network}</th>
                <td className="border-b border-ink/10 p-3 align-top font-mono text-xs">{values}</td>
                <td className="border-b border-ink/10 p-3 align-top font-mono text-xs">{path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Meta also needs the webhook address <C>/webhooks/meta</C>. After changing <C>.env</C>, run <C>docker compose up -d</C>. The{" "}
        <Link href="/docs/self-hosted/apps" className={link}>
          Network apps guide
        </Link>{" "}
        walks through creating each app.
      </p>
      <h2>Update or remove</h2>
      <Code>docker compose pull && docker compose up -d</Code>
      <p>
        Updates only move the database forward and are safe to run again. To remove everything, your data included, run <C>docker compose down -v</C>. The{" "}
        <a href={`${repo}#self-host`} target="_blank" rel="noopener noreferrer" className={link}>
          README
        </a>{" "}
        has every setting.
      </p>
    </>
  );
}

// The how-to parts of the Use guide, by the id of their heading. Labels follow the app: components/queue.tsx,
// bulk-upload.tsx, repeat.tsx, feeds.tsx, team.tsx, library.tsx, inbox.tsx, automation-form.tsx, broadcasts.tsx,
// newsletters.tsx and post-analytics.tsx. Change a label there and here together.
const howTos: [string, string][] = [
  ["queue", "Queue"],
  ["csv", "CSV upload"],
  ["recurring", "Recurring posts"],
  ["feeds", "Feeds"],
  ["approvals", "Approvals"],
  ["library", "Library"],
  ["inbox", "Inbox"],
  ["automations", "Automations"],
  ["broadcasts", "Broadcasts"],
  ["newsletters", "Newsletters"],
  ["analytics", "Analytics"],
  ["team-address", "Team address"],
];

// The same keys as `shortcuts` in components/inbox.tsx.
const shortcuts: [string, string][] = [
  ["J", "next item"],
  ["K", "previous item"],
  ["E", "mark done and open the next one"],
  ["R", "write a reply"],
  ["A", "assign to me"],
  ["/", "search this inbox"],
  ["?", "show the shortcuts"],
  ["Ctrl or Cmd + Enter", "send the reply"],
];

function Use({ mode }: { mode: Mode }) {
  const { web } = modes[mode];
  return (
    <>
      <p>
        These steps are the same on both versions. Open the app at <C>{web}</C>
        {mode === "self-hosted" ? ", or wherever your WEB_URL points" : ""}.
      </p>
      <h2>1. Connect your accounts</h2>
      <p>
        Open Accounts and choose Add account, then pick a network. Bluesky asks for your handle and an app password. The others send you to the network to sign in and approve. Facebook and Instagram connect together: you sign in with Facebook, then pick your Pages and the Instagram accounts linked to them.
      </p>
      {mode === "self-hosted" && (
        <p>
          A network that is greyed out has no app set up yet. See <Link href="/docs/self-hosted" className={link}>Turn on the networks you want</Link>.
        </p>
      )}
      <h2>2. Group accounts into sets</h2>
      <p>A set is a group of accounts you post to together, such as one brand or one client. Every team starts with one set that holds every account, named All sets until you rename it. Open Sets to add more and choose which accounts belong to each.</p>
      <h2>3. Write a post</h2>
      <p>
        Open Posts and write a post. Under Post to, pick the networks. Add your text, photos or a video, and a first comment or a thread where the network allows one. With two or more networks ticked, each has its own tab where you can give it a different text and different media. Then publish now or pick a time to schedule it. The <Link href="/post-types" className={link}>post types page</Link> lists what each network accepts.
      </p>
      <h2>4. Check and take down</h2>
      <p>Calendar shows what is scheduled, and you can drag a scheduled post to another day or use its Move to button. Duplicate on a saved post copies it into a new one. A published post shows a result for each account, with the reason when a network refused it. Taking a published post down removes it from its network, and a post sent to several networks has Take down all (TikTok has no delete option for other apps, so delete that one in the TikTok app). It stays in SocialReins, marked as taken down.</p>
      <h2>5. Invite your team</h2>
      <p>Open Team to invite people by email as an admin or a member. Lists group posts into an ordered series.</p>

      <h2 id="how-to">How to</h2>
      <p>Each part below is one page of the app, named as it is in the sidebar.</p>
      <nav aria-label="How to">
        <ul className="!flex !list-none flex-wrap !gap-x-4 !gap-y-1 !pl-0">
          {howTos.map(([id, name]) => (
            <li key={id}>
              <a href={`#${id}`} className={link}>
                {name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <h2 id="queue">Set up the queue</h2>
      <p>A queue is a set&apos;s weekly posting times. A queued post takes the next free one, so you never pick a time by hand.</p>
      <ol>
        <li>Open Queue. It shows the queue of the set picked in the top bar.</li>
        <li>Pick the time zone.</li>
        <li>Under Add time, choose a time and tick its days. Weekdays and Every day tick them for you.</li>
        <li>Choose Save queue. Next free slots then lists the times the coming posts will take.</li>
        <li>On a new post, choose Add to queue in place of a time. The button shows the next slot, and the post takes it.</li>
      </ol>

      <h2 id="csv">Upload posts from a CSV file</h2>
      <p>Open Posts and choose Upload CSV. A file holds up to 200 posts and 1 MB. Its first line names the columns, in any order:</p>
      <ul>
        <li>
          <C>text</C>: required. The post. On YouTube the first line is the title.
        </li>
        <li>
          <C>networks</C>: optional. Network names separated by spaces or commas, such as <C>bluesky linkedin</C>. Empty means every network the set has, leaving out Instagram and YouTube on a row without media.
        </li>
        <li>
          <C>media</C>: optional. Public https links to images or a video, separated by spaces.
        </li>
        <li>
          <C>time</C>: optional. A time in your own time zone written as <C>YYYY-MM-DD HH:MM</C>, or <C>queue</C> for the set&apos;s next free queue time. Empty saves a draft.
        </li>
        <li>
          <C>first_comment</C>: optional. Posted right after the post on Facebook, Instagram, LinkedIn and YouTube.
        </li>
      </ul>
      <Code>{`text,networks,media,time,first_comment\n"Our new guide is out",bluesky linkedin,https://example.com/cover.jpg,queue,"The link is in this comment"`}</Code>
      <p>
        Every row is checked before anything is created, and a row with a problem says what is wrong. The Schedule button then creates the rows that are ready, and the rows with problems download as a CSV with an <C>error</C> column. TikTok is not taken from a file, because every TikTok post needs its own privacy and disclosure choices: post to TikTok from the composer.
      </p>

      <h2 id="recurring">Repeat a post</h2>
      <p>
        When you schedule a post or add it to the queue, the Repeat control beside the time offers Does not repeat, Every day, Every week, Every month and Custom. Choose whether it ends never, after a number of posts or on a date. Each time the post goes out, the next copy is scheduled. A repeating post shows a Repeats badge in Posts. TikTok posts cannot repeat, because TikTok needs a person to confirm each post.
      </p>

      <h2 id="feeds">Post from an RSS or Atom feed</h2>
      <ol>
        <li>Open Feeds and choose Add feed.</li>
        <li>Paste the feed&apos;s link, and pick the set and its networks. TikTok and YouTube are not offered, and an item needs an image to go to Instagram.</li>
        <li>Choose what a new item becomes: Save a draft, Add to the queue or Post right away.</li>
        <li>
          Write the post text. <C>{"{title}"}</C>, <C>{"{link}"}</C> and <C>{"{summary}"}</C> are filled in from each item.
        </li>
      </ol>
      <p>Each feed has an On and Off switch and Check now, and shows when it was last checked and how many posts it made.</p>

      <h2 id="approvals">Approve posts before they go out</h2>
      <p>
        An owner or admin opens Team and, under Approvals, ticks &quot;Members&apos; posts need an owner or admin to approve them before they go out&quot;. From then on a member&apos;s scheduled post shows as Needs approval in Posts and is held. An owner or admin chooses Approve, or Request changes with a note for the author. Posts by owners and admins go out as before.
      </p>

      <h2 id="library">Keep media and text in the library</h2>
      <p>
        Open Library. The Media tab keeps links to images and videos, each with a name. The Snippets tab keeps Captions, Hashtag groups and Saved replies. In the composer, Add from library fills the media of a post and Insert snippet puts a caption or a hashtag group at the cursor.
      </p>

      <h2 id="inbox">Answer comments and DMs in the inbox</h2>
      <p>
        Open Inbox. Comments and DMs arrive in one list, and DMs with one person are grouped into one conversation that opens as a chat. Search the list by text or author, switch between Open and Done, and filter with the Kind and Assigned menus. In the reader you reply, choose Mark done, assign the item to a teammate and insert a saved reply. The inbox is live on Bluesky; Facebook Pages and Instagram are in testing.
      </p>
      <p>Keyboard shortcuts, which wait while you type in a box:</p>
      <ul>
        {shortcuts.map(([key, what]) => (
          <li key={key}>
            <C>{key}</C>: {what}
          </li>
        ))}
      </ul>
      <p>Contacts lists everyone who wrote to your accounts. Open a contact to give it tags and notes.</p>

      <h2 id="automations">Build an automation or a flow</h2>
      <ol>
        <li>Open Automations and choose New automation, then pick a template, such as Comment to DM or Welcome message, or start from scratch.</li>
        <li>Under When, pick the trigger: a comment keyword, a DM keyword, a first message, a new follower (Bluesky), a mention, a story reply or a button tap.</li>
        <li>Under Only if, narrow it to keywords, accounts or posts.</li>
        <li>Under Do this, choose One reply (a DM, a public reply, or both) or A flow of steps. A flow has up to 10 steps: a DM with up to 3 buttons, a public reply, a wait, or Tag the contact.</li>
        <li>Save it and switch it on. Its page lists every run with what was sent and, when something was skipped or refused, the reason.</li>
      </ol>
      <p>Automations are live on Bluesky; Facebook and Instagram are in testing.</p>

      <h2 id="broadcasts">Send a broadcast</h2>
      <ol>
        <li>Tag the contacts you want to reach, on Contacts or with an automation.</li>
        <li>
          Open Broadcasts and choose New broadcast. Give it a name, pick the tag and, if you want, one network, and write the message. <C>{"{name}"}</C> becomes each person&apos;s name.
        </li>
        <li>Choose Save draft. Nothing is sent: the review shows how many people will get it, who will not and why.</li>
        <li>Choose Send, then confirm the number once more. Only owners and admins write, review and send a broadcast and see who got it. Members can see the list of broadcasts.</li>
      </ol>
      <p>The rules of every broadcast:</p>
      <ul>
        {RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <h2 id="newsletters">Send a newsletter</h2>
      <p>A newsletter is one email to the people who signed up on your public post pages. Owners and admins write and send it.</p>
      <ol>
        <li>Open Team and, under Sharing, switch on Public pages and tick &quot;Public pages offer a newsletter sign-up&quot;. People who sign up confirm their email through a link.</li>
        <li>Open Newsletters and fill in Sender details: the sender&apos;s name and postal address, which end every email, and if you like a link to your logo, shown at the top instead of the name.</li>
        <li>Choose New newsletter, write the subject and the body, and choose Save draft. The preview shows the email as it will arrive.</li>
        <li>Send a test to your own email. A newsletter cannot be sent before a test of the saved text.</li>
        <li>Review who it goes to, choose Send, then confirm the number once more.</li>
      </ol>
      <p>Every email ends with an Unsubscribe link. Someone who unsubscribes gets no more newsletters.</p>

      <h2 id="analytics">Read your analytics</h2>
      <p>
        Open Analytics and pick the last 7, 30 or 90 days. It shows the totals, engagement by day, a table by network and your top posts, for the set picked in the top bar. It reads likes and comments on Bluesky, Facebook, Instagram and YouTube, shares on Bluesky and Facebook, and views on YouTube; the other networks say Not available yet. A published post&apos;s own page shows the numbers of each account, with Refresh stats. There are no reach, audience or follower reports yet.
      </p>

      <h2 id="team-address">Give your team its own address</h2>
      <p>
        Every page of a team lives under <C>/t/</C> and a short code. An owner or admin opens Team and, under General, types a Team address of 3 to 30 lower-case letters, digits and hyphens. Links with the old code keep working, and Use the default address goes back to the code.
      </p>
    </>
  );
}

function Ai({ mode }: { mode: Mode }) {
  const { web, api } = modes[mode];
  return (
    <>
      <p>
        SocialReins has a built-in MCP server, so an AI assistant such as Claude can read your accounts and posts and create, schedule and delete posts for you. MCP is the open standard assistants use to call tools.
        {mode === "self-hosted" ? " On your own install it is part of brain, with nothing more to run." : ""}
      </p>
      <h2>1. Create an API token</h2>
      <p>
        In the app at <C>{web}</C>, open API tokens and create one. Choose the whole team or a single set, and tick Read only if the assistant should only look. The token is shown once, so copy it then. Creating a token needs a sign-in from the last 10 minutes.
      </p>
      <h2>2. Add the server to your assistant</h2>
      <p>
        The server address is <C>{api}/mcp</C>
        {mode === "self-hosted" ? ", with your own BRAIN_URL in place of api.example.com" : ""}. It speaks streamable HTTP and takes the token as a bearer token. In Claude Code:
      </p>
      <Code>{`claude mcp add --transport http socialreins ${api}/mcp \\\n  --header "Authorization: Bearer YOUR_TOKEN"`}</Code>
      <p>In an assistant that reads a JSON settings file:</p>
      <Code>{`{\n  "mcpServers": {\n    "socialreins": {\n      "type": "http",\n      "url": "${api}/mcp",\n      "headers": { "Authorization": "Bearer YOUR_TOKEN" }\n    }\n  }\n}`}</Code>
      <h2>3. Ask it to do something</h2>
      <p>Try &quot;list my connected accounts&quot; or &quot;schedule this post to my English set for tomorrow at 9&quot;. The assistant gets these tools:</p>
      <ul>
        <li>
          Accounts and sets: <C>list-social-accounts</C>, <C>list-social-sets</C>.
        </li>
        <li>
          Posts: <C>list-posts</C>, <C>get-post</C>, <C>create-post</C>, <C>create-post-group</C> (one post to several networks), <C>update-post</C>, <C>delete-post</C>.
        </li>
        <li>
          Lists: <C>list-lists</C>, <C>get-list</C>, <C>create-list</C>, <C>add-post-to-list</C>, <C>remove-post-from-list</C>, <C>reorder-list</C>.
        </li>
      </ul>
      <p>
        A read-only token can call the list and get tools only. It may also send <C>validate_only</C> with a create tool, which checks a post against the rules of each network without creating it.
      </p>
      <h2>Use the API directly</h2>
      <p>The same token works with the REST API, for scripts and other tools:</p>
      <Code>{`curl -H "Authorization: Bearer YOUR_TOKEN" ${api}/v1/posts`}</Code>
      <p>
        Every route is listed in the{" "}
        <a href="https://github.com/socialreins/brain#endpoints" target="_blank" rel="noopener noreferrer" className={link}>
          brain README
        </a>
        .
      </p>
    </>
  );
}

// One entry per network that needs your own developer app. Scopes and redirect paths come from brain's connectors.
const networkApps: { name: string; where: string; url: string; steps: ReactNode[]; scopes: string; env: string[]; redirect: string[]; note?: ReactNode }[] = [
  {
    name: "Facebook and Instagram",
    where: "Meta for Developers",
    url: "https://developers.facebook.com/apps",
    steps: [
      "Create an app of the Business type and add the Facebook Login product.",
      "Under Facebook Login settings, add the redirect address below as a valid OAuth redirect URI.",
      "Add the Webhooks product. Set the callback URL to the webhook address below and the verify token to any long random string; put the same string in META_WEBHOOK_VERIFY_TOKEN. brain subscribes each connected Page to the feed and messages fields.",
      "Copy the App ID and App secret from Settings, Basic.",
    ],
    scopes: "pages_show_list, pages_read_engagement, pages_manage_posts, business_management, instagram_basic, instagram_content_publish, instagram_manage_contents, pages_manage_metadata, pages_messaging, pages_manage_engagement, pages_read_user_content, instagram_manage_comments, instagram_manage_messages",
    env: ["META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"],
    redirect: ["/connect/meta/callback", "/webhooks/meta (webhook)"],
    note: "Until Meta approves these permissions through App Review, only people with a role on the app (admin, developer or tester) can connect. Instagram accounts must be professional accounts linked to a Facebook Page.",
  },
  {
    name: "Threads",
    where: "Meta for Developers",
    url: "https://developers.facebook.com/apps",
    steps: [
      "Create a second app and add the Threads API use case. Threads has its own app ID and secret, separate from the Meta app above.",
      "In the Threads settings, add the redirect address below. Add your Threads account as a Threads tester and accept the invite in Threads while the app is in development.",
      "Copy the Threads app ID and Threads app secret from the Threads settings, not from Settings, Basic.",
    ],
    scopes: "threads_basic, threads_content_publish, threads_manage_replies, threads_delete",
    env: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
    redirect: ["/connect/threads/callback"],
  },
  {
    name: "LinkedIn",
    where: "LinkedIn Developers",
    url: "https://www.linkedin.com/developers/apps",
    steps: [
      "Create an app. LinkedIn asks for a Company Page to attach it to.",
      "On the Products tab, request Share on LinkedIn and Sign In with LinkedIn using OpenID Connect.",
      "On the Auth tab, add the redirect address below and copy the Client ID and Primary Client Secret.",
    ],
    scopes: "openid, profile, email, w_member_social",
    env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    redirect: ["/connect/linkedin/callback"],
    note: "This connects a personal profile. LinkedIn tokens last about 60 days and only approved partner apps get a refresh token, so you reconnect when SocialReins shows the account as expiring.",
  },
  {
    name: "X",
    where: "the X developer console",
    url: "https://developer.x.com",
    steps: [
      "Create an app (X may ask you to create a project first), then open its User authentication settings.",
      "Choose OAuth 2.0, the type Web App, Automated App or Bot (a confidential client), and permissions Read and write.",
      "Add the redirect address below as the callback URI and any address you own as the website URL.",
      "Copy the OAuth 2.0 Client ID and Client Secret. These are not the API key and secret.",
    ],
    scopes: "tweet.read, tweet.write, users.read, offline.access, media.write",
    env: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    redirect: ["/connect/x/callback"],
    note: "X charges for API use under its own plans. SocialReins reads the account's plan to set the post length limit, and you can set it yourself on the account.",
  },
  {
    name: "TikTok",
    where: "TikTok for Developers",
    url: "https://developers.tiktok.com/apps",
    steps: [
      "Create an app of the Web type and add the Login Kit and Content Posting API products. Turn on Direct Post in the Content Posting API settings.",
      "Add the redirect address below under Login Kit. TikTok wants the exact address, with no wildcards.",
      "TikTok pulls your media from a link, so verify the domain or URL prefix that serves it (your brain address, or your media storage) under the app's URL properties.",
      "Add your own TikTok account as a target user while the app is in the sandbox.",
      "Copy the Client key and Client secret.",
    ],
    scopes: "user.info.basic, video.upload, video.publish",
    env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    redirect: ["/connect/tiktok/callback"],
    note: "Until TikTok approves your app, an unaudited app can only post privately. Submit the app for review and the audit when it is ready.",
  },
  {
    name: "YouTube",
    where: "the Google Cloud console",
    url: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "Create a project and enable the YouTube Data API v3.",
      "Set up the OAuth consent screen and add the three scopes below. Add your own Google account as a test user.",
      "Create an OAuth client ID of the type Web application and add the redirect address below. If you also want Google sign-in, add the second address too: the same client works for both.",
      "Copy the Client ID and Client secret.",
    ],
    scopes: "youtube.upload, youtube.readonly, youtube.force-ssl",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    redirect: ["/connect/youtube/callback", "/auth/google/callback (Google sign-in)"],
    note: "While the consent screen is in Testing, only your listed test users can connect and Google ends their access after 7 days. Publish the app, and finish Google's verification for these scopes, to lift that.",
  },
];

function Apps({ mode }: { mode: Mode }) {
  if (mode === "cloud")
    return (
      <>
        <p>
          On SocialReins Cloud we register and keep the developer apps with each network, and we handle their reviews. You do not create any app or key. When Cloud opens, you connect an account from the Accounts page and approve the permissions the network asks for.
        </p>
        <p>
          If you run your own install, the <Link href="/docs/self-hosted/apps" className={link}>self-hosted version of this guide</Link> shows how to create each app.
        </p>
      </>
    );
  return (
    <>
      <p>
        Bluesky needs no app: you connect it with an app password. Every other network needs a developer app that you create with that network. Each one below follows the same steps: create the app, register the redirect address, copy the keys into <C>.env</C>, then run <C>docker compose up -d</C>. A network stays off, shown as not configured, until both of its values are set. For YouTube, set both or neither: with only one, brain refuses to start.
      </p>
      <p>
        Redirect addresses start with your <C>BRAIN_URL</C>, for example <C>https://api.example.com</C>. They must match exactly, so change them when you change the domain.
      </p>
      {networkApps.map((n) => (
        <section key={n.name} className="grid gap-3">
          <h2>{n.name}</h2>
          <p>
            Create the app in{" "}
            <a href={n.url} target="_blank" rel="noopener noreferrer" className={link}>
              {n.where}
            </a>
            .
          </p>
          <ol className="list-decimal pl-6">
            {n.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p>
            Redirect address:{" "}
            {n.redirect.map((r, i) => {
              const [path, what] = r.split(" (");
              return (
                <span key={r}>
                  {i > 0 && ", "}
                  <C>{path}</C>
                  {what && ` (${what}`}
                </span>
              );
            })}
          </p>
          <p>
            Permissions SocialReins asks for: <C>{n.scopes}</C>
          </p>
          <Code>{n.env.map((e) => `${e}=`).join("\n")}</Code>
          {n.note && <p>{n.note}</p>}
        </section>
      ))}
    </>
  );
}

const bodies: Record<Guide, (props: { mode: Mode }) => ReactNode> = { start: Start, use: Use, ai: Ai, apps: Apps };

// The self-hosted / cloud switcher: the same guide in the other version.
function Switcher({ mode, guide }: { mode: Mode; guide: Guide }) {
  return (
    <nav aria-label="Version" className="inline-flex justify-self-start rounded-full border-2 border-ink bg-paper p-1 text-sm font-bold">
      {docModes.map((m) => (
        <Link
          key={m}
          href={docPath(m, guide)}
          aria-current={m === mode ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 ${m === mode ? "bg-ink text-paper" : "hover:text-signal-deep"}`}
        >
          {modes[m].name}
        </Link>
      ))}
    </nav>
  );
}

export function DocPage({ mode, guide }: { mode: Mode; guide: Guide }) {
  const Body = bodies[guide];
  return (
    <main className={sitePage}>
      <SiteHeader />
      <div className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-12">
        <aside className="grid content-start gap-5">
          <Switcher mode={mode} guide={guide} />
          <nav aria-label="Docs">
            <ul className="grid gap-1">
              {guides.map((g) => (
                <li key={g}>
                  <Link
                    href={docPath(mode, g)}
                    aria-current={g === guide ? "page" : undefined}
                    className={`block rounded-lg px-3 py-1.5 ${g === guide ? "bg-ink/5 font-bold" : "text-ink-soft hover:text-ink"}`}
                  >
                    {short[g][mode]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <article className="grid min-w-0 max-w-3xl content-start gap-6">
          <div className="grid gap-2">
            <p className="text-sm font-bold tracking-wide text-ink-soft uppercase">
              <Link href="/docs" className="hover:text-signal-deep">
                Docs
              </Link>{" "}
              / {modes[mode].name}
            </p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight">{titles[guide][mode]}</h1>
          </div>
          {mode === "cloud" && <CloudNotice />}
          <div className="legal grid min-w-0 gap-4 leading-relaxed">
            <Body mode={mode} />
          </div>
        </article>
      </div>
    </main>
  );
}
