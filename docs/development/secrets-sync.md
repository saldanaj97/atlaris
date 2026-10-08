# Secrets sync

1Password Environments are the source of truth for every deployment target. `pnpm secrets:sync` (`scripts/secrets/sync.ts`) pushes one Environment to one target. It only adds and updates: it never deletes or rotates anything, never prints values, and deploys only when asked.

| Target                           | 1Password Environment       | Command                                                                     | Runs from                   |
| -------------------------------- | --------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Worker `atlaris-jobs-staging`    | `atlaris-worker-preview`    | `pnpm secrets:sync cloudflare staging`                                      | Your machine                |
| Worker `atlaris-jobs-production` | `atlaris-worker-production` | GitHub Actions **Sync Production Worker Secrets** (`dry-run`, then `apply`) | GitHub Actions, from `main` |
| Vercel Preview                   | `atlaris-vercel-preview`    | `pnpm secrets:sync vercel preview [--git-branch <branch>]`                  | Your machine                |
| Vercel Production                | `atlaris-vercel-prod`       | `pnpm secrets:sync vercel production`                                       | Your machine                |
| Local development                | `atlaris-local`             | Mounted `.env.local` (not synced)                                           | —                           |

The script maps targets to Environment **IDs**, so renaming an Environment in 1Password does not break it.

## Running it

1. Sign in to the 1Password CLI (`op signin`, unlocked by the desktop app). `op environment read` needs CLI `2.33.0-beta.02` or later.
2. Preview the change: `pnpm secrets:sync <provider> <environment> --dry-run`. It lists each name as `add`, `update`, or `skip` with the reason. Existing values on Vercel are encrypted, so an unchanged value still shows as `update`.
3. Apply: run the same command without `--dry-run`. Production asks for confirmation; `--yes` skips it.

## How values are written

- **Workers:** `wrangler secret bulk`, with the values as JSON on stdin.
- **Vercel:** one upsert per variable through `vercel api` (beta) on `POST /v10/projects/<id>/env`, with the value in the request body on stdin. `vercel env add` is not used: it can't target all Preview branches without an interactive prompt, and it exits 0 without writing when that prompt gets no answer. Existing entries keep their type; new ones are `sensitive`. A write counts only when the API response names the variable.

## When changes take effect

- **Workers:** immediately. `wrangler secret bulk` deploys a new version with the same code; Git deploys keep the secrets.
- **Vercel:** on the next deployment. Add `--redeploy` to redeploy the latest ready deployment of that environment (preview needs `--git-branch`). Production asks first.

## What is never written

| Names                                                         | Why                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POSTGRES_*`, `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`          | Written by the Supabase ↔ Vercel integration (including preview branches)                    |
| `FLAGS`                                                       | Written by the Vercel Flags integration                                                      |
| `VERCEL_*`                                                    | Reserved for Vercel system variables                                                         |
| Any Vercel variable whose existing entry is integration-owned | Same reason; detected from `vercel env ls` (for example the Sentry integration's `SENTRY_*`) |
| Worker: `SENTRY_AUTH_TOKEN`                                   | A Workers Builds build secret; set it in the build settings                                  |
| Worker: `JOBS_PAUSED`, `JOB_*_ENABLED`                        | Dashboard-managed switches (design note, Decision 7)                                         |
| Worker: names declared under `vars` in `wrangler.jsonc`       | A secret may not reuse a var's name; change the var in Git                                   |

Workers reach Supabase through Hyperdrive, not secrets. If the database password rotates, update the Hyperdrive config (`wrangler hyperdrive update`).

## Production Worker workflow

`.github/workflows/worker-secrets-production.yaml` is dispatched by hand from `main` and runs in the `Production – atlaris` GitHub environment. It needs:

| Kind                 | Name                       | Value                                                                                      |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| Environment secret   | `OP_SERVICE_ACCOUNT_TOKEN` | 1Password service account with read access to `atlaris-worker-production` only             |
| Environment secret   | `CLOUDFLARE_API_TOKEN`     | Cloudflare API token limited to **Account → Workers Scripts: Edit** on the Atlaris account |
| Environment variable | `CLOUDFLARE_ACCOUNT_ID`    | The Cloudflare account ID (not a secret)                                                   |

Run it with `dry-run` first, then `apply`.
