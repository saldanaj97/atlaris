# Supply-chain policy: pnpm `minimumReleaseAge`

## Current decision (2026-06-24)

**Adopted** with pnpm 10.33.0 and enforced through `pnpm-workspace.yaml`.

### Rationale

- `minimumReleaseAge` is supported in **pnpm 10.16+** and is configured in **`pnpm-workspace.yaml`** per upstream docs.
- Atlaris pins **pnpm 10.33.0** in `package.json` and CI (`.github/workflows/ci-pr.yml`, `.github/workflows/ci-trunk.yml`).
- Package-specific pnpm settings such as overrides and approved build scripts remain under the **`pnpm`** key in `package.json`.

### Intended policy when adopted

| Setting                   | Value                 | Notes                                                   |
| ------------------------- | --------------------- | ------------------------------------------------------- |
| `minimumReleaseAge`       | `10080` (7 days)      | Blocks installs of packages published within the window |
| `minimumReleaseAgeStrict` | `true` (explicit)     | Fail when only fresh versions satisfy semver ranges     |
| `trustPolicy`             | `no-downgrade`        | Refuses packages whose trust signals weaken             |
| Config location           | `pnpm-workspace.yaml` | Shared release-age and trust policy                     |

### CVE exception workflow

1. Maintainer opens a PR adding the package/version to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.
2. PR description must cite the CVE/advisory and why waiting 7 days is unacceptable.
3. At least one repo maintainer approves the exclusion.
4. Remove the exclusion in a follow-up PR once a stable release clears the age window, unless the exclusion is documented as long-lived.

### Verification checklist

```bash
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level=high
pnpm check:full
```

Attempt installing a package published within the configured window and confirm it is blocked per strictness settings.
