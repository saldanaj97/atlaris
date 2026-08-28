# Supply-chain policy

**Last updated:** 2026-08-03

Atlaris keeps the pnpm lockfile committed, installs it with `--frozen-lockfile`, and blocks production/high dependency findings. The policy is defined in [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) and uses pnpm 11.9.0:

| Setting | Value | Purpose |
| --- | --- | --- |
| `minimumReleaseAge` | `10080` minutes (7 days) | Holds newly published packages until they have aged |
| `minimumReleaseAgeStrict` | `true` | Fails when only a fresh version satisfies a range |
| `trustPolicy` | `no-downgrade` | Rejects weaker package trust signals |
| `trustPolicyExclude` | Exact package versions | Allows reviewed transitive versions pnpm flags |
| `allowBuilds` | Explicit package map | Controls install scripts by package name |

`pnpm-lock.yaml` remains the source of resolved versions. CI and automation use `pnpm install --frozen-lockfile`; `pnpm audit --prod --audit-level=high` is the blocking vulnerability check.

## Update lanes

### Routine version updates

`.github/dependabot.yml` is read from the default branch (`main`) and configures the npm ecosystem at `/` to:

- open weekly version-update PRs against `develop`;
- hold proposed releases for seven days with native Dependabot `cooldown`;
- group patch and minor updates separately; and
- suppress unsolicited major-version PRs.

Feature authors do not regenerate the lockfile solely because a safe routine release is available. Dependabot version PRs still run the required PR CI before merge.

### Security remediation

Native Dependabot security-update PRs are intentionally disabled. GitHub sends native security-update PRs to the repository's default branch (`main`) regardless of `target-branch`; that would bypass the `develop` integration path and require a second sync-back workflow.

Instead, `.github/workflows/dependency-security-remediation.yml` owns security lockfile updates. Its **schedule and workflow definition must be present on `main`** because GitHub reads scheduled workflows from the default branch. The workflow also supports `workflow_dispatch` for urgent advisories and validation. Each run:

1. preserves the remediation logic from trusted `main`, then checks out the exact current `develop` SHA and installs with scripts disabled;
2. runs `pnpm audit --prod --audit-level=high` with bounded retries that fail closed on registry/audit infrastructure errors;
3. when findings exist, runs `pnpm audit --prod --audit-level=high --fix=update`, reinstalls frozen, and audits again;
4. rejects residual high/critical findings, unexpected files, or ambiguous version mappings without publishing a PR; and
5. publishes or updates one bot-owned remediation PR targeting `develop` when the validated diff is allowed.

The remediation lane may change `pnpm-lock.yaml` and, only when pnpm adds exact release-age exceptions, `pnpm-workspace.yaml`. It never edits `package.json`, `overrides`, `trustPolicy`, `trustPolicyExclude`, or `allowBuilds`.

If a PR is created with `GITHUB_TOKEN`, GitHub Actions will not start an unattended `pull_request` workflow. CircleCI still receives the PR's `opened` or `synchronize` event through its GitHub App, so bot-branch PR CI is the CircleCI `ci-pr` workflow. The remediation job polls until required status checks are registered on the final bot SHA, then waits with `gh pr checks --required --watch`.

`CODEOWNERS` protects `pnpm-workspace.yaml`, the Dependabot policy, and every workflow/script under `.github`. The active `develop` and `main` rulesets require that code-owner review, so a contributor cannot weaken the write-scoped automation or its CI gate without maintainer approval.

## Merge gates

### Routine Dependabot patch PRs

The native auto-merge workflow queues (it does not immediately perform) a squash merge only when its identity, metadata, and file gates hold:

- author is exactly `dependabot[bot]` and the base is exactly `develop`;
- Dependabot metadata identifies a stable `version-update:semver-patch` update;
- the PR is not a draft and its API file list is either `pnpm-lock.yaml` alone or exactly `package.json` plus `pnpm-lock.yaml`;
- no workspace, policy, workflow, or other file changed.

GitHub completes that queued merge only after required CI (CircleCI `ci-pr` jobs on the development ruleset) is green on the latest head SHA.

Minor, major, security-remediation, policy, unknown-metadata, and non-allowlisted PRs remain open for human review. The workflow never approves a PR or bypasses required checks.

### Security remediation PRs

A lockfile-only remediation classified as a strict stable patch may enter the same queued auto-merge path only after the classifier proves unchanged major/minor versions, increased patches, no fresh exception, and a clean required CI result. Any fresh exception, minor/major/prerelease/nonstandard version, ambiguous mapping, policy-file change, or residual audit result requires a maintainer merge. Unknown audit or registry state is never green for automation.

## Fresh release-age exceptions

Waiting seven days is the default. A security fix younger than seven days may add an **exact** `package@version` entry to `minimumReleaseAgeExclude` only when the advisory cannot safely wait. Automation proves that the selector is exact, is tied to the audited package, and resolves the advisory's fixed version; it does not make the risk-acceptance decision or infer an exact publish time. The entry must not be a package-wide selector, range, or unrelated cleanup.

`pnpm-workspace.yaml` is owned by `@saldanaj97` in `.github/CODEOWNERS`. A fresh exception therefore requires the code-owner approval enforced by the active `develop`/`main` rulesets and can never auto-merge. The PR body lists every exact exception and its advisory evidence, plus a review checklist. Before approving, the code owner must verify the registry publish timestamp, record the release age and why the high/critical exposure cannot wait, and confirm the fixed version. Remove an exception in a later human-reviewed cleanup PR once the release is older than seven days and the frozen-install/audit checks pass.

## Manifest-required and otherwise unfixable advisories

`pnpm audit --fix=update` is deliberately a lockfile remediation lane. It does not guess through an advisory that requires a direct `package.json` change, a minor/major compatibility update, a prerelease, or another ambiguous version transition.

When the after-audit remains high/critical, the scheduled run fails without creating or mutating a partial PR and reports the GHSA/advisory ID, package, vulnerable range, patched version when supplied, and whether the package is direct. The dependency-policy owner opens a dedicated `fix(deps): remediate <GHSA>` PR from `develop`, applies the narrowest reviewed manifest or `pnpm up <package>@<version>` change, regenerates the lockfile, and runs frozen install, scoped compatibility checks, and the production/high audit. This work never leaks into the feature PR that happened to encounter the audit. Fresh exceptions still require the code-owner gate above.

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

For a true production emergency that cannot wait for `develop` promotion, use the existing manual hotfix process on `main`. Keep the normal review, CI, and deployment gates; then immediately merge the hotfix back to `develop` so the integration branch and future remediation runs contain the fix. Do not create a permanent main-to-develop dependency sync bot or route routine security PRs to `main`.

## Verification

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm audit --prod --audit-level=high
```

For remediation classifier changes, run `node --test .github/scripts/dependency-remediation.test.mjs`. A clean audit is a no-op; a registry failure, residual high/critical finding, or invalid diff fails closed and does not mutate a bot PR.
