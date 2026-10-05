# Jobs Worker local development

The background jobs Worker lives in `workers/jobs/` (Cloudflare Workers, Wrangler). Locally it runs under `wrangler dev` (workerd) against this worktree's native Supabase stack. Design and environments: [Cloudflare Workers job runtime](../architecture/cloudflare-jobs-runtime.md).

## Local loop

1. Start this worktree's database. This writes the loopback `POSTGRES_URL` into `.env.local`:

   ```bash
   pnpm db start
   ```

   Codex and Cursor Cloud agents run `pnpm db agent up` instead; the rest of the loop is the same.

2. Start the Worker:

   ```bash
   pnpm workers dev
   ```

   The script reads `POSTGRES_URL` from `.env.local`, refuses any host other than `localhost`, `127.0.0.1`, or `::1`, and passes it to Wrangler as `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. The Worker then connects straight to the database; Hyperdrive pooling and caching do not apply locally. It prints the Worker URL. The port is derived from the worktree path (18800–19299), so several worktrees can run at once.

3. Check the Worker:

   ```bash
   curl http://127.0.0.1:<port>/healthz
   # {"ok":true,"versionId":"<local version id>"}
   ```

   Every other path returns 404.

4. Trigger the cron handler (`--test-scheduled` is on):

   ```bash
   curl "http://127.0.0.1:<port>/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"
   ```

   The `*/15` cron runs the heartbeat: `SELECT 1` through the `HYPERDRIVE` binding, the log line `Heartbeat database check passed`, and a Sentry check-in for the `jobs-heartbeat` monitor (Sentry stays off locally because `SENTRY_DSN` is empty). A cron with no job logs `No job for this cron`.

Stop the Worker with Ctrl-C, then `pnpm db stop` when you are done with the database.

Never use `wrangler dev --remote`: it runs against deployed resources and real data.

## Local variables: `.dev.vars`

Variables for the local Worker go in `workers/jobs/.dev.vars` (gitignored; see `workers/jobs/.dev.vars.example`). Restart `pnpm workers dev` after editing it. For example, `JOBS_PAUSED=true` makes the heartbeat log `Jobs paused; heartbeat skipped` instead of querying.

The local (top-level) Wrangler config declares no `secrets.required`, so every key in `.dev.vars` loads. When a key is listed in `secrets.required`, Wrangler loads only the listed keys. Deployed Workers get secrets from the Cloudflare dashboard and the job switches (`JOBS_PAUSED`, `JOB_*_ENABLED`) from **Settings** → **Variables and Secrets**, never from `wrangler.jsonc`.

## Other commands

| Command | What it does |
| --- | --- |
| `pnpm workers check` | Bundles the staging Worker with `wrangler deploy --dry-run` and fails if the bundle contains `next`, `@vercel/*`, `@clerk/*`, or the Vercel `workflow` runtime |
| `pnpm workers types` | Regenerates `workers/jobs/worker-configuration.d.ts` after a `wrangler.jsonc` change (commit the result) |
| `pnpm check:type:workers` | Typechecks the Worker and its unit tests with Workers types (part of `pnpm typecheck`) |

Wrangler always runs from `workers/jobs/`, the same root directory Workers Builds uses.

## Tests

Worker logic is unit-tested with the existing Vitest setup under `tests/unit/workers/` (Node, mocked bindings):

```bash
pnpm vitest run --config vitest.config.ts --project unit tests/unit/workers
```

Workers-runtime behavior is proven with `pnpm workers dev` locally and on staging, not with a second test harness.
