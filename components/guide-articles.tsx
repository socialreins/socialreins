import Link from "next/link";
import type { ReactNode } from "react";

const link = "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep";
const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-[0.9em] [overflow-wrap:anywhere]">{children}</code>
);

// The bodies of the six guides. One component per article, so the page files stay as small as the compare pages.
// Every article links to at least two product pages and to another guide; the frame adds two more at the end.

export function ScheduleSeveral() {
  return (
    <>
      <p>
        A post in SocialReins is not nine separate drafts. You choose the accounts, write the text once, then adjust it
        for the networks that need something different. The scheduling, the calendar and the result are all one post.
        That is the point of the tool, and it is also where the details matter.
      </p>

      <h2>One post, one set of accounts</h2>
      <p>
        Accounts are grouped into a set, such as one brand or one client. Every team starts with a set holding every
        account, named All sets until you rename it. Open Sets to add another and choose which accounts belong to it.
        The set picked in the top bar decides what the queue, the calendar, Posts and Analytics show.
      </p>
      <p>
        A post sent to several accounts in a set stays one post. Posts lists it once, the calendar draws it once,
        analytics counts it once, and <strong>Take down all</strong> removes it from every network in one step. Accounts
        on different networks can share a post; accounts in different sets cannot.
      </p>

      <h2>The flow, step by step</h2>
      <ol>
        <li>
          Open Accounts and connect the networks you will post to. Bluesky asks for your handle and an app password.
          The others send you to the network to sign in and approve, and Facebook and Instagram connect together.
        </li>
        <li>Pick the set in the top bar, so the post, the queue and the calendar agree.</li>
        <li>Open Posts and choose New post.</li>
        <li>
          Under <strong>Post to</strong>, tick the networks. With two or more ticked, each one gets its own tab.
        </li>
        <li>
          Write the base text and add the media. Then open each network&apos;s tab for a different caption, different
          images or a video, and any first comment or thread that network allows.
        </li>
        <li>
          Choose a time, <strong>Publish now</strong>, or <strong>Add to queue</strong>. The Repeat control beside the
          time handles a daily, weekly or monthly repeat, except on TikTok.
        </li>
      </ol>
      <p>
        The queue is a set&apos;s weekly time slots, so a queued post takes the next free one and you never pick a time by
        hand. Calendar shows every scheduled post by day, and you can drag one to another day or move it with its own
        button. The <Link href="/docs/self-hosted/use#queue" className={link}>Use guide</Link> walks through the queue
        if you have not set it up yet.
      </p>

      <h2>What each network asks for</h2>
      <p>
        Networks are not interchangeable, and the tool cannot pretend otherwise. The{" "}
        <Link href="/post-types" className={link}>
          post types page
        </Link>{" "}
        is the full table. The points that most often surprise people:
      </p>
      <ul>
        <li>
          <strong>Instagram</strong> takes no text-only post: it needs at least one image or video. A carousel can hold
          up to 20 items.
        </li>
        <li>
          <strong>YouTube</strong> takes a video only, and the first line of your text is the title, which has to fit
          in 100 characters.
        </li>
        <li>
          <strong>TikTok</strong> takes one video or a set of photos. Every post carries privacy and disclosure
          choices that a person confirms, so TikTok is not posted from a CSV file, cannot repeat, and is not offered
          for feeds.
        </li>
        <li>
          <strong>Pinterest</strong> needs a board on the account. Set a default board in the account&apos;s settings, or
          pick one on the pin. A pin is one to five images, or one video.
        </li>
        <li>
          <strong>X</strong> counts a link as 23 characters and some characters as two, and it has no first comment
          through the API, so put the follow-up in the post or use a public reply in an automation.
        </li>
        <li>
          <strong>Bluesky</strong> gives you 300 characters, <strong>Threads</strong> 500 and{" "}
          <strong>LinkedIn</strong> 3,000. Threads and X take a thread; LinkedIn and Facebook Pages do not.
        </li>
      </ul>

      <h2>Where a scheduled post can still stop</h2>
      <p>
        A scheduled post is a promise to try, not a guarantee. Each network can refuse at the moment it publishes: a
        media link that only your browser can open, a connection whose token expired, a file type it does not accept,
        or a permission the app no longer holds. SocialReins records a result for each account. One refusal does not
        hold back the others, and the post&apos;s page shows the reason for the account that failed.
      </p>
      <p>
        Two checks save most of these surprises. First, open every media link in a private browser window before you
        schedule the post: if it asks you to sign in, the network cannot fetch it either. Second, look at Accounts now
        and then. An account whose token ends within seven days is marked, and reconnecting takes a minute, while a
        post that fails at 9am takes the rest of the morning.
      </p>
      <p>
        If the team requires approvals, a member&apos;s scheduled post is also held until an owner or admin approves it.
        That is a separate step from publishing, and it is covered in{" "}
        <Link href="/guides/social-media-approval-workflow" className={link}>
          the approvals guide
        </Link>
        .
      </p>

      <h2>Give each network its own wording</h2>
      <p>
        Cross-posting the same paragraph everywhere usually reads badly somewhere. A 300-character Bluesky post is a
        different shape from a LinkedIn paragraph, and an Instagram caption has to carry the media rather than repeat
        the text on it. Use the base tab for the idea, then spend two minutes in each tab: cut the text for Bluesky
        and X, add the link to the first comment on Instagram or Facebook, and give YouTube a title that works as a
        title.
      </p>
      <p>
        The per-network tabs also solve a practical problem: the same image may be fine on three networks and wrong for
        a fourth. Changing media on one tab leaves the others alone, so a post can go to nine networks without looking
        copy-pasted. If you are planning a whole week at once,{" "}
        <Link href="/guides/posting-cadence-small-team" className={link}>
          the cadence guide
        </Link>{" "}
        shows how to batch the writing and keep the queue full.
      </p>

      <h2>When one post is the wrong shape</h2>
      <p>
        One post to several networks is right for an announcement where the message is the same and the format can
        flex. It is wrong when the accounts belong to different clients or audiences and the text has to make a
        different argument. In that case use a set per client and a separate post for each, even if the media is the
        same. The calendar will still show both.
      </p>
      <p>
        To take a published post down, open it and choose <strong>Take down all</strong>. It comes down from each
        network and stays in SocialReins, marked as taken down. TikTok has no delete through another app, so that one
        has to be deleted in the TikTok app itself.
      </p>
      <p>
        None of this needs a special plan: scheduling, sets, per-network captions and taking a post down are in the
        free self-hosted version. The{" "}
        <Link href="/features" className={link}>
          features page
        </Link>{" "}
        lists the rest.
      </p>
    </>
  );
}

export function ApprovalWorkflow() {
  return (
    <>
      <p>
        An approval step is worth having when more than one person writes for an account, and it is a tax on every post
        when it is set up badly. SocialReins keeps the feature deliberately small: one switch, three roles, and one
        decision per post. This guide covers exactly what happens, then a rhythm that keeps the queue moving.
      </p>

      <h2>Who can do what</h2>
      <p>
        A team has three roles. An <strong>owner</strong> can do everything, including managing the team and its
        settings. An <strong>admin</strong> can do the same day-to-day work, including approving posts. A{" "}
        <strong>member</strong> writes and schedules posts but cannot approve them. People are invited to a role from
        the Team page, and the role is shown beside each person&apos;s name.
      </p>
      <p>
        The approval feature lives on the Team page, so it is a team-wide setting rather than a setting per set or per
        network. That matches how small teams usually work: one rule for everyone, rather than a matrix someone has to
        remember.
      </p>

      <h2>Turn it on</h2>
      <ol>
        <li>Open Team as an owner or admin.</li>
        <li>
          Under Approvals, tick &quot;Members&apos; posts need an owner or admin to approve them before they go out&quot;.
        </li>
        <li>That is it. Posts by owners and admins continue to go out as before.</li>
      </ol>
      <p>
        From then on, a member&apos;s scheduled post is held for a decision, and posts by owners and admins continue to
        go out as before. A draft that a member saves is still a draft: approvals are about a post that is ready to go
        out, not about saving work in progress.
      </p>

      <h2>What the author sees</h2>
      <p>
        A member&apos;s scheduled post is held and shows <strong>Needs approval</strong> in Posts. On the post&apos;s own page
        the approval banner repeats the state, and <strong>Publish now</strong> stays disabled until an owner or admin
        approves it. On the calendar the post&apos;s dot is hollow, so a glance at the month shows what is waiting.
      </p>
      <p>
        If the reviewer asks for changes, the post shows <strong>Changes requested</strong> with the note that came
        with the decision. The author can edit the post and schedule it again. The note stays with the post, which is
        more useful than a chat message that scrolls away: the next person to open the post can see what was wrong.
      </p>

      <h2>What the reviewer sees</h2>
      <p>
        While the team requires approval, Posts gains Approval filter chips, including <strong>Needs approval</strong>{" "}
        and <strong>Changes requested</strong>. The chips filter in the browser, so switching between them is instant.
        Owners and admins also see the waiting posts on Home, in the Needs attention card, which is where a reviewer
        who opens the app in the morning will look first.
      </p>
      <p>
        Opening a waiting post shows the approval banner with two actions: <strong>Approve</strong>, or{" "}
        <strong>Request changes</strong> with a note of up to 500 characters. Approving a scheduled post lets it go
        out at its time. Requesting changes does not delete it; it records the decision and the note for the author.
        The same two actions are on the post&apos;s row in Posts, so a reviewer can clear a small batch without opening
        each one.
      </p>

      <h2>A rhythm that does not stall</h2>
      <p>
        The feature cannot decide who reviews or when, so the team has to. This part is our opinion, drawn from
        running small accounts, not a benchmark:
      </p>
      <ul>
        <li>
          <strong>Name one reviewer for the week.</strong> &quot;Whoever is around&quot; means the post waits until someone
          notices, and the author cannot plan around that.
        </li>
        <li>
          <strong>Review twice a day, at fixed times.</strong> A short morning pass and a short afternoon pass are
          easier to keep than a promise to look constantly, and the author learns when to expect a decision.
        </li>
        <li>
          <strong>Schedule one queue slot ahead.</strong> If the post is due at 9am and the review happens at 10am,
          the queue is already late. Writing a day ahead costs less than moving the slot.
        </li>
        <li>
          <strong>Make the note concrete.</strong> &quot;Change the second line, the claim needs a link&quot; is a decision.
          &quot;Not sure&quot; is a conversation that will happen twice.
        </li>
        <li>
          <strong>Let owners and admins skip the step.</strong> They already carry the responsibility, and their posts
          are not held. Keep the review for the people who asked for it.
        </li>
      </ul>
      <p>
        A simple weekly shape for a team of three: the writer fills the queue on Monday, the reviewer clears it on
        Monday afternoon, and the posts go out through the week. The inbox owner answers replies as they arrive. That
        is one review window, not a daily meeting.
      </p>
      <p>
        A reviewer needs three checks and no more: does the post say something the account can stand behind, does the
        media open for someone who is not signed in, and is the link or the handle right. Everything else is taste,
        and taste is better discussed on the draft than used to hold a queue. If a post fails one of the checks, the
        note should name it, so the author can fix it once and send it back.
      </p>

      <h2>What it does not do</h2>
      <ul>
        <li>There is no second approval step and no approval chain. One owner or admin decides.</li>
        <li>There is no outside reviewer role. Everyone who decides is a member of the team.</li>
        <li>Approval is not per network and not per set. One switch covers the team.</li>
        <li>Owners and admins are never held, even when the switch is on.</li>
        <li>Drafts are not held. A draft is not going out, so there is nothing to approve yet.</li>
      </ul>
      <p>
        If any of those limits is the deciding factor, it is better to know now than to discover it during a launch
        week. The{" "}
        <Link href="/features#team" className={link}>
          Team features
        </Link>{" "}
        list the same ground in one place.
      </p>

      <h2>Set it up before you need it</h2>
      <p>
        Turning approvals on after a mistake is common, and it works, but the team then learns the rule during a busy
        week. If you already know that a second person will write for the account, turn it on while the queue is
        small. The same advice applies to the queue itself:{" "}
        <Link href="/guides/schedule-post-to-several-networks" className={link}>
          schedule a post to several networks
        </Link>{" "}
        is easier to review when each network has its own tab filled in properly.
      </p>
    </>
  );
}

export function SelfHosting() {
  return (
    <>
      <p>
        Running SocialReins yourself is not a hosted account with a different bill. You get the same code, and you also
        get the server, the database, the network apps and the pager. This guide is the honest list of what that
        involves. It follows the{" "}
        <Link href="/docs/self-hosted" className={link}>
          install guide
        </Link>{" "}
        and the README, so the two stay in step.
      </p>

      <h2>Three containers and one command</h2>
      <p>
        SocialReins runs as three containers: Postgres, brain (the Rust API) and web (the Next.js site and app). You
        need Docker with Docker Compose. The published images support <C>linux/amd64</C> and <C>linux/arm64</C>. The
        quick start is a clone, a settings file and one command:
      </p>
      <pre className="min-w-0 overflow-x-auto rounded-xl bg-ink p-4 font-mono text-sm leading-relaxed text-paper">
        <code>{`git clone --recurse-submodules https://github.com/socialreins/socialreins
cd socialreins && cp .env.example .env
# edit .env: POSTGRES_PASSWORD, ENCRYPTION_KEY, BRAIN_URL, WEB_URL
docker compose up -d`}</code>
      </pre>
      <p>
        brain creates and migrates its database when it starts. For a look around on your own machine, the default
        local URLs work and the sign-in link is written to brain&apos;s log rather than emailed.
      </p>

      <h2>Settings you cannot skip</h2>
      <ul>
        <li>
          <C>POSTGRES_PASSWORD</C>: a long random value. <C>openssl rand -hex 24</C> is enough.
        </li>
        <li>
          <C>ENCRYPTION_KEY</C>: encrypts the connected accounts&apos; tokens and app passwords. brain refuses to start
          without it. Back it up with the database, because losing it means every account has to be connected again.
        </li>
        <li>
          <C>BRAIN_URL</C> and <C>WEB_URL</C>: where people reach the API and the site, with no trailing slash. They
          must share a registrable domain, because the session cookie lives on brain&apos;s host and is only sent from a
          page on the same site.
        </li>
        <li>
          <C>MAIL_LOG</C>, <C>RESEND_API_KEY</C> or <C>SMTP_URL</C>: brain needs one of them, or it refuses to start
          rather than put sign-in links in a log by surprise. <C>MAIL_LOG=true</C> is fine for a private trial and
          wrong for a team that expects email.
        </li>
        <li>
          <C>REGISTRATION_DISABLED=true</C> and <C>OWNER_EMAIL</C>: for a personal install, so nobody else can create
          an account. Without an owner email, the first person to sign up owns the install.
        </li>
        <li>
          <C>TRUST_PROXY=true</C>: only when a reverse proxy sets <C>X-Forwarded-For</C> and brain cannot be reached
          around it.
        </li>
      </ul>

      <h2>Domains, TLS and the proxy</h2>
      <p>
        The Compose file publishes its ports on <C>127.0.0.1</C> only. For a public install, put a reverse proxy with
        TLS in front, such as Caddy, nginx or Traefik, and send one hostname to each port: for example{" "}
        <C>app.example.com</C> to web on 3000 and <C>api.example.com</C> to brain on 8080. Both hosts sit under the
        same registrable domain. Two unrelated domains, or two separate <C>*.up.railway.app</C> hosts, will not keep
        you signed in.
      </p>
      <p>
        Certificates are the proxy&apos;s job, not the app&apos;s. Web sends HSTS on every response, so a browser that has seen
        the site once will keep using https for that hostname. Get the proxy and the certificate right before you
        invite anyone.
      </p>

      <h2>Media: a bucket or a disk</h2>
      <p>
        A post&apos;s images and video can be public https links, which is what the Library stores, or files uploaded from
        a device. Uploaded files need somewhere to live. brain supports two arrangements: an S3-compatible bucket,
        such as Cloudflare R2 or S3, set through the <C>S3_*</C> settings, or a directory on local disk set through{" "}
        <C>MEDIA_DIR</C>.
      </p>
      <p>
        A bucket is the easier option when the server may be replaced, because the media is not tied to that machine.
        A local directory is simpler and cheaper on one box, but it has to sit on a volume that survives a redeploy,
        and it suits a single brain instance rather than several. The media for a scheduled post is downloaded again
        at publish time, so losing the directory can break posts that were scheduled but not yet sent.
      </p>

      <h2>The platform apps</h2>
      <p>
        Every network is optional and shows as not configured until its app credentials are in your settings. For
        Facebook Pages, Instagram, Threads, LinkedIn, X, TikTok, YouTube and Pinterest you create your own developer
        app with the network, put its keys in <C>.env</C>, and register the redirect address that points at your
        brain host. The{" "}
        <Link href="/docs/self-hosted/apps" className={link}>
          network apps guide
        </Link>{" "}
        lists the variables and redirect addresses for each one.
      </p>
      <p>
        Bluesky is the exception: it needs no developer app, only an app password for the account. The others can ask
        for a review before their permissions work for anyone outside a test group, and some permissions, such as
        reading comments on a LinkedIn Page, need an approval that is not open to every app. Plan for the reviews to
        take longer than the install.
      </p>

      <h2>Backups, updates and the undo button</h2>
      <p>
        Back up two things together: a dump of the Postgres database and the <C>ENCRYPTION_KEY</C>. A database without
        the key cannot decrypt the account tokens, and a key without the database is not much use either. Keep a
        recent copy somewhere other than the server, and test a restore before you need one. Media in a bucket follows
        the bucket&apos;s own versioning and retention; media on local disk needs the volume backed up too.
      </p>
      <p>
        To upgrade, pull the new images and start the containers again. Migrations only move forward and are safe to
        rerun. <C>SOCIALREINS_VERSION</C> chooses the image tag: <C>main</C>, <C>latest</C> or a release such as{" "}
        <C>v0.1.0</C>. <C>docker compose down -v</C> removes everything, data included, so keep it for the day you
        really mean it.
      </p>

      <h2>What you are taking on</h2>
      <p>Self-hosting moves a specific list of jobs from us to you. It is worth reading the list before you start:</p>
      <ul>
        <li>The server, its operating system, the firewall, DNS and the TLS certificate.</li>
        <li>Email delivery, including the domain records that keep sign-in mail out of spam.</li>
        <li>Your own developer apps, their reviews, their rate limits and their quotas. X charges for the calls its API returns, and YouTube gives every app one daily quota shared by all its users.</li>
        <li>Monitoring, backups, restores and someone to notice when the site is down.</li>
        <li>Upgrades, and reading the release notes before one.</li>
        <li>Storage growth, and deciding when a local disk needs more room or a bucket needs a lifecycle rule.</li>
      </ul>
      <p>
        None of that is hidden, and none of it is hard every day. It is simply work, and it is the trade for keeping
        the data and the code on your own terms. If the list looks like a good use of your time,{" "}
        <Link href="/guides/open-source-vs-hosted-social-media-tools" className={link}>
          the open source versus hosted guide
        </Link>{" "}
        compares it with the alternative. If you would rather not run a server at all, the{" "}
        <Link href="/compare/postiz" className={link}>
          Postiz comparison
        </Link>{" "}
        shows another self-hosted option, with what it does differently.
      </p>
    </>
  );
}

export function InboxAutomations() {
  return (
    <>
      <p>
        A small team cannot watch every comment and DM all day. Automations are how SocialReins answers the predictable
        ones, and the inbox is where the rest land. The trick is knowing which is which: each network decides what an
        app may read and send, so the same automation does not work the same way everywhere.
      </p>

      <h2>The inbox is the starting point</h2>
      <p>
        Comments, mentions and DMs from your connected accounts arrive in one inbox. DMs with one person are grouped
        into a conversation and open as a chat. You can search by text or author, switch between Open and Done, filter
        by kind and by assignee, assign an item to a teammate, and answer with a saved reply. Everyone on the team
        sees the same inboxes.
      </p>
      <p>
        The inbox is live on Bluesky. Facebook Pages and Instagram are in testing, and so are X and Threads (replies
        and mentions, with no DMs on Threads) and YouTube (comments only). X is off until a team turns it on for an
        account, because X charges for every post and message its API returns, and YouTube is off until a channel
        turns it on, because every app shares one daily quota. The{" "}
        <Link href="/features/inboxes" className={link}>
          inboxes page
        </Link>{" "}
        has the per-network detail.
      </p>

      <h2>The triggers that exist</h2>
      <p>An automation starts on one of these:</p>
      <ul>
        <li>A comment keyword, a DM keyword, or a first message (a welcome).</li>
        <li>A new follower, a like of your post, or a repost of your post. Those three are Bluesky only.</li>
        <li>A mention.</li>
        <li>A story reply or a story mention (Instagram, in testing), or a button tap.</li>
      </ul>
      <p>
        Conditions narrow it: the accounts, a set or only the posts you name, keywords, a person&apos;s first comment or
        message, weekdays and hours in your time zone, one of 23 languages, a person&apos;s first mention, a text with or
        without a link, and a question or a positive or negative mood read by AI. A very short text never matches the
        language and mood conditions, so a &quot;yes&quot; in a DM does not get treated as a full sentence.
      </p>

      <h2>The actions</h2>
      <p>
        A simple automation has one reply: a DM, a public reply, or both. A flow runs several steps in turn, with waits
        and buttons, and can wait for the person to answer before it goes on. A flow has up to 10 steps. Besides
        replying, an automation can:
      </p>
      <ul>
        <li>Hide a comment on Facebook, Instagram, Threads or X.</li>
        <li>Like a comment on Facebook, Bluesky or X, and repost or follow back on Bluesky.</li>
        <li>Tag the contact, so you can find those people later or send them a broadcast.</li>
        <li>Mail your team, assign the conversation, or stop newer automations from acting on the same item.</li>
      </ul>
      <p>
        The{" "}
        <Link href="/features/automations" className={link}>
          automations page
        </Link>{" "}
        lists every trigger and action with the network it works on. Test an automation before it goes live: the test
        shows what would match and what would be sent, and sends nothing outside the app.
      </p>

      <h2>What each network refuses</h2>
      <ul>
        <li>
          <strong>Bluesky</strong> has no private reply to a comment. A DM reaches only people who follow you or take
          DMs from anyone, so keep a fallback public reply. Replies are 300 characters, and there are no story
          replies or buttons to tap.
        </li>
        <li>
          <strong>X</strong> has no private reply to a comment either, so a fallback public reply is how you answer.
          A DM goes only to someone who follows you or has DMs open. X bills every post, user and message, so an X
          account has a monthly budget and its automations stop when it is used up.
        </li>
        <li>
          <strong>Facebook and Instagram</strong> allow a private reply within 7 days of a comment, once per comment.
          Any other message has to arrive within 24 hours of the person&apos;s last message, and their answer starts a new
          24 hours. An Instagram DM is at most 1,000 bytes.
        </li>
        <li>
          <strong>Threads</strong> has no DMs, no private reply and no like for an app. An automation there can answer
          a reply or a mention in public and hide a reply directly under your post. A Threads-only automation that
          sends a DM is refused when you save it; with other networks beside it, the Threads items are skipped and the
          run log says why.
        </li>
        <li>
          <strong>YouTube</strong> has only the comment trigger, and the answer is a public reply. It has no DMs and
          no private reply.
        </li>
        <li>
          <strong>LinkedIn</strong> is built and switched off until LinkedIn approves the app. A Page can answer
          comments in public or like them, but there is no DM and no hide. A personal profile can post but cannot run
          an automation.
        </li>
        <li>
          <strong>Pinterest</strong> has no comment or message API we could find, so it has no inbox and no
          automations.
        </li>
      </ul>

      <h2>Three automations worth starting with</h2>
      <ol>
        <li>
          <strong>Comment keyword to DM.</strong> Someone comments a keyword on a post, and the automation sends the
          link by DM with a public reply as the fallback. On Bluesky this works end to end today, and the test tells
          you which comment would match.
        </li>
        <li>
          <strong>Welcome message on Bluesky.</strong> A new follower gets a short DM. They already follow you, so the
          usual DM restriction does not block it, unless they have closed their DMs.
        </li>
        <li>
          <strong>Hide comments that carry a link.</strong> On Facebook, Instagram, Threads or X, an automation can
          hide a comment that matches the link condition. It removes the spam from the thread without deleting
          anything.
        </li>
      </ol>
      <p>
        A fourth is less visible but useful: tag the contact when someone asks about a topic, then send a broadcast to
        that tag later. Contacts with tags and notes are in the same place, and a broadcast is one DM to everyone with
        a tag, with each network&apos;s own limits respected.
      </p>

      <h2>Where a person still has to answer</h2>
      <p>
        Automations are for the predictable reply, not for the difficult one. Keep a person on complaints, refunds,
        legal questions and anything that needs an apology. Also keep one on the cases a network blocks: a DM outside
        Meta&apos;s 24-hour window, a person on Bluesky or X who does not follow you, a YouTube quota that is used up, and
        every LinkedIn comment until the app is approved. Assign those to a teammate in the inbox instead of writing
        another rule.
      </p>
      <p>
        Every run is listed with what was sent and, when something was refused, the reason. A team&apos;s automations can
        answer 500 comments a day, each automation can have its own daily limit and a cool-down, and one switch on the
        Team page pauses all of them. Read the run log once a week: a rule that skips half its items is usually a
        condition that needs widening, not a network being difficult. The{" "}
        <Link href="/guides/social-media-approval-workflow" className={link}>
          approvals guide
        </Link>{" "}
        covers the other half of a small team&apos;s process, the posts that go out.
      </p>
    </>
  );
}

export function OpenSourceHosted() {
  return (
    <>
      <p>
        A social media tool has to do two jobs: publish your posts, and keep the connection to each network alive. The
        open source versus hosted question is not really about which one can publish. It is about who runs the second
        job, who creates the developer apps, and what happens on the day a network changes its rules.
      </p>

      <h2>The three shapes you will meet</h2>
      <ul>
        <li>
          <strong>Hosted subscription.</strong> You sign up and pay for a plan. The vendor runs the servers and
          registers the network apps. Buffer, Hootsuite, Later, Metricool, SocialBee and Sprout Social are in this
          group in our{" "}
          <Link href="/compare" className={link}>
            comparisons
          </Link>
          .
        </li>
        <li>
          <strong>Open source, self-hosted.</strong> You run the code on your own server. SocialReins is AGPL-3.0 and
          free to self-host, with every feature.{" "}
          <Link href="/compare/postiz" className={link}>
            Postiz
          </Link>{" "}
          is AGPL-3.0 and self-hostable too.{" "}
          <Link href="/compare/mixpost" className={link}>
            Mixpost
          </Link>{" "}
          has a free Lite edition under MIT and paid Pro and Enterprise editions that are source-available rather than
          open source.
        </li>
        <li>
          <strong>API-first hosted.</strong> You get an API and build the interface, or use a thin one.{" "}
          <Link href="/compare/ayrshare" className={link}>
            Ayrshare
          </Link>{" "}
          and{" "}
          <Link href="/compare/post-bridge" className={link}>
            Post Bridge
          </Link>{" "}
          sit here. It is a good fit when posting is a feature inside your own product.
        </li>
      </ul>

      <h2>The questions that decide it</h2>
      <ol>
        <li>
          <strong>Who will operate it?</strong> A self-hosted tool needs someone to keep a server, a database, TLS,
          email and backups working. If nobody wants that job, it is not free, it is unpaid work.
        </li>
        <li>
          <strong>Who owns the network apps?</strong> On a hosted plan, the vendor&apos;s apps and their reviews are part of
          the service. Self-hosted, you create an app with each network, register its redirect address and wait for
          any review. Bluesky needs no app, which is why it is often the first network to work.
        </li>
        <li>
          <strong>Which features do you actually use?</strong> An inbox, automations, analytics, approvals and an API
          are not equally mature everywhere. The compare pages list what each tool says it does, read from its own site
          on a dated check.
        </li>
        <li>
          <strong>What does leaving look like?</strong> Self-hosted, the data is in your Postgres and the code is
          yours to read. Hosted, export varies by tool. Decide before you import a year of content.
        </li>
        <li>
          <strong>What is your time worth?</strong> Self-hosting has no licence fee. It does have a server bill and the
          hours you put in. A hosted plan has a clear price. Compare the two honestly rather than comparing a
          subscription with zero.
        </li>
      </ol>

      <h2>Cost is more than the plan price</h2>
      <p>
        SocialReins is free to self-host, and Cloud is priced at $190 a year or $19 a month for Scheduler and $490 a
        year or $49 a month with automation, with a 7-day trial on a first plan; the{" "}
        <Link href="/pricing" className={link}>
          pricing page
        </Link>{" "}
        keeps that current. The self-hosted column still has a server, a domain and your time in it. Hosted tools in
        our comparisons range from free plans to per-seat prices, and each page links the source it was read from, so
        check the numbers there rather than trusting a summary.
      </p>
      <p>
        One cost is easy to miss: network charges. X bills for the posts and messages its API returns, on any tool. A
        YouTube app has one daily quota shared by all its users, which is why a YouTube inbox is off until a channel
        turns it on. Those costs and limits follow the app, not the licence.
      </p>

      <h2>Maintenance is the real difference</h2>
      <p>
        A hosted tool absorbs upgrades, security patches, database backups and the small changes networks make to
        their APIs. In exchange, you get the vendor&apos;s roadmap and its pricing. A self-hosted tool gives you the code
        and the data, and makes you the operator. Upgrades are a pull and a restart, but someone has to notice the
        release, read the notes and do it.
      </p>
      <p>
        This is the part where &quot;open source is cheaper&quot; stops being true for some teams. If nobody on the team enjoys
        operations, the hours spent on a failed certificate or a full disk can cost more than a year of a hosted
        plan. If someone does enjoy it, or the data has to stay on your own server, self-hosting is a good trade. Our{" "}
        <Link href="/guides/self-hosting-a-social-media-scheduler" className={link}>
          self-hosting guide
        </Link>{" "}
        lists the work in detail so the comparison is not abstract.
      </p>

      <h2>What open source gives you beyond the price</h2>
      <ul>
        <li>The data sits in your own Postgres, on your own server.</li>
        <li>You can read the code that talks to each network, and change it if you need to.</li>
        <li>No plan limit decides whether you can use the inbox or an automation.</li>
        <li>An API, an MCP server and signed webhooks are part of the product, not a higher tier.</li>
      </ul>
      <p>
        What it does not give you is a support desk that answers at 2am, or a vendor that has already spent months in
        each network&apos;s review process. Those are real things, and a hosted plan is often paying for exactly them.
      </p>

      <h2>A short way to decide</h2>
      <ol>
        <li>If you have no one to run a server, start hosted. Revisit when the bill or a data requirement pushes you.</li>
        <li>If your data must stay on your own infrastructure, self-host, and budget the operations time as part of the cost.</li>
        <li>If you need one specific feature that only one tool has, pick by that feature and accept the rest.</li>
        <li>If you are unsure, run a self-hosted trial on one network for a month. One network is enough to learn whether the work suits you.</li>
      </ol>
      <p>
        The{" "}
        <Link href="/compare" className={link}>
          compare index
        </Link>{" "}
        has a page for each tool, including where it fits better than SocialReins. If posting is only one part of a
        larger content rhythm, the{" "}
        <Link href="/guides/posting-cadence-small-team" className={link}>
          cadence guide
        </Link>{" "}
        covers what to do once the tool is chosen.
      </p>
    </>
  );
}

export function PostingCadence() {
  return (
    <>
      <p>
        Most posting advice arrives as a number with no source. This guide does not do that. There is no universal
        right cadence, and the numbers below are suggestions from our own experience, clearly marked as opinion. Use
        them as a starting point, then let your own week tell you what is sustainable.
      </p>

      <h2>Start from capacity, not from a target</h2>
      <p>
        Count what you can actually produce. Instagram needs an image or a video for every post. YouTube needs a video,
        with a title in the first line of the text. TikTok needs someone to confirm each post and its privacy choices.
        Pinterest needs a board and a pin image. A cadence that outruns your supply of good material turns into
        filler, and filler is harder to undo than a quiet week.
      </p>
      <p>
        The{" "}
        <Link href="/post-types" className={link}>
          post types page
        </Link>{" "}
        is the honest inventory of what you can publish where. Read it before you promise a network a schedule.
      </p>

      <h2>A starting rhythm for one person</h2>
      <p>
        Our opinion for a solo operator: choose one primary network and post once on each working day. Add one
        secondary network only when you can fill the first without thinking. Batch the writing into a single block,
        fill the queue, and spend a short window each day on replies instead of writing from scratch.
      </p>
      <p>
        If the primary network needs media you do not have, make the primary a text-first network and use the visual one
        for the posts that earn a photo. Bluesky, X, Threads, LinkedIn and Facebook Pages all take text. LinkedIn gives
        you 3,000 characters, Threads 500 and Bluesky 300, which changes how much you can say in one post.
      </p>

      <h2>Two to three people</h2>
      <p>
        With two or three people, the constraint stops being writing and becomes waiting. Give each person one job:
        one writes, one approves and one owns the inbox, or the same person approves and owns the inbox if the team is
        two. Then set one weekly rhythm:
      </p>
      <ul>
        <li>Monday morning: the writer fills the queue for the week.</li>
        <li>Monday afternoon: the reviewer clears the queue in one pass.</li>
        <li>Every day: the inbox owner answers what arrived, and assigns the rest.</li>
        <li>Friday: a short look at what got replies, and one change for next week.</li>
      </ul>
      <p>
        This is where the{" "}
        <Link href="/features#team" className={link}>
          approval step
        </Link>{" "}
        earns its place. One review window is enough for most small teams, and it is better than a rule that every post
        needs a meeting. The{" "}
        <Link href="/guides/social-media-approval-workflow" className={link}>
          approvals guide
        </Link>{" "}
        covers how to keep that window short.
      </p>

      <h2>Four to five people</h2>
      <p>
        At four or five people, the risk is no longer volume, it is ownership. Split by set: one brand or client per
        set, one person accountable for each. Keep the same weekly rhythm, but let each owner fill their own queue and
        have one reviewer cover the week. Add a network only when a named person owns it and can feed it. In our
        experience, a network nobody owns becomes a broken link in the bio within a month.
      </p>

      <h2>Choose the networks you can feed</h2>
      <ul>
        <li>
          <strong>Instagram</strong>: needs media for every post. It is the wrong primary network for a team with no
          photographer.
        </li>
        <li>
          <strong>YouTube</strong>: needs a video and a title. One good video a month beats four rushed ones, in our
          opinion.
        </li>
        <li>
          <strong>TikTok</strong>: needs a person to confirm each post, so it does not fit a fully automated queue.
        </li>
        <li>
          <strong>Pinterest</strong>: needs a board and a still image, and in our experience it rewards a library of
          pins more than a daily post.
        </li>
        <li>
          <strong>Bluesky, X, Threads, LinkedIn and Facebook Pages</strong>: take text, so they are the easiest to keep
          moving on a busy week.
        </li>
      </ul>

      <h2>Batch, queue, repeat</h2>
      <p>
        The queue is the mechanism that makes a cadence survive a bad week. Set weekly time slots for a set, and let a
        post take the next free one. One writing block fills several slots, and the calendar shows where the gaps are
        before they become emergencies. The{" "}
        <Link href="/docs/self-hosted/use#queue" className={link}>
          queue how-to
        </Link>{" "}
        walks through the setup.
      </p>
      <p>
        Three features reduce the amount of new writing a cadence needs. Recurring posts repeat an evergreen post daily,
        weekly or monthly, forever or until a date you set, and they are not for TikTok. RSS and Atom feeds turn new
        items into drafts, queued posts or published posts, which suits a blog that already publishes. The Library keeps
        captions, hashtag groups and media links, so a good post can be reused without rewriting it from memory.
      </p>

      <h2>Measure the few numbers that exist</h2>
      <p>
        SocialReins reads likes and comments on Bluesky, Facebook, Instagram and YouTube, shares on Bluesky and
        Facebook, and views on YouTube. It does not read reach, audience or follower reports yet, so a cadence review
        should not pretend to have them. Look at the posts that started a conversation, the ones that got shared, and
        the ones nobody answered. Then drop the format that never earns a reply.
      </p>
      <p>
        Our opinion: judge a month by three posts you would show a new colleague, not by the number of posts. If the
        cadence produced none, the problem is the material or the network, and posting more will not fix it.
      </p>

      <h2>A cadence that survives a bad week</h2>
      <p>
        Keep one evergreen slot in the queue so a sick day does not leave the account silent. When the week collapses,
        cut to the primary network and the one post that matters, rather than posting nothing everywhere. A smaller
        cadence you keep for a quarter beats a large one you abandon in three weeks. That is the only rule in this
        guide we would defend without asking about your accounts.
      </p>
    </>
  );
}
