# Agent sessions (Clerk Agent Tasks)

`scripts/dev/agent-session.ts` signs a coding agent in to Atlaris as a test user. It uses Clerk [Agent Tasks](https://clerk.com/docs/guides/development/testing/agent-tasks) (beta). Agents doing browser QA, eval checks or end-to-end runs use it instead of passwords, OTP codes, sign-in tokens or hand-made session cookies.

The script creates an Agent Task for the tier's test user and prints a one-time URL. Opening that URL in a browser creates a Clerk session and redirects to the route you asked for.

## Run it

On a laptop, the Clerk keys come from the local 1Password Environment, the same one `pnpm dev` uses. Cloud sessions get them from environment variables instead; see [Cloud sessions](#cloud-sessions). Local and staging share one Clerk Development instance, so the same keys serve both.

```bash
source ~/.config/atlaris/dev.sh
"$OP_EXECUTABLE" run --environment "$OP_ENVIRONMENT_ID" --no-masking -- \
  pnpm exec tsx scripts/dev/agent-session.ts --env staging --tier pro --path /settings/ai
```

| Option                        | Meaning                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--env <local\|staging>`      | `local` redirects to `portless get atlaris`, or to `--base`, which must be `localhost` or `*.localhost`. `staging` redirects to `https://staging.atlaris.app`. |
| `--tier <free\|starter\|pro>` | Signs in as `agent-<tier>@atlaris.app`                                                                                                                         |
| `--path <route>`              | Landing route, default `/dashboard`                                                                                                                            |
| `--revoke <agentTaskId>`      | Revokes a task that has not been used yet                                                                                                                      |

`--no-masking` is needed because `op run` masks any output that matches an injected value, including short ones such as `true`, and that corrupts the JSON. The script never prints a key.

stdout is JSON: `env`, `tier`, `email`, `userId`, `userCreated`, `agentTaskId`, `redirectUrl` and `url`. Treat `url` as a credential. It signs in whoever opens it, so don't paste it into PRs, issues or logs.

## Use the URL

- **Headless Playwright:** `await page.goto(session.url)`, then `await page.waitForURL((u) => u.origin === origin && !u.search.includes('__clerk'))`. The page is now signed in. Same-origin `fetch('/api/v1/...')` calls from the page are authenticated too.
- **Interactive browser:** open `url` once.
- Each task works **once**. A second visit returns `agent_task_already_used`. In testing, the link stayed valid for an hour (the ticket's `eis` claim). The session lasts 30 minutes, which is Clerk's default.

## Safety

The script fails closed. It refuses to run unless all of these hold:

- `CLERK_SECRET_KEY` starts with `sk_test_`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` starts with `pk_test_`.
- The publishable key's Frontend API ends in `.clerk.accounts.dev`. Production uses `clerk.atlaris.app`.
- The redirect host matches `--env`.

It never touches the production instance, production users or production hosts.

## Users and tiers

The script finds `agent-<tier>@atlaris.app` on the Development instance and creates the user on first use. `atlaris.app` is the only domain on the instance allowlist. A new user is Free. The app reads the tier from the Postgres projection, so Starter and Pro users need their tier set once:

- **Local:** sign in once so the app creates the `users` row, then run `pnpm db fixture --user-id <userId> --plan <tier>`.
- **Staging:** put the user on a $0 Starter or Pro subscription on the Development instance. The production QA users got theirs from a $0 custom price and a price transition. The Clerk Billing webhook then updates staging's projection.

On every non-free run the script reminds you of this on stderr.

## Limits

- **Local runs need real Clerk mode.** The default `atlaris-local` Environment sets `LOCAL_PRODUCT_TESTING=true` and `DEV_AUTH_USER_ID`. In that mode the app is already signed in as the seeded user and ignores Clerk sessions. Shell variables don't override `op run`, so start Next with the overrides inside the child:

  ```bash
  "$OP_EXECUTABLE" run --environment "$OP_ENVIRONMENT_ID" -- \
    /usr/bin/env -u OP_SERVICE_ACCOUNT_TOKEN -u DEV_AUTH_USER_ID LOCAL_PRODUCT_TESTING=false \
    node_modules/.bin/next dev --webpack --hostname localhost --port 3183
  ```

  Then pass `--env local --base http://localhost:3183`.

- **Staging is behind Vercel deployment protection.** After Clerk signs the browser in, `staging.atlaris.app` still redirects to the Vercel login unless the browser has Vercel access. Two options:
  - Use a browser that is signed in to Vercel.
  - Send `x-vercel-protection-bypass` from automation, scoped to `staging.atlaris.app` requests.
- The desktop app's built-in browser pane accepts the ticket but blocks the redirect to `localhost`. Use Playwright for local runs.
- The grounded eval runner (`scripts/eval/grounded/run.ts`) calls the API with bearer tokens from BAPI sessions, not through a browser, so it does not use this script.

## Cloud sessions

Tested in a Claude Code cloud session on 2026-10-23.

- **Keys:** the cloud environment's variables supply `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Don't use `op run` or `--no-masking`; call the script directly with `pnpm exec tsx scripts/dev/agent-session.ts …`.
- **Database:** run `pnpm db agent up`. The session runs as root, so it relies on `SUPABASE_NATIVE_POSTGRES_USER=ubuntu`, which the environment sets.
- **Dev server:** start it in real Clerk mode, then run the script with `--env local --base http://localhost:3183`:

  ```bash
  env -u DEV_AUTH_USER_ID LOCAL_PRODUCT_TESTING=false \
    node_modules/.bin/next dev --webpack --hostname localhost --port 3183
  ```

- **Playwright:**
  - Import from `@playwright/test`. The standalone `playwright` package isn't installed.
  - Launch with `executablePath: '/opt/pw-browsers/chromium'`. `@playwright/test` 1.64 expects headless-shell build 1248, but the image only has build 1243.
  - Don't run `playwright install`.
- **Result:** a fresh link landed on `/dashboard`, and `/api/v1/user/profile` returned 200 with `agent-free@atlaris.app` / `free`.
- **Teardown:** stop the dev server, then run `pnpm db stop`. `next dev` rewrites the block at the bottom of `AGENTS.md`; revert it if you won't commit it.
