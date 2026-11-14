import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader, sitePage } from "@/components/site-header";
import { publicPage } from "@/lib/seo";

// The docs live in this app for now: one guide per page, written once for both ways of running SocialReins.
// Each guide is a function of the mode, so the self-hosted and cloud versions cannot drift apart.
export type Mode = "self-hosted" | "cloud";
export type Guide = "start" | "use" | "ai";

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
};

const descriptions: Record<Guide, Record<Mode, string>> = {
  start: {
    "self-hosted": "Install SocialReins on your own server with Docker Compose: the settings to change, the first sign-in, domains, updates and the platform apps.",
    cloud: "SocialReins Cloud is not open yet. Join the waitlist to hear when it opens, or self-host SocialReins for free today with the same features.",
  },
  use: {
    "self-hosted": "How to use your own SocialReins install: connect social accounts, group them into sets, write and schedule posts, and invite your team.",
    cloud: "How SocialReins Cloud works once you have an account: connect social accounts, group them into sets, write and schedule posts, invite a team.",
  },
  ai: {
    "self-hosted": "Connect Claude or another AI assistant to your own SocialReins install through its MCP server, using an API token you create in the app.",
    cloud: "Connect Claude or another AI assistant to SocialReins Cloud through its MCP server, using an API token you create in the app.",
  },
};

const short: Record<Guide, Record<Mode, string>> = {
  start: { "self-hosted": "Install", cloud: "Get started" },
  use: { "self-hosted": "Connect and publish", cloud: "Connect and publish" },
  ai: { "self-hosted": "AI setup", cloud: "AI setup" },
};

export const guides: Guide[] = ["start", "use", "ai"];
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
        Meta also needs the webhook address <C>/webhooks/meta</C>. After changing <C>.env</C>, run <C>docker compose up -d</C>.
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
      <p>A set is a group of accounts you post to together, such as one brand or one client. Every team starts with a Default set that holds every account. Open Sets to add more and choose which accounts belong to each.</p>
      <h2>3. Write a post</h2>
      <p>
        Open Posts and write a post. Under Post to, pick the networks. Add your text, photos or a video, and a first comment or a thread where the network allows one. Then publish now or pick a time to schedule it. The <Link href="/post-types" className={link}>post types page</Link> lists what each network accepts.
      </p>
      <h2>4. Check and take down</h2>
      <p>Calendar shows what is scheduled. A published post shows a result for each account, with the reason when a network refused it. Taking a published post down removes it from its network, and a post sent to several networks has Take down all. It stays in SocialReins, marked as taken down.</p>
      <h2>5. Invite your team</h2>
      <p>Open Team to invite people by email as an admin or a member. Lists group posts into an ordered series.</p>
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
      <p>Try &quot;list my connected accounts&quot; or &quot;schedule this post to my Default set for tomorrow at 9&quot;. The assistant gets these tools:</p>
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

const bodies: Record<Guide, (props: { mode: Mode }) => ReactNode> = { start: Start, use: Use, ai: Ai };

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
