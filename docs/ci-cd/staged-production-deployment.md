# Staged Production deployment lane

**Audience:** Operators releasing Atlaris to live Production  
**Last Updated:** August 2026

## Why this exists

Local Preview and hosted Preview/Staging cannot fully prove Production target selection, the exact Production build artifact, Production Deployment Protection, Production Vercel Queue/runtime behavior, or final alias assignment.

Before JCS-52 is available, this lane offers a post-push, unaliased rehearsal of a Production-targeted Vercel deployment. It does not govern native `main` alias/domain assignment; only JCS-52's native Vercel Deployment Check enforced by Deployment Protection can gate live alias assignment.

**Unreleased does not mean isolated.** A staged Production deployment uses Production-scoped configuration and may reach real Production Supabase, Clerk, Workflow, email, billing, AI, flags, and other services. Treat every request against the generated URL as a real Production operation.

## Validation layers

| Lane | Purpose | Production domains |
| ---- | ------- | ------------------ |
| Local Preview | Fast local iteration with non-Production services (1Password-backed lane in JCS-50; local product testing / `pnpm dev` until that lands) | Untouched |
| Hosted Preview / Staging | Hosted platform behavior with isolated non-Production services | Untouched |
| **Staged Production proof** | Exact Vercel Production build + Production-scoped config, generated URL only | Unaffected by this unaliased rehearsal |
| Live Production | JCS-52-approved exact candidate | Move automatically only after the required Deployment Check passes |

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

## Deployment gate and transition

JCS-52 will configure one stable, deployment-specific Vercel check enforced by Vercel Deployment Protection. It must operate on the generated URL and exact candidate SHA, reject stale candidates, and let native Vercel Git alias only a passing candidate. The GitHub `Production – atlaris` environment remains for migration and worker workflows only; it is not the live release gate.

Do not use CircleCI PR/trunk jobs as the Deployment Check: they validate code, not the generated deployment URL. Do not run `vercel promote` as the normal release path.

Until JCS-52 is operational:

- native Vercel Git handles branch Preview and `main` Production deployments;
- the trusted local `--skip-domain` proof remains unaliased;
- this repository change is not proof of JCS-52 readiness; and
- this local rehearsal does not gate or alter native `main` alias/domain assignment; only JCS-52's native Vercel Deployment Check enforced by Deployment Protection can gate live alias assignment.

## Prerequisites

- Vercel CLI `53.2.0` is available for the manual proof; the candidate is the exact committed `main` SHA.
- Operator access to inspect deployments, aliases, and Deployment Protection in the Vercel dashboard.
- Hosted Staging acceptance already complete for the same release candidate SHA.
- CircleCI `ci-trunk` for that SHA has succeeded (the workflow still starts on every push to `main`; `integration-tests` / `security-tests` skip when there were no integration-path changes).
- If the release needs new schema, Production migration workflow `expand` is already applied and verified before exercising the staged binary. See [deploy.md](../development/deploy.md) and `.github/workflows/production-db-migrations.yaml`.

## 1. Preflight and migration ordering

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
2. CircleCI `ci-trunk` for the SHA has succeeded (integration/security jobs skip when there were no integration-path changes).
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

## 2. Prove the staged Production candidate

After the exact `main` SHA exists on `origin/main`, an operator may run this trusted post-push, unaliased rehearsal from the clean `main` checkout. It does not gate or precede native Production alias/domain assignment:

```bash
vercel deploy --prod --skip-domain --yes
```

This rehearsal keeps Production environment variables in Vercel and its own deployment unaliased. It does not govern native `main` alias/domain assignment. Do not promote it; only JCS-52's native Vercel Deployment Check enforced by Deployment Protection can gate live alias assignment.

Record:

| Field | Value |
| ----- | ----- |
| Deployment ID | |
| Generated URL | |
| Target environment | Production |
| Exact commit SHA | |
| State (`READY` / `ERROR`) | |
| Native `main` alias/domain state (observed separately) | |

The `--skip-domain` rehearsal deployment has no alias of its own. Native `main` alias/domain state is independent; do not infer traffic control from this rehearsal.

Record the generated URL, deployment ID, `READY` state, Production target, exact SHA/ref from the verified checkout, and aliases. Correlate those fields before smoke.

## 3. Verify the staged artifact

Run a deliberately narrow smoke against the **protected generated URL** only.

Minimum checks:

1. Reachable only through the intended Deployment Protection mechanism (unauthenticated access denied or challenged as configured).
2. Basic read-only surface succeeds (for example the public marketing home page returns a healthy response through protection).
3. Approved controlled test identity can load the expected authenticated surface.
4. Vercel target / environment markers identify the deployment as Production.
5. Record native `main` alias/domain state separately; this rehearsal does not assert or control live routing.
6. Vercel and Sentry evidence can be correlated to the staged deployment ID / URL / SHA.
7. No unexpected workflow, database, billing, email, cron, or maintenance side effects appear.

Separate smoke evidence categories when recording results:

| Evidence | What it proves |
| -------- | -------------- |
| Build success | Artifact compiled and reached `READY` |
| Provider ingress | Request reached the generated URL through protection |
| Vercel / runtime behavior | Production target and runtime path for that deployment |
| Persisted application state | Only if an explicitly approved write test was run |
| Native live-domain assignment | Current alias target observed outside this rehearsal |

Do **not** exercise destructive or scheduled operational paths. Any write-capable Workflow SDK acceptance is a separate, explicitly approved test with a controlled Production test identity, verified terminal state, and clear cleanup ownership.

On failure: do not promote the rehearsal or alter native `main` aliases, preserve deployment/log evidence, and fix forward through a new committed SHA with a new rehearsal.

## 4. Release or abandon

### Release after JCS-52 passes

The approved exact-candidate smoke reports the stable native Vercel Deployment Check. Vercel then aliases the already-built candidate automatically; no CLI promote or rebuild occurs.

After automatic alias assignment:

1. Verify Production aliases moved to the expected deployment.
2. Observe Vercel and Sentry for the defined window below.
3. Wait for old instances to drain.
4. Only then run any approved Production migration `contract` phase (`production-db-migrations.yaml` with confirmation `post-deploy-health-verified`).
5. Document the rollback command used for this release and the post-contract roll-forward constraint when older binaries are no longer schema-compatible.

### Abandon

If verification fails or release approval is declined:

1. Do not promote the rehearsal or alter native `main` aliases.
2. Preserve deployment ID, URL, SHA, logs, and smoke notes.
3. Fix forward on a new committed `main` SHA and create a new rehearsal.

### Rollback after a mistaken release (no destructive DB reversal)

Use the Vercel rollback control to restore a known-good Production deployment rather than reversing database migrations:

```bash
vercel rollback <previous-good-deployment-id-or-url>
```

Do not run destructive database reversal as part of abandon/rollback. After a `contract` migration that removes schema older binaries need, roll forward with a compatible binary instead of restoring dropped grants/columns ad hoc. Feature-specific ordering constraints live in [deploy.md](../development/deploy.md).

## Observation window and stop conditions

After alias assignment (or while diagnosing a staged candidate):

- Watch Vercel deployment status, function/runtime errors, and alias assignment for the release.
- Watch Sentry for new issues correlated to the staged/live deployment SHA.
- Stop and escalate if: Production aliases point at the wrong deployment, error rate or critical Sentry issues rise beyond the release’s accepted baseline, unexpected writes to Production data appear during staged smoke, or Deployment Protection is not enforcing on the generated URL.

Default observation window: keep the operator present through approval, alias verification, instance drain, and any approved `contract` migration. Extend if the release includes high-risk paths (auth, billing, migrations).

## Related docs

- [pipeline-and-deployment-strategy.md](./pipeline-and-deployment-strategy.md)
- [deploy.md](../development/deploy.md)
- [branching-strategy.md](../ci/branching-strategy.md)
- [commands.md](../development/commands.md)
- [environment.md](../development/environment.md)
- Vercel: [Deploying from CLI](https://vercel.com/docs/cli/deploying-from-cli), [Deployment Checks](https://vercel.com/docs/deployment-checks), [Deployment Protection](https://vercel.com/docs/deployment-protection)
