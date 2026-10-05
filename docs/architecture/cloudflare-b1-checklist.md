# Cloudflare B1 Setup Checklist

**Audience:** The account owner performing JCS-120 phase B1 by hand. Agents never perform these steps.
**Last Updated:** October 2026

Every name and setting here comes from [cloudflare-jobs-runtime.md](./cloudflare-jobs-runtime.md) ("Exact Cloudflare resources for B1"). If a dashboard screen differs from what is described, stop and report the difference instead of improvising.

## Rules

- Never paste secret values into chat, Linear, GitHub, or any file. Copy back only names, IDs, URLs, and pass/fail results.
- Store every new secret value in 1Password before entering it anywhere else.
- Create only the resources listed here. Workflows, Cron Triggers, and Queue consumers come from Wrangler configuration through Workers Builds; do not create them by hand.
- Do the parts in order. Each part says when to run it.

## Part A: Account resources (run now)

### A1. Account details

1. Open **Workers & Pages** (`https://dash.cloudflare.com/?to=/:account/workers-and-pages`) → **Overview**.
2. In **Account details**, confirm the plan is **Workers Free**.
3. Note the **Account ID** and **Your subdomain** (the `workers.dev` subdomain). If no subdomain is set, select **Change** and pick one.

**Verify:** both values are shown on the Overview page.

**Copy back:** Account ID and `workers.dev` subdomain (neither is secret).

### A2. Supabase connection strings (read only)

For each Supabase project, `atlaris-dev` (staging) and `atlaris-prod` (production):

1. Supabase dashboard → project → **Connect**.
2. Find the **Direct connection** string (`postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres`).
3. Find the **Session pooler** string (`postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@<pooler-host>:5432/postgres`) as the fallback.
4. Get the database password from 1Password. Fill it into the string only inside the Cloudflare form in A3/A4; never save the filled string anywhere else.

Do not use the transaction pooler (port `6543`) for Hyperdrive.

### A3. Hyperdrive configuration: staging

1. Open **Hyperdrive** (`https://dash.cloudflare.com/?to=/:account/workers/hyperdrive`) → **Create configuration**.
2. Name: `atlaris-jobs-db-staging`.
3. Connection: the `atlaris-dev` **Direct connection** string with the password filled in.
4. Select **Create**. Hyperdrive tests the connection before it saves.
   - If the connection test fails, repeat with the **Session pooler** string from A2. Supabase Free direct connections are IPv6-only.
   - If both fail, stop and report the error text. A "connection refused" error can mean Supabase Network Restrictions are on; do not change them without a decision.
5. Turn query caching off: open the configuration → **Settings** → caching → **Disable**. If the dashboard has no caching control, run in a terminal: `npx wrangler login`, then `npx wrangler hyperdrive update <HYPERDRIVE_ID> --caching-disabled`.

**Verify:** the configuration is listed, its settings show caching disabled, and the origin host matches `atlaris-dev`.

**Copy back:** the Hyperdrive ID (shown on the configuration page), and whether **direct** or **session pooler** worked.

### A4. Hyperdrive configuration: production

Repeat A3 with:

- Name: `atlaris-jobs-db-production`
- Supabase project: `atlaris-prod`

**Verify:** listed, caching disabled, origin host matches `atlaris-prod`.

**Copy back:** the Hyperdrive ID and the connection type that worked.

### A5. Queues

1. Open **Queues** (`https://dash.cloudflare.com/?to=/:account/workers/queues`) → **Create queue**.
2. Create `atlaris-regeneration-staging` with default settings. Do not add a consumer.
3. Create `atlaris-regeneration-production` the same way.

**Verify:** both queues are listed with 0 messages and no consumer. On Workers Free, retention is fixed at 24 hours.

**Copy back:** "both queues created".

### A6. New secrets in 1Password

Create one 1Password item per environment, for example `Atlaris jobs Worker – staging` and `Atlaris jobs Worker – production`.

1. **`JOBS_SIGNING_SECRET`.** Generate a new value per environment with 1Password's generator: 64 characters, letters and digits. Never reuse the staging value in production.
2. **Existing values to collect** for the same environment, taken from the app's Vercel environment or its 1Password item:
   - `OPENROUTER_API_KEY`
   - `RESEND_API_KEY`
   - `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`. This must be **exactly** the app's value for that environment; the app verifies unsubscribe tokens the Worker signs.
   - Staging uses the `develop` Preview's values unless you decide on separate staging keys (design note, open question 6).
3. **Sentry auth token.** In Sentry, open **Settings** → **Organization Tokens** → **Create New Token**, name it `cloudflare-workers-builds`, and store it in 1Password as `SENTRY_AUTH_TOKEN`. One token serves both Workers.

**Verify:** each 1Password item holds `JOBS_SIGNING_SECRET`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, and `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`, and the Sentry token item exists.

**Copy back:** "secrets stored" (no values).

### A7. Vercel environment variables

Vercel → project `atlaris` → **Settings** → **Environment Variables** → **Add**:

| Name | Environment | Value |
| --- | --- | --- |
| `JOBS_WORKER_URL` | Preview, branch `develop` only | `https://atlaris-jobs-staging.<subdomain>.workers.dev` |
| `JOBS_SIGNING_SECRET` (mark Sensitive) | Preview, branch `develop` only | Staging `JOBS_SIGNING_SECRET` from A6 |
| `JOBS_WORKER_URL` | Production | `https://atlaris-jobs-production.<subdomain>.workers.dev` |
| `JOBS_SIGNING_SECRET` (mark Sensitive) | Production | Production `JOBS_SIGNING_SECRET` from A6 |

No redeploy is needed now; the app does not read these until B4.

**Verify:** four entries are listed with the environment scoping above.

**Copy back:** "Vercel variables set".

## Part B: Staging Worker (run when the orchestrator says B2's Worker code is on the staging branch)

The staging branch is `develop`, or the Track B parent branch `feature/jcs-120-move-atlaris-background-jobs-to-cloudflare-workers` if you choose that in open question 1 of the design note. Use the exact build and deploy commands from B2's receipt; the expected values are shown below.

### B1. Create the Worker from the repository

1. **Workers & Pages** → **Create application** → **Get started** next to **Import a repository**.
2. Select the GitHub account. If asked to install the Cloudflare GitHub app, grant access to **only** `saldanaj97/atlaris`.
3. Select `saldanaj97/atlaris` and configure:

   | Setting | Value |
   | --- | --- |
   | Project (Worker) name | `atlaris-jobs-staging` |
   | Root directory | `workers/jobs` |
   | Build command | `cd ../.. && pnpm install --frozen-lockfile` (expected; confirm with B2's receipt) |
   | Deploy command | `npx wrangler deploy --env staging --var SENTRY_RELEASE:$WORKERS_CI_COMMIT_SHA` (expected; confirm with B2's receipt) |

4. Select **Save and Deploy**. A first build can start right away and fail until steps B2–B4 are done. That is expected.

### B2. Build settings

On the Worker, open **Settings** → **Build**:

1. **Branch control:** set the production branch to the staging branch named above, and **uncheck Enable Preview Builds**.
2. **Build variables and secrets:**

   | Name | Type | Value |
   | --- | --- | --- |
   | `PNPM_VERSION` | Variable | `11.9.0` |
   | `NODE_VERSION` | Variable | `24` |
   | `SKIP_DEPENDENCY_INSTALL` | Variable | `true` |
   | `SENTRY_AUTH_TOKEN` | Secret | From A6 |

3. **Build watch paths:**
   - Include: `workers/*`, `src/*`, `supabase/*`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`
   - Exclude: `docs/*`, `tests/*`

**Verify:** the Build settings page shows these values; **Enable Preview Builds** is unchecked.

### B3. Runtime secrets

On the Worker, open **Settings** → **Variables and Secrets** → **Add**. Choose type **Secret** for each:

- `JOBS_SIGNING_SECRET` (staging value)
- `OPENROUTER_API_KEY`
- `RESEND_API_KEY`
- `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`

Select **Deploy**.

Do not add any `JOB_*_ENABLED` or `JOBS_PAUSED` variables now. Each later phase sets its own switch at cutover; absent means off.

**Verify:** all four names are listed with hidden values.

### B4. Run the build

1. **Deployments** → **View build history** → select the latest build → **Retry build**. You can also wait for the next push to the staging branch.
2. If the build log shows an authorization error while deploying Hyperdrive, Queue, or Workflow bindings:
   - In **My Profile** → **API Tokens**, edit the Workers Builds token, or create a user token from the **Edit Cloudflare Workers** template.
   - Add the permissions the error names.
   - Select that token in **Settings** → **Build** → **API token**, then retry.

**Verify:**

1. Build history shows a successful build for the expected commit.
2. **Deployments** shows a new active version from that build.
3. `curl -sS https://atlaris-jobs-staging.<subdomain>.workers.dev/healthz` returns `{"ok":true,…}`.
4. **Settings** → **Bindings** shows `HYPERDRIVE` → `atlaris-jobs-db-staging`.
5. **Settings** → **Triggers** lists the Cron Triggers B2 ships (`*/15 * * * *`). New triggers can take up to 15 minutes to propagate.
6. **Observability** shows at least one cron invocation within 30 minutes, and the Sentry check B2's receipt describes passes.

**Copy back:** the Worker URL, the build ID and result, and pass/fail for each verification item.

## Part C: Production Worker (run when the orchestrator says Track B's Worker code is on `main`)

Repeat Part B with these changes:

| Setting | Production value |
| --- | --- |
| Worker name | `atlaris-jobs-production` |
| Deploy command | `npx wrangler deploy --env production --var SENTRY_RELEASE:$WORKERS_CI_COMMIT_SHA` (confirm with the receipt) |
| Production branch | `main` |
| `JOBS_SIGNING_SECRET` | Production value from A6 |
| Other secrets | Production values from A6 |
| Bindings check | `HYPERDRIVE` → `atlaris-jobs-db-production` |
| Health check | `https://atlaris-jobs-production.<subdomain>.workers.dev/healthz` |

Production Cron Triggers start firing as soon as this deploys. Every job stays a no-op until its switch is set at that job's cutover, which needs its own approval.

**Copy back:** the same items as Part B, for production.

## Copy-back summary

| Item | From step | Example |
| --- | --- | --- |
| Account ID | A1 | `0123…` |
| `workers.dev` subdomain | A1 | `example` |
| Staging Hyperdrive ID and connection type | A3 | `abcd…`, direct |
| Production Hyperdrive ID and connection type | A4 | `ef01…`, session pooler |
| Queues created | A5 | yes |
| Secrets stored in 1Password (names only) | A6 | yes |
| Vercel variables set | A7 | yes |
| Staging Worker URL, build ID, verification results | B4 | — |
| Production Worker URL, build ID, verification results | C | — |

## Stop and report

- Neither Supabase connection string passes the Hyperdrive connection test.
- Any screen requires upgrading to Workers Paid.
- The Worker name, branch, or root directory cannot be set as listed.
- A build fails for a reason other than the expected first-build failure or a token permission named in B4.
