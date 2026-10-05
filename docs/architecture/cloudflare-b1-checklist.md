# Cloudflare B1 Setup Checklist

**Audience:** The account owner performing JCS-120 phase B1 by hand. Agents never perform these steps.
**Last Updated:** October 2026

Every name and setting here comes from [cloudflare-jobs-runtime.md](./cloudflare-jobs-runtime.md) ("Exact Cloudflare resources for B1"). If a dashboard screen differs from what is described, stop and report the difference instead of improvising.

## Rules

- Never paste secret values into chat, Linear, GitHub, or any file. Copy back only names, IDs, URLs, and pass/fail results.
- Store every new secret value in 1Password before entering it anywhere else.
- Create only the resources listed here. Workflows, Cron Triggers, Queue consumers, and the Workers' custom-domain DNS records come from Wrangler configuration through Workers Builds; do not create them by hand unless a step says so.
- Agents never touch Squarespace, Vercel DNS, Cloudflare DNS, or nameservers. Part A0 is yours alone.
- Do the parts in order. Each part says when to run it.
  - Part A0 can run any time before B2's first deploy, but it must be finished (zone **Active**) before Part B.

## Part A0: Move `atlaris.app` DNS to Cloudflare (run first)

Decided 2026-10-05:

- The whole `atlaris.app` zone moves from Vercel DNS to Cloudflare on the Free plan, so the Worker can use custom domains.
- The registrar stays Squarespace. Only the nameservers change (today `ns1.vercel-dns.com`, `ns2.vercel-dns.com`).
- Vercel keeps hosting the app. App records stay DNS only (grey cloud).

### A0.1. Export every Vercel DNS record

1. Open the Vercel dashboard → **Domains** → `atlaris.app` → **DNS Records**. Export the list, or screenshot every row with its type, name, value, TTL, and priority. Include:
   - the apex `A` records;
   - `www` (public lookups on 2026-10-05 show `A` records to Vercel IPs);
   - every Resend record for the sending domain (`TXT`, `CNAME`, `MX`);
   - any Vercel, Google, or other verification `TXT`, and any `CAA`.
2. In the Vercel project `atlaris` → **Settings** → **Domains**, list every domain attached for `atlaris.app`. Note whether a wildcard `*.atlaris.app` is attached. On 2026-10-05, Vercel's nameserver answered an arbitrary subdomain with Vercel IPs, so check for a `*` record too.
3. Confirm no record named `workers` or `workers-staging` exists. A Workers Custom Domain cannot be created on a hostname that already has a `CNAME` record.

**Verify:** the export includes the apex and `www`, and you have written down yes/no for "`*` record exists" and "`*.atlaris.app` attached to a Vercel project".

### A0.2. Add the zone to Cloudflare

1. Cloudflare dashboard → **Domains** (`https://dash.cloudflare.com/?to=/:account/domains/overview`) → **Onboard a domain**.
2. Enter `atlaris.app`, let the quick scan import records, then choose the **Free** plan.
3. Compare the imported **DNS Records** with the A0.1 export line by line. Add anything missing with the exact type, name, and value. The quick scan is not guaranteed to find every record.
4. If A0.1 found a `*` record, add it the same way.
5. If a Vercel project uses `*.atlaris.app`, add two `NS` records named `_acme-challenge`, with values `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Vercel needs them to keep renewing the wildcard certificate once DNS moves.

**Verify:** Cloudflare's **DNS Records** table matches the A0.1 export, plus `_acme-challenge` if it applies.

### A0.3. Keep app traffic off the Cloudflare proxy

Set every record that points at Vercel (apex, `www`, any `*`) to **DNS only** (grey cloud). Email and verification records are DNS only as well. Do not proxy app traffic through Cloudflare.

**Verify:** no record in the table shows an orange cloud.

### A0.4. Change nameservers at Squarespace

1. Check DNSSEC first: `dig +short DS atlaris.app` returned nothing on 2026-10-05, which means it is off. Also confirm DNSSEC is off in Squarespace's domain settings. If it is on, turn it off and wait for the DS record to disappear before continuing; changing nameservers with DNSSEC active can make the domain unreachable.
2. Copy the two nameservers from the Cloudflare zone's **Overview** page.
3. In Squarespace → **Domains** → `atlaris.app` → nameserver settings, replace `ns1.vercel-dns.com` and `ns2.vercel-dns.com` with the two Cloudflare nameservers, copied exactly.

**Verify:** Squarespace shows only the two Cloudflare nameservers.

### A0.5. Wait for Active, then check the app and email

**Verify:**

1. The Cloudflare zone **Overview** shows **Active**.
2. `dig +short NS atlaris.app` returns the two Cloudflare nameservers.
3. `https://atlaris.app` and `https://www.atlaris.app` load the app.
4. The Vercel project's **Domains** page shows `atlaris.app` and `www` as valid, not "Invalid Configuration".
5. The Resend dashboard still shows the sending domain as **Verified**.
6. One test email sent through Resend arrives.

### A0.6. Copy back

The zone status, the two nameserver names, "all records present" yes/no, whether a `*` record or `_acme-challenge` delegation was added, and the A0.5 results.

### A0 stop and report

- A record that the scan did not import and that you cannot identify.
- Resend shows the domain unverified after propagation.
- Vercel shows `atlaris.app` or `www` as misconfigured.
- The app does not load after the zone is **Active**.

## Part A: Account resources (run now)

### A1. Account details

1. Open **Workers & Pages** (`https://dash.cloudflare.com/?to=/:account/workers-and-pages`) → **Overview**.
2. In **Account details**, confirm the plan is **Workers Free**.
3. Note the **Account ID** and **Your subdomain**. The `workers.dev` subdomain is only used to confirm in B5 that `workers.dev` is disabled.

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
   - Staging reuses the `develop` Preview's OpenRouter and Resend keys (decided 2026-10-05); production uses the app's Production values.

**Verify:** each 1Password item holds `JOBS_SIGNING_SECRET`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, and `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`.

**Copy back:** "secrets stored" (no values).

### A7. Sentry project and auth token

The Worker reports to its own Sentry project, separate from the app's `atlaris` project (decided 2026-10-05).

1. In Sentry org `jcs-software`, open **Projects** → **Create Project**.
2. Choose platform **Cloudflare Workers** and name the project `atlaris-jobs`. Do not add alert rules now; cron monitors are created by the Worker's first check-ins.
3. Open the new project → **Settings** → **Client Keys (DSN)** and copy the DSN. A DSN is not a secret; it goes into `wrangler.jsonc` as `SENTRY_DSN` for both environments.
4. Create the build token:
   - Open **Settings** → **Organization Tokens** → **Create New Token**.
   - Name it `cloudflare-workers-builds`.
   - Store it in 1Password as `SENTRY_AUTH_TOKEN`. One token serves both Workers.
   - The token must be able to create releases and upload source maps for `atlaris-jobs`. Organization tokens are not limited to one project.
   - If you use a different token type, give it release write access to `atlaris-jobs`.

**Verify:** the `atlaris-jobs` project is listed in `jcs-software`, its Client Keys page shows a DSN, and the token is listed under **Organization Tokens**.

**Copy back:** the project slug and the DSN; "token created" (no value).

### A8. Vercel environment variables

Vercel → project `atlaris` → **Settings** → **Environment Variables** → **Add**:

| Name | Environment | Value |
| --- | --- | --- |
| `JOBS_WORKER_URL` | Preview, branch `develop` only | `https://workers-staging.atlaris.app` |
| `JOBS_SIGNING_SECRET` (mark Sensitive) | Preview, branch `develop` only | Staging `JOBS_SIGNING_SECRET` from A6 |
| `JOBS_WORKER_URL` | Production | `https://workers.atlaris.app` |
| `JOBS_SIGNING_SECRET` (mark Sensitive) | Production | Production `JOBS_SIGNING_SECRET` from A6 |

No redeploy is needed now; the app does not read these until B4. The hostnames can be set before the Workers exist.

**Verify:** four entries are listed with the environment scoping above.

**Copy back:** "Vercel variables set".

## Part B: Staging Worker (run when the orchestrator says B2's Worker code is on the staging branch and A0 is Active)

The staging branch is the Track B parent branch `feature/jcs-120-move-atlaris-background-jobs-to-cloudflare-workers` until Track B first merges into `develop`; after that merge it becomes `develop` (decided 2026-10-05). The build and deploy commands below were confirmed by B2 (`pnpm workers check` runs the same `wrangler deploy --dry-run` from `workers/jobs`).

B2's `wrangler.jsonc` declares the custom domain `workers-staging.atlaris.app` and `workers_dev: false`. The deploy attaches the domain; B5 verifies it.

### B1. Create the Worker from the repository

1. **Workers & Pages** → **Create application** → **Get started** next to **Import a repository**.
2. Select the GitHub account. If asked to install the Cloudflare GitHub app, grant access to **only** `saldanaj97/atlaris`.
3. Select `saldanaj97/atlaris` and configure:

   | Setting | Value |
   | --- | --- |
   | Project (Worker) name | `atlaris-jobs-staging` |
   | Root directory | `workers/jobs` |
   | Build command | `cd ../.. && pnpm install --frozen-lockfile` |
   | Deploy command | `npx wrangler deploy --env staging --var SENTRY_RELEASE:$WORKERS_CI_COMMIT_SHA` |

4. Select **Save and Deploy**. A first build can start right away and fail until steps B2–B4 are done. That is expected.

### B2. Build settings

On the Worker, open **Settings** → **Build**:

1. **Branch control:**
   - Set the production branch to `feature/jcs-120-move-atlaris-background-jobs-to-cloudflare-workers`.
   - **Uncheck Enable Preview Builds.**
   - When the orchestrator reports that Track B has first merged into `develop`, return here, change the production branch to `develop`, and copy back the time of the change.
2. **Build variables and secrets:**

   | Name | Type | Value |
   | --- | --- | --- |
   | `PNPM_VERSION` | Variable | `11.9.0` |
   | `NODE_VERSION` | Variable | `24` |
   | `SKIP_DEPENDENCY_INSTALL` | Variable | `true` |
   | `SENTRY_AUTH_TOKEN` | Secret | From A7 |

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
2. If the build log shows an authorization error while deploying Hyperdrive, Queue, or Workflow bindings, or the custom domain:
   - In **My Profile** → **API Tokens**, edit the Workers Builds token, or create a user token from the **Edit Cloudflare Workers** template.
   - Add the permissions the error names.
   - Select that token in **Settings** → **Build** → **API token**, then retry.

**Verify:**

1. Build history shows a successful build for the expected commit.
2. **Deployments** shows a new active version from that build.
3. **Settings** → **Bindings** shows `HYPERDRIVE` → `atlaris-jobs-db-staging`.
4. **Settings** → **Triggers** lists the Cron Triggers B2 ships (`*/15 * * * *`). New triggers can take up to 15 minutes to propagate.

### B5. Custom domain and `workers.dev`

1. On the Worker, open **Settings** → **Domains & Routes**.
2. Confirm `workers-staging.atlaris.app` is listed as a **Custom Domain** and `workers.dev` is disabled.
3. If the custom domain is missing: **Add** → **Custom Domain** → `workers-staging.atlaris.app` → **Add Custom Domain**.
4. If `workers.dev` is still enabled: select **Disable** on its row. The next deploy keeps both settings, because they match `wrangler.jsonc`.

**Verify:**

1. The `atlaris.app` zone's **DNS Records** shows a Worker record for `workers-staging`, created by Cloudflare.
2. `curl -sS https://workers-staging.atlaris.app/healthz` returns `{"ok":true,…}`.
3. `curl -s -o /dev/null -w '%{http_code}\n' https://atlaris-jobs-staging.<subdomain>.workers.dev/healthz` does not return `200`.
4. **Observability** shows at least one cron invocation within 30 minutes.
5. The Sentry check in B2's receipt passes in the `atlaris-jobs` project.

### B6. Rate-limiting rule (once, after the first custom domain is attached)

The Free plan allows one rate-limiting rule per zone. It can match only on path and verified-bot fields, counts per IP, and uses a 10-second period and a 10-second block. Because it cannot match on host, one rule covers `/v1/` on both Worker hostnames. App hostnames are DNS only and never pass through it.

1. In the `atlaris.app` zone, open **Security rules** (`https://dash.cloudflare.com/?to=/:account/:zone/security/security-rules`) → **Create rule** → **Rate limiting rules**.
2. Configure:

   | Setting | Value |
   | --- | --- |
   | Rule name | `jobs-worker-v1` |
   | Field / Operator / Value | **URI Path** / **starts with** / `/v1/`. If **starts with** is not offered, use **wildcard** with `/v1/*`. If neither is offered, stop and report |
   | With the same characteristics | **IP** |
   | When rate exceeds | `100` requests per `10 seconds` |
   | Then take action | **Block** |
   | Duration | `10 seconds` |

3. Select **Deploy**.

**Verify:** the rule is listed as active. Then run this burst test:

```bash
for i in $(seq 1 130); do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://workers-staging.atlaris.app/v1/ping; done | sort | uniq -c
```

Roughly the first 100 requests get the Worker's `401` or `404`; the rest get `429`.

**Copy back (Part B):**

- the custom domain URL;
- the build ID and result;
- pass/fail for each B4 and B5 verification item;
- "rule deployed" and the burst-test counts.

## Part C: Production Worker (run when the orchestrator says Track B's Worker code is on `main`)

Repeat B1–B5 with these changes. Do **not** create a second rate-limiting rule; `jobs-worker-v1` already covers production's `/v1/` paths.

| Setting | Production value |
| --- | --- |
| Worker name | `atlaris-jobs-production` |
| Deploy command | `npx wrangler deploy --env production --var SENTRY_RELEASE:$WORKERS_CI_COMMIT_SHA` (confirm with the receipt) |
| Production branch | `main` |
| `JOBS_SIGNING_SECRET` | Production value from A6 |
| Other secrets | Production values from A6 |
| Bindings check | `HYPERDRIVE` → `atlaris-jobs-db-production` |
| Custom domain | `workers.atlaris.app` |
| Health check | `https://workers.atlaris.app/healthz` |
| `workers.dev` check | `https://atlaris-jobs-production.<subdomain>.workers.dev/healthz` does not return `200` |

Production Cron Triggers start firing as soon as this deploys. Every job stays a no-op until its switch is set at that job's cutover, which needs its own approval.

**Copy back:** the same items as Part B, for production (no burst test needed).

## Copy-back summary

| Item | From step | Example |
| --- | --- | --- |
| Zone status, Cloudflare nameservers, all records present, `*`/`_acme-challenge` added | A0 | Active, `…ns.cloudflare.com`, yes, no |
| Account ID | A1 | `0123…` |
| `workers.dev` subdomain | A1 | `example` |
| Staging Hyperdrive ID and connection type | A3 | `abcd…`, direct |
| Production Hyperdrive ID and connection type | A4 | `ef01…`, session pooler |
| Queues created | A5 | yes |
| Secrets stored in 1Password (names only) | A6 | yes |
| Sentry project slug and DSN; token created | A7 | `atlaris-jobs`, `https://…@….ingest.us.sentry.io/…` |
| Vercel variables set | A8 | yes |
| Time the staging branch switched to `develop` | B2 (later) | — |
| Staging build ID and verification results | B4, B5 | — |
| Rate-limiting rule deployed; burst-test counts | B6 | yes; `100 401`, `30 429` |
| Production build ID and verification results | C | — |

## Stop and report

- Any A0 stop condition.
- Neither Supabase connection string passes the Hyperdrive connection test.
- Any screen requires upgrading to Workers Paid.
- The Worker name, branch, root directory, or custom domain cannot be set as listed.
- A build fails for a reason other than the expected first-build failure or a token permission named in B4.
