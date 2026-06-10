# Supply-chain policy: pnpm `minimumReleaseAge`

## Current decision (2026-06-08)

**Deferred** until the repo completes a coordinated **pnpm 10.16+** (or pnpm 11) toolchain upgrade.

### Rationale

- `minimumReleaseAge` is supported in **pnpm 10.16+** and is configured in **`pnpm-workspace.yaml`** per upstream docs.
- Atlaris currently pins **pnpm 9** in CI (`.github/workflows/ci-pr.yml`, `.github/workflows/ci-trunk.yml`) and stores pnpm settings under the **`pnpm`** key in `package.json`.
- Adding the setting now would be **inert or misleading** on pnpm 9 and could give a false sense of enforcement.

### Intended policy when adopted

| Setting | Value | Notes |
| --- | --- | --- |
| `minimumReleaseAge` | `10080` (7 days) | Blocks installs of packages published within the window |
| `minimumReleaseAgeStrict` | `true` (explicit) | Fail when only fresh versions satisfy semver ranges |
| Config location | `pnpm-workspace.yaml` | After pnpm upgrade; migrate existing `package.json` pnpm config as needed |

### CVE exception workflow

1. Maintainer opens a PR adding the package/version to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.
2. PR description must cite the CVE/advisory and why waiting 7 days is unacceptable.
3. At least one repo maintainer approves the exclusion.
4. Remove the exclusion in a follow-up PR once a stable release clears the age window, unless the exclusion is documented as long-lived.

### Adoption sequence (two PRs)

1. **Toolchain PR:** bump `packageManager`, CI pnpm setup, dev docs, verify `pnpm install --frozen-lockfile` and CI.
2. **Policy PR:** add `pnpm-workspace.yaml` policy, update this doc and `docs/security/security-audit-checklist.md` §20.

### Verification checklist (when adopted)

```bash
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level=high
pnpm check:full
```

Attempt installing a package published within the configured window and confirm it is blocked per strictness settings.
