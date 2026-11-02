# Jobs Worker local development

The background jobs Worker lives in `workers/jobs/` (Cloudflare Workers, `cf` CLI). `workers/jobs/cloudflare.config.ts` defines the Worker per mode; `workers/jobs/wrangler.config.ts` holds the bundler aliases, tsconfig, and dev-server settings. Locally it runs under `cf dev` (workerd) against this worktree's native Supabase stack, as the local-only `atlaris-jobs` Worker (no `--mode`), which is never deployed. Design and environments: [Cloudflare Workers job runtime](../architecture/cloudflare-jobs-runtime.md).

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

   The script reads `POSTGRES_URL` from `.env.local`, refuses any host other than `localhost`, `127.0.0.1`, or `::1`, and passes it to `cf dev` as `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. The Worker then connects straight to the database; Hyperdrive pooling and caching do not apply locally. It prints the Worker URL; the Worker listens on 127.0.0.1 (`dev.ip` in `wrangler.config.ts`). The port is derived from the worktree path (18800–19299), so several worktrees can run at once.

3. Check the Worker:

   ```bash
   curl http://127.0.0.1:<port>/healthz
   # {"ok":true,"versionId":"<local version id>"}
   ```

   Every other path returns 404.

4. Trigger the cron handler:

   ```bash
   curl "http://127.0.0.1:<port>/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"
   ```

   `/__scheduled` returns 404; use the `/cdn-cgi/local/scheduled` path. The `*/15` cron runs the heartbeat: `SELECT 1` through the `HYPERDRIVE` binding, the log line `Heartbeat database check passed`, and a Sentry check-in for the `jobs-heartbeat` monitor (Sentry stays off locally because `SENTRY_DSN` is empty). A cron with no job logs `No job for this cron`.

Stop the Worker with Ctrl-C, then `pnpm db stop` when you are done with the database.

Never run the Worker against deployed resources: that touches real data. `pnpm workers dev` passes no remote option to `cf dev`.

## Local variables: `.dev.vars`

Variables for the local Worker go in `workers/jobs/.dev.vars` (gitignored; see `workers/jobs/.dev.vars.example`). Restart `pnpm workers dev` after editing it. The job switches are Flagship flags, not `.dev.vars` entries: `cf dev` evaluates them against the local flag store, which starts empty (`wrangler flagship flags pull` seeds it), so locally `jobs-paused` is off and direct research is off.

The local Worker (no `--mode` in `cloudflare.config.ts`) declares no secret bindings, so `.dev.vars` is where its secrets come from. The deployed Workers declare their secrets with `bindings.secret()` in `cloudflare.config.ts`, so a deploy keeps them. Values never come from Git or dashboard plain-text variables; operator secrets are written by [secrets sync](./secrets-sync.md). Set an operator-only Worker secret (such as `JOBS_SIGNING_SECRET_PREVIOUS`) from `workers/jobs/`:

```bash
pnpm exec cf workers secrets update <NAME> --worker atlaris-jobs-<staging|production> --text <value>
```

## Other commands

| Command | What it does |
| --- | --- |
| `pnpm workers check` | Bundle gate: a `wrangler deploy --dry-run` of the staging Worker (`cf` has no bundle metafile) fails if the bundle contains `next`, `@vercel/*`, `@clerk/*`, or the Vercel `workflow` runtime. Startup gate: profiles startup with `cf workers check --mode staging` three times and fails if the best run uses more than 200 ms of CPU (see below) |
| `pnpm workers types` | Runs `cf workers types`, which writes `workers/jobs/.cloudflare/types/index.d.ts` after a `cloudflare.config.ts` change. Commit the result: CI regenerates it and fails on a diff. `cf dev` and `cf workers check` do not rewrite it |
| `pnpm check:type:workers` | Typechecks the Worker and its unit tests with Workers types (part of `pnpm typecheck`) |

`cf` and Wrangler always run from `workers/jobs/`, the same root directory Workers Builds uses; `cf` finds `cloudflare.config.ts` and `wrangler.config.ts` in its working directory.

### Startup CPU budget

Cloudflare rejects a deploy whose top-level code takes longer than 1 second on its validator, with error 10021 ("Script startup exceeded CPU time limit"). Its validator reads far higher than a local profile: at about 116 ms of startup CPU on an Apple Silicon Mac, Workers Builds deploys failed intermittently. The budget in `scripts/workers/cli.ts` (`STARTUP_CPU_BUDGET_MS`) is calibrated on the CircleCI runner, which reads about 3.7 times a Mac (about 127 ms there against about 34 ms on a Mac as of 2026-10-13), so a local pass on a Mac is a weaker signal than the CI gate.

Keep heavy work out of module scope. Load large dependencies that only one job path needs inside the handler with `await import(...)`, as the OpenRouter provider does for the SDK. To see where startup time goes, run `pnpm exec cf workers check --mode staging` from `workers/jobs/` and open the written `worker-startup.cpuprofile` in Chrome DevTools; delete the file afterwards.

## Tests

Worker logic is unit-tested with the existing Vitest setup under `tests/unit/workers/` (Node, mocked bindings):

```bash
SKIP_DB_TEST_SETUP=true NODE_ENV=test pnpm vitest run --config vitest.config.ts --project unit tests/unit/workers
```

Workers-runtime behavior is proven with `pnpm workers dev` locally and on staging, not with a second test harness.
