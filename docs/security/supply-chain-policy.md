# Supply-chain policy

**Last updated:** 2026-11-02

Atlaris keeps the pnpm lockfile committed, installs it with `--frozen-lockfile`, and blocks production/high dependency findings. The policy is defined in [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) and uses pnpm 11.9.0:

| Setting | Value | Purpose |
| --- | --- | --- |
| `minimumReleaseAge` | `10080` minutes (7 days) | Holds newly published packages until they have aged. Skipped only on `main` and `hotfix/*` (see [Urgent production hotfix](#urgent-production-hotfix)) |
| `minimumReleaseAgeStrict` | `true` | Fails when only a fresh version satisfies a range |
| `trustPolicy` | `no-downgrade` | Rejects weaker package trust signals |
| `trustPolicyExclude` | Exact package versions | Allows reviewed transitive versions pnpm flags |
| `allowBuilds` | Explicit package map | Controls install scripts by package name |

`pnpm-lock.yaml` remains the source of resolved versions. CI and automation use `pnpm install --frozen-lockfile`; `pnpm audit --prod --audit-level=high` is the blocking vulnerability check.

## Update lanes

### Dependency upgrades are manual

There is no Dependabot configuration and no automatic version-bump PR. Upgrades are deliberate: a person picks the package and version, bumps it in a normal PR, and reviews the lockfile diff. Automatic bumps and auto-merge take new releases without review, which is how npm supply-chain attacks spread.

GitHub's own Dependabot settings are separate from this repo's files. Dependabot alerts only notify; Dependabot security updates open PRs, and GitHub aims those at the default branch (`main`), not `develop` (PR #901 was one). Whether either is enabled is a repository setting and the repo owner's call.

### Security remediation

`.github/workflows/dependency-security-remediation.yml` owns automated security lockfile updates, and its PRs target `develop`. Its **schedule and workflow definition must be present on `main`** because GitHub reads scheduled workflows from the default branch. The workflow also supports `workflow_dispatch` for urgent advisories and validation. Each run:

1. preserves the remediation logic from trusted `main`, then checks out the exact current `develop` SHA and installs with scripts disabled;
2. runs `pnpm audit --prod --audit-level=high` with bounded retries that fail closed on registry/audit infrastructure errors;
3. when findings exist, runs `pnpm audit --prod --audit-level=high --fix=update`, reinstalls frozen, and audits again;
4. rejects residual high/critical findings, unexpected files, or ambiguous version mappings without publishing a PR; and
5. publishes or updates one bot-owned remediation PR targeting `develop` when the validated diff is allowed.

The remediation lane may change `pnpm-lock.yaml` and, only when pnpm adds exact release-age exceptions, `pnpm-workspace.yaml`. It never edits `package.json`, `overrides`, `trustPolicy`, `trustPolicyExclude`, or `allowBuilds`.

If a PR is created with `GITHUB_TOKEN`, GitHub Actions will not start an unattended `pull_request` workflow. CircleCI still receives the PR's `opened` or `synchronize` event through its GitHub App, so bot-branch PR CI is the CircleCI `ci-pr` workflow. The remediation job polls until required status checks are registered on the final bot SHA, then waits with `gh pr checks --required --watch`.

`CODEOWNERS` protects `pnpm-workspace.yaml`, the release-age wrapper under `scripts/ci/`, `vercel.json`, and every workflow/script under `.github`. The active `develop` and `main` rulesets require that code-owner review, so a contributor cannot weaken the write-scoped automation or its CI gate without maintainer approval.

## Merge gates

Only the security-remediation workflow can queue an automatic merge. Every other dependency change needs human review and green required CI.

### Security remediation PRs

A lockfile-only remediation classified as a strict stable patch may be queued for auto-merge by the remediation workflow only after the classifier proves unchanged major/minor versions, increased patches, no fresh exception, and a clean required CI result. Any fresh exception, minor/major/prerelease/nonstandard version, ambiguous mapping, policy-file change, or residual audit result requires a maintainer merge. Unknown audit or registry state is never green for automation.

## Fresh release-age exceptions

Waiting seven days is the default. A security fix younger than seven days may add an **exact** `package@version` entry to `minimumReleaseAgeExclude` only when the advisory cannot safely wait. Automation proves that the selector is exact, is tied to the audited package, and resolves the advisory's fixed version; it does not make the risk-acceptance decision or infer an exact publish time. The entry must not be a package-wide selector, range, or unrelated cleanup.

`pnpm-workspace.yaml` is owned by `@saldanaj97` in `.github/CODEOWNERS`. A fresh exception therefore requires the code-owner approval enforced by the active `develop`/`main` rulesets and can never auto-merge. The PR body lists every exact exception and its advisory evidence, plus a review checklist. Before approving, the code owner must verify the registry publish timestamp, record the release age and why the high/critical exposure cannot wait, and confirm the fixed version. Remove an exception in a later human-reviewed cleanup PR once the release is older than seven days and the frozen-install/audit checks pass.

### Active non-security exception: `tsrs` typecheck

The rule above covers security fixes only. The entries below are a one-off exception the code owner approved for a dev-only tool, and they follow the same controls: exact selectors, code-owner review, and a removal date.

| Field | Value |
| --- | --- |
| Packages | `tsrs@0.18.0-ts7.1.0-dev.20260929`, a direct devDependency, and its five optional platform binaries `@tsrs/{darwin-arm64,linux-x64-gnu,linux-x64-musl,linux-arm64-gnu,linux-arm64-musl}` at the same version |
| `minimumReleaseAgeExclude` | All six exact versions. The registry shows them published 2026-10-19 between 11:09 and 11:25 UTC, so they all pass the seven-day gate after 2026-10-26 11:25 UTC |
| `trustPolicyExclude` | `tsrs@0.18.0-ts7.1.0-dev.20260929` only, because pnpm rejects it with `ERR_PNPM_TRUST_DOWNGRADE`. The package name's history includes three 2024 snapshots from npm user `qidanta` and a 2026-10-10 `0.0.0-bootstrap.0` publish by `boshen`, none with provenance. Every release from `0.12.0` onward, including this one, is published by GitHub Actions trusted publishing from `oxc-project/tsrs` with SLSA v1 provenance |
| Reason | tsrs is the blocking typecheck: `pnpm typecheck` runs it, and so does the `lint-and-type-check` CircleCI job. It replaced `tsc` after the two agreed on develop and both caught deliberate type errors (JCS-168). Nothing in the production build or runtime uses it |
| Removal | Remove the six `minimumReleaseAgeExclude` entries in a cleanup PR after 2026-10-26 11:25 UTC. Remove the `trustPolicyExclude` entry when tsrs is upgraded or dropped. A newer tsrs version needs its own review |

## Manifest-required and otherwise unfixable advisories

`pnpm audit --fix=update` is deliberately a lockfile remediation lane. It does not guess through an advisory that requires a direct `package.json` change, a minor/major compatibility update, a prerelease, or another ambiguous version transition.

When the after-audit remains high/critical, the scheduled run fails without creating or mutating a partial PR and reports the GHSA/advisory ID, package, vulnerable range, patched version when supplied, and whether the package is direct. The dependency-policy owner opens a dedicated `fix(deps): remediate <GHSA>` PR from `develop`, applies the narrowest reviewed manifest or `pnpm up <package>@<version>` change, regenerates the lockfile, and runs frozen install, scoped compatibility checks, and the production/high audit. This work never leaks into the feature PR that happened to encounter the audit. Fresh exceptions still require the code-owner gate above.

### Active accepted advisory: picomatch GHSA-fc5q-39xc-vjpf

When no patched release exists, the code owner may accept one advisory by its exact GHSA ID in `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`. Each entry needs a reason and a removal trigger.

| Field | Value |
| --- | --- |
| Advisory | [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), high: ReDoS through repeated extglobs. It affects picomatch `<=4.0.7`, and 4.0.7 is the latest published release (checked 2026-11-17) |
| Path | `@sentry/nextjs` > `@rollup/plugin-commonjs` (directly, via `@rollup/pluginutils`, and via `fdir`) > picomatch. This is build-time bundling code, and the ReDoS needs attacker-controlled glob patterns |
| Known limitation | `pnpm audit --json` still counts ignored advisories in `metadata.vulnerabilities`, so the remediation parser (`audit-status`) reports `vulnerable` while `pnpm audit` exits 0. Until the parser accounts for ignored IDs, the scheduled remediation run fails closed on `develop` |
| Removal | [DEV-227](https://linear.app/saldana-software/issue/DEV-227). Once picomatch publishes a fix, remove the entry and resolve the patched version |

## Override and exception removal evidence

Override cleanup is a human-owned PR, not another privileged workflow. Start with `kysely`; retain every ambiguous floor. A currently resolved version above an override is not proof that the override is stale.

For each candidate, record:

| Field | Required evidence |
| --- | --- |
| Override | Exact selector and forced range from `pnpm-workspace.yaml` |
| Origin | Advisory or commit that introduced it |
| Current paths | `pnpm why <package> --recursive` and relevant lockfile importers |
| Inbound ranges | Every reachable parent range that could select the package |
| Counterfactual graph | Lockfile regenerated with only this override removed |
| Safety proof | Package is absent, or every inbound range excludes vulnerable versions |
| Verification | `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm audit --prod --audit-level=high` pass |
| Decision | Remove with evidence, or retain with a reason |

The candidate diff must contain only the intended override removal and lockfile consequences. Exact release-age exceptions that have aged out may be removed in the same human-reviewed lane. Do not build an automatic cleanup bot in v1.

### Kysely override removal evidence (August 2026)

- **Override and origin:** `kysely: ^0.28.17`, added in commit `6e085536a` after the optional Drizzle peer could resolve the version affected by GHSA-pv5w-4p9q-p3v2; `0.28.17` is the first fixed Kysely release.
- **Current paths and inbound ranges:** `pnpm why kysely --recursive` returns no installed path. The lockfile contains no Kysely package or snapshot; its only reference is Drizzle's optional peer declaration.
- **Counterfactual graph:** regenerating from the unchanged manifests after removing only this override adds no Kysely package and restores the optional peer range from `^0.28.17` to `*`.
- **Safety proof:** because Kysely is absent from the resolved graph, removing the override cannot reintroduce the advisory into the installed production dependencies.
- **Verification:** `pnpm install --frozen-lockfile --ignore-scripts` succeeds, and `pnpm audit --prod --audit-level=high` reports zero high or critical findings.
- **Decision:** remove the stale floor in this reviewed dependency-automation change; retain all other overrides.

## Urgent production hotfix

The 7-day `minimumReleaseAge` would block a same-day patched release on `main`. For a true production emergency, `scripts/ci/pnpm-release-age.sh <pnpm args>` runs pnpm and, only when the branch is exactly `main` or `hotfix/<name>`, exports `pnpm_config_minimum_release_age=0`. That skips the age rule entirely for that install. The `minimumReleaseAge` value in `pnpm-workspace.yaml` is unchanged, and `trustPolicy: no-downgrade` stays on for every branch.

Every other branch (`develop`, feature branches, an unknown branch) keeps the strict rule, and the wrapper strips any inherited override there, so it fails closed. A PR into any base other than `main` also stays strict, even from a `hotfix/*` branch: CircleCI passes the PR base as `RELEASE_AGE_PR_BASE`, and GitHub Actions provides `GITHUB_BASE_REF`. The branch is read from `CIRCLE_BRANCH`, `VERCEL_GIT_COMMIT_REF`, `WORKERS_CI_BRANCH`, `GITHUB_HEAD_REF`, `GITHUB_REF_NAME` (branch refs only), then `git symbolic-ref`. `--frozen-lockfile` installs and `pnpm fetch` re-check the lockfile against the age rule, so every install on these branches goes through the wrapper. It is wired into the CircleCI `install-pnpm-deps` and `warm-pnpm-cache` steps, the Vercel `installCommand` in `vercel.json`, `.github/workflows/worker-secrets-production.yaml`, and `scripts/dev/bootstrap-worktree.sh`.

Cloudflare Workers Builds for `atlaris-jobs-production` (deploys from `main`) is configured in the dashboard, not the repo. Its build command must be `cd ../.. && sh scripts/ci/pnpm-release-age.sh install --frozen-lockfile`; this is a manual release-owner step (see [cloudflare-jobs-runtime.md](../architecture/cloudflare-jobs-runtime.md)).

### Hotfix flow

1. Branch `hotfix/<name>` from `main`.
2. Bump the patched package: `sh scripts/ci/pnpm-release-age.sh add <pkg>@<version>`, or edit `package.json` or `overrides`.
3. Install with `sh scripts/ci/pnpm-release-age.sh install`. The bypass applies because the branch is `hotfix/*`.
4. Open a PR to `main`. Keep the normal review, CI, and staged Production release gates.

### Getting the fix back to `develop`

`develop` stays strict, so a lockfile entry younger than 7 days fails every install there. Do not wait out the 7 days. When `main` is merged back into `develop`, the merge-back PR (from a non-`hotfix/*` branch; a `hotfix/*` PR into `develop` is strict anyway) adds each lockfile entry younger than 7 days to `minimumReleaseAgeExclude` as an exact `name@version`. The strict install on that branch prints exactly which entries it rejects. Record the reason in the PR body (the hotfix and advisory), and apply the same code-owner review described under [Fresh release-age exceptions](#fresh-release-age-exceptions). Remove those entries in a later PR once the releases are older than 7 days.

Outside this flow, `minimumReleaseAgeExclude` is the only per-version escape hatch. Do not create a permanent main-to-develop dependency sync bot or route routine security PRs to `main`.

## Verification

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm audit --prod --audit-level=high
```

For remediation classifier changes, run `node --test .github/scripts/dependency-remediation.test.mjs`. A clean audit is a no-op; a registry failure, residual high/critical finding, or invalid diff fails closed and does not mutate a bot PR.
