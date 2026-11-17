# Contributing to SocialReins

Thanks for helping. SocialReins lives in two public repos, and this guide covers both:

| Repo | What it is | Stack |
|---|---|---|
| [socialreins](https://github.com/socialreins/socialreins) | The website and the app, and the main repo | Next.js 16, TypeScript, Node 24 |
| [brain](https://github.com/socialreins/brain) | The API server: posting, inbox, automations, auth | Rust, Postgres |

## Before you start

- **Small fix** (a typo, a clear bug, a missing test): open a pull request straight away.
- **Anything bigger** (a feature, a new platform, a change to how something works): open an issue first and wait for a maintainer to agree on the approach. It saves you from writing code we can't merge.
- **Looking for something to do?** Issues labelled [`good first issue`](https://github.com/socialreins/socialreins/labels/good%20first%20issue) and [`help wanted`](https://github.com/socialreins/socialreins/labels/help%20wanted) are open for anyone. Comment on the issue to say you're taking it.
- **Security problems**: never in an issue or pull request. Follow [SECURITY.md](SECURITY.md).

Issues go in socialreins unless you know the problem is in the API, then brain.

## Set up

One clone gets both repos (brain is a git submodule in `brain/`):

```sh
git clone --recurse-submodules https://github.com/socialreins/socialreins
cd socialreins
```

### The web app (this repo)

Needs Node 24.

```sh
cp .env.example .env.local    # BRAIN_URL: where brain runs, http://localhost:8080 by default
npm ci
npm run dev                   # http://localhost:3000
```

### brain

Needs Rust (stable) and Docker.

```sh
cd brain
docker compose up -d postgres
export DATABASE_URL=postgres://brain:brain@localhost:5432/socialreins_brain
export MAIL_LOG=true                              # sign-in links go to the log
export ENCRYPTION_KEY=$(openssl rand -base64 32)
cargo run -p socialreins-brain                    # http://localhost:8080
```

With both running, open http://localhost:3000 and sign in with an email link; with `MAIL_LOG=true` the link is printed in brain's log. You don't need any social platform app to work on most of the code. Bluesky connects with an app password, so it's the easiest network to test with.

## Making a change

1. **Fork** the repo you're changing on GitHub, add your fork as a remote and create a branch from `main`. Name the branch after the change: `fix/calendar-timezone`, `feat/threads-polls`, `docs/self-host-proxy`.

   ```sh
   # web: from the socialreins folder
   git remote add fork https://github.com/<you>/socialreins
   git switch -c fix/calendar-timezone

   # brain: the submodule starts on a bare commit, so start from main
   cd brain
   git remote add fork https://github.com/<you>/brain
   git switch main && git pull && git switch -c fix/post-retry
   ```

   Push with `git push -u fork <branch>`.
2. **Keep it to one change.** Two unrelated fixes are two pull requests.
3. **Add tests** for new behaviour and for the bug you fixed.
   - web: unit tests in `tests/unit` (Vitest), browser tests in `tests/e2e` (Playwright).
   - brain: every new or changed endpoint gets a request test in `app/tests/` against a real Postgres.
4. **Run the checks** before you push (CI runs the same ones):

   web:
   ```sh
   npm run lint && npm run typecheck && npm test
   npm run build && npm run test:e2e
   ```

   brain:
   ```sh
   cargo fmt --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   ```

5. **Open a pull request** against `main` and fill in the template.

### A change that needs both repos

When the web app needs something new from the API:

1. Open the brain pull request first. It gets reviewed and merged on its own.
2. Then open the web pull request. If it relies on the new API, also bump the submodule in it: `git submodule update --remote brain`, and commit `brain`.

Link the two pull requests to each other in their descriptions.

## Pull request titles and commits

Write the title as `Area: what changed`, in plain words a user would follow:

- `Post editor: file size limits in the hints`
- `Inbox: a comment under a Facebook Reel finds its post`
- `X: long posts for accounts with a paid plan`

Pull requests are squash merged, so the title becomes the commit on `main`. Commits inside your branch can be anything; don't rewrite history once a review has started.

In the description, say what changed and why, how you tested it, and add a screenshot for anything visible.

## House rules

These are checked in review, and some by CI:

- **No em dashes** anywhere: code, comments, docs, copy, commit messages. Use a comma, a colon or two sentences. brain's CI fails on one.
- **No secrets** in code, tests, logs or screenshots. `.env` files are gitignored; `.env.example` holds names only. In web, anything named `NEXT_PUBLIC_*` reaches the browser, so never put a secret there.
- **No new dependency** without a reason in the pull request description.
- **Copy states facts.** No made-up prices, user counts, testimonials or dates.
- web: this is Next.js 16 (App Router). APIs differ from older versions; check `node_modules/next/dist/docs/` before you write code.
- brain: log with `tracing` only. Clippy denies `println!`, `eprintln!`, `dbg!`, `todo!` and `unimplemented!`.
- Each repo's `AGENTS.md` has the full rules and a map of the code. Read it if you use an AI coding assistant, and point the assistant at it.

## Review and merge

1. CI must pass. On your first pull request a maintainer has to approve the CI run before it starts, so don't worry if it waits.
2. A maintainer reviews it, usually within a few days. Reply to each comment, push fixes as new commits, and re-request review.
3. A maintainer squash merges it. The branch is deleted on merge.
4. `main` deploys to socialreins.com automatically after CI passes, so your change is live soon after the merge.

A pull request with no reply for 30 days after a review may be closed. You can reopen it any time.

## License

SocialReins is licensed under [AGPL-3.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
