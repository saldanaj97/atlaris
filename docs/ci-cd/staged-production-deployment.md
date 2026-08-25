# Staged Production deployment lane

**Audience:** Operators releasing Atlaris to live Production  
**Last Updated:** August 2026

## Why this exists

Local Preview and hosted Preview/Staging cannot fully prove Production target selection, the exact Production build artifact, Production Deployment Protection, Production Vercel Queue/runtime behavior, or final alias promotion.

This lane creates one Production-targeted Vercel deployment **without** assigning public Production domains, verifies that exact artifact on its protected generated URL, then requires an explicit human promote of the same deployment.

**Unpromoted does not mean isolated.** A staged Production deployment uses Production-scoped configuration and may reach real Production Supabase, Clerk, Workflow, email, billing, AI, flags, and other services. Treat every request against the generated URL as a real Production operation.

## Validation layers

| Lane | Purpose | Production domains |
| ---- | ------- | ------------------ |
| Local Preview | Fast local iteration with non-Production services (1Password-backed lane in JCS-50; local product testing / `pnpm dev` until that lands) | Untouched |
| Hosted Preview / Staging | Hosted platform behavior with isolated non-Production services | Untouched |
| **Staged Production** | Exact Vercel Production build + Production-scoped config, generated URL only | **Must stay on the prior live deployment** |
| Live Production | Explicit promote of the verified staged artifact | Move to the verified deployment |

This lane complements Local Preview and Staging. It does not replace them.

## Safety boundaries

- Never create a staged Production deployment from an uncommitted or dirty worktree.
- The candidate must be one exact, committed `main` SHA. Local `HEAD`, `origin/main`, and the intended release candidate must be identical, and the deployed source must match that SHA.
- Do not pull or materialize Production environment variables into `.env.local`, another plaintext file, logs, CI output, or ticket comments. Use Vercel project Production env vars only. `.env.production.example` documents names with blank values.
- Confirm Standard Deployment Protection covers the generated Production deployment URL before the first smoke.
- Start with read-only / non-destructive checks and an approved controlled test identity.
- Never run reset, seed, fixture, reconciliation, cron, maintenance, retention, bulk email, destructive migration, or cleanup operations as part of this lane.
- Do not use Force Promote as the normal path.
- Do not touch `MAINTENANCE_MODE`.
- Do not call the rollout complete merely because a staged deployment built successfully.

## Deployment Checks decision (v1)

**Decision: manual-only staged promotion.** Do not configure Vercel Deployment Checks for the first version of this lane.

Reasons:

- `.github/workflows/ci-trunk.yml` ignores documentation-only pushes (`paths-ignore` for `docs/**`, `**/*.md`, and related paths). `All Checks Passed (trunk)` is therefore **not** emitted for every Production candidate SHA.
- CircleCI `ci-pr` job statuses validate the pre-merge PR commit, not necessarily the post-merge Production candidate.
- A required check that never starts must not leave Production deployments permanently waiting.

When a later change adds a check:

- Prefer one stable, uniquely named post-deployment check such as `Vercel - atlaris: production-smoke`.
- Run it against the generated deployment URL after `vercel.deployment.ready` for the exact candidate SHA.
- Do not mirror every GitHub CI job into Vercel.
- Do not add `vercel/repository-dispatch/actions/status` unless the design actually uses `repository_dispatch`.
- Keep the local `--skip-domain` path on **explicit human** `vercel promote` even after checks pass.

## Prerequisites

- Vercel CLI installed and authenticated to the Atlaris project (`vercel link` if needed).
- Operator access to inspect deployments, aliases, and Deployment Protection in the Vercel dashboard.
- Hosted Staging acceptance already complete for the same release candidate SHA.
- GitHub checks for that SHA complete where they are expected to run (code pushes emit trunk CI; docs-only pushes may not).
- If the release needs new schema, Production migration workflow `expand` already applied and verified before exercising the staged binary. See [deploy.md](../development/deploy.md) and `.github/workflows/production-db-migrations.yaml`.

## 1. Preflight

From a clean checkout of `main`:

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main

# Exact candidate SHA
git rev-parse HEAD
git rev-parse origin/main

# Fail closed on dirty worktree or SHA mismatch
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
```

Also confirm manually before continuing:

1. Intended release candidate equals that SHA (no local-only commits).
2. Required GitHub checks for the SHA are complete when the push was not docs-only.
3. Hosted Staging acceptance for the same SHA is done.
4. Required Production `expand` migrations (if any) are done.
5. Current Production domain / alias target is recorded so later alias movement can be detected:

```bash
vercel ls --prod
# and/or inspect Production domains / aliases in the Vercel dashboard
```

6. Deployment Protection is active for generated deployment URLs (Standard Protection for Production deployment URLs in the Vercel project).
7. No Production secret values were retrieved or printed.

Stop if any preflight item fails. Do not deploy.

## 2. Create the staged Production deployment

Use the smallest supported Vercel flow. Do not wrap this in a custom deployment framework.

```bash
vercel --prod --skip-domain
```

Record:

| Field | Value |
| ----- | ----- |
| Deployment ID | |
| Generated URL | |
| Target environment | Production |
| Exact commit SHA | |
| State (`READY` / `ERROR`) | |
| Production domains still on previous deployment? | yes / no |

Creating the staged deployment must **not** move any Production domain. If domains moved, treat the run as failed, leave evidence, and do not continue smoke as if this were a sandbox.

Correlate the deployment record to the exact source SHA in Vercel (deployment commit metadata).

## 3. Verify the staged artifact

Run a deliberately narrow smoke against the **protected generated URL** only.

Minimum checks:

1. Reachable only through the intended Deployment Protection mechanism (unauthenticated access denied or challenged as configured).
2. Basic read-only surface succeeds (for example the public marketing home page returns a healthy response through protection).
3. Approved controlled test identity can load the expected authenticated surface.
4. Vercel target / environment markers identify the deployment as Production.
5. Production domains still point to the previous live deployment.
6. Vercel and Sentry evidence can be correlated to the staged deployment ID / URL / SHA.
7. No unexpected workflow, database, billing, email, cron, or maintenance side effects appear.

Separate smoke evidence categories when recording results:

| Evidence | What it proves |
| -------- | -------------- |
| Build success | Artifact compiled and reached `READY` |
| Provider ingress | Request reached the generated URL through protection |
| Vercel / runtime behavior | Production target and runtime path for that deployment |
| Persisted application state | Only if an explicitly approved write test was run |
| Live-domain assignment | Whether public aliases still point at the prior deployment |

Do **not** exercise destructive or scheduled operational paths. Any write-capable Workflow SDK acceptance is a separate, explicitly approved test with a controlled Production test identity, verified terminal state, and clear cleanup ownership.

On failure: leave Production domains on the prior deployment, do not force-promote, preserve deployment/log evidence, and fix forward through a new committed SHA with a new staged candidate.

## 4. Promote or abandon

### Promote (human-approved only)

```bash
vercel promote <deployment-id-or-url>
```

Promotion must target the exact verified deployment and must not rebuild.

After promotion:

1. Verify Production aliases moved to the expected deployment.
2. Observe Vercel and Sentry for the defined window below.
3. Wait for old instances to drain.
4. Only then run any approved Production migration `contract` phase (`production-db-migrations.yaml` with confirmation `post-deploy-health-verified`).
5. Document the rollback command used for this release and the post-contract roll-forward constraint when older binaries are no longer schema-compatible.

### Abandon

If verification fails or promotion is declined:

1. Leave Production domains on the prior deployment.
2. Do not Force Promote.
3. Preserve deployment ID, URL, SHA, logs, and smoke notes.
4. Fix forward on a new committed `main` SHA and create a new staged candidate.

### Rollback after a mistaken promote (no destructive DB reversal)

Prefer promoting a previous known-good Production deployment rather than reversing database migrations:

```bash
vercel promote <previous-good-deployment-id-or-url>
```

Do not run destructive database reversal as part of abandon/rollback. After a `contract` migration that removes schema older binaries need, roll forward with a compatible binary instead of restoring dropped grants/columns ad hoc. Feature-specific ordering constraints live in [deploy.md](../development/deploy.md).

## Observation window and stop conditions

After promotion (or while diagnosing a staged candidate):

- Watch Vercel deployment status, function/runtime errors, and alias assignment for the release.
- Watch Sentry for new issues correlated to the staged/live deployment SHA.
- Stop and escalate if: Production aliases point at the wrong deployment, error rate or critical Sentry issues rise beyond the release’s accepted baseline, unexpected writes to Production data appear during staged smoke, or Deployment Protection is not enforcing on the generated URL.

Default observation window: keep the operator present through promote, alias verification, instance drain, and any approved `contract` migration. Extend if the release includes high-risk paths (auth, billing, migrations).

## Related docs

- [pipeline-and-deployment-strategy.md](./pipeline-and-deployment-strategy.md)
- [deploy.md](../development/deploy.md)
- [branching-strategy.md](../ci/branching-strategy.md)
- [commands.md](../development/commands.md)
- [environment.md](../development/environment.md)
- Vercel: [Deploying from CLI](https://vercel.com/docs/cli/deploying-from-cli), [Deployment Checks](https://vercel.com/docs/deployment-checks), [Deployment Protection](https://vercel.com/docs/deployment-protection)
